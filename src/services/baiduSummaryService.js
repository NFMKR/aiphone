const config = require("../config");
const { getPool } = require("./database");
const { arkChatCompletions } = require("./doubaoArk");

function buildTranscriptText(records) {
  const lines = [];
  for (const r of records) {
    const role = r.role || "";
    const text = r.contextText || r.content || "";
    if (!text) continue;
    const who = role === "speech" ? "机器人" : role === "voice" ? "客户" : role || "未知";
    lines.push(`${who}: ${text}`.trim());
  }
  return lines.join("\n");
}

function safeJsonParse(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toSecondsText(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return "";
  return `${n}秒`;
}

function summaryPrompt({ mobile, talkingTimeLen, transcript }) {
  return [
    {
      role: "system",
      content:
        "你是电话外呼质检与销售总结助手。你必须只输出严格 JSON（不要 Markdown，不要解释，不要多余字符）。字段名必须为中文。",
    },
    {
      role: "user",
      content: [
        "请根据以下通话对话内容，生成一个 summary_json，结构严格如下：",
        "{",
        '  "客户手机号": "138xxxx1234",',
        '  "通话时长": "58秒",',
        '  "意向等级": "高|中|低|无",',
        '  "核心诉求": "一句话",',
        '  "关键异议": "一句话，没有则写空字符串",',
        '  "推荐方案": "一句话",',
        '  "总结结论": "一句话"',
        "}",
        "",
        "要求：",
        "- 如果无法判断意向等级，填“无”",
        "- 不要输出除 JSON 以外的任何内容",
        "",
        `客户手机号: ${mobile || ""}`,
        `通话时长: ${toSecondsText(talkingTimeLen)}`,
        "",
        "对话内容：",
        transcript || "",
      ].join("\n"),
    },
  ];
}

async function getCallForSummary(sessionId) {
  const pool = getPool();
  const [[fact]] = await pool.query(
    `SELECT session_id, tenant_id, member_id, mobile, talking_time_len
     FROM baidu_call_facts
     WHERE session_id = ?
     LIMIT 1`,
    [sessionId],
  );

  if (!fact) return null;

  const [records] = await pool.query(
    `SELECT record_index, role, context_text AS contextText, content
     FROM baidu_call_records
     WHERE session_id = ?
     ORDER BY record_index ASC
     LIMIT ?`,
    [sessionId, config.summary.maxRecords],
  );

  return { fact, records };
}

async function upsertSummaryRow({ sessionId, tenantId, memberId, mobile, model, promptVersion, status, summaryJson, rawResponse, errorMessage }) {
  const pool = getPool();
  const now = new Date();
  await pool.query(
    `INSERT INTO baidu_call_summaries
      (session_id, tenant_id, member_id, mobile, model, prompt_version, summary_json, raw_response, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      tenant_id=VALUES(tenant_id),
      member_id=VALUES(member_id),
      mobile=VALUES(mobile),
      model=VALUES(model),
      prompt_version=VALUES(prompt_version),
      summary_json=VALUES(summary_json),
      raw_response=VALUES(raw_response),
      status=VALUES(status),
      error_message=VALUES(error_message),
      updated_at=VALUES(updated_at)`,
    [
      sessionId,
      tenantId,
      memberId,
      mobile || "",
      model || config.doubaoArk.model,
      promptVersion,
      summaryJson ? JSON.stringify(summaryJson) : null,
      rawResponse ? JSON.stringify(rawResponse) : null,
      status,
      errorMessage || null,
      now,
      now,
    ],
  );
}

async function generateAndStoreSummary(sessionId) {
  const call = await getCallForSummary(sessionId);
  if (!call) throw new Error("找不到该 sessionId 的通话事实/record 数据");

  const { fact, records } = call;
  const transcript = buildTranscriptText(records);
  const messages = summaryPrompt({
    mobile: fact.mobile,
    talkingTimeLen: fact.talking_time_len,
    transcript,
  });

  const model = config.doubaoArk.model;
  const promptVersion = "v1";

  try {
    const resp = await arkChatCompletions({ messages, model });
    const content = resp?.choices?.[0]?.message?.content ?? "";

    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("模型未返回可解析的 JSON");
    }

    // 兜底写入手机号/时长（避免模型漏字段）
    parsed["客户手机号"] = parsed["客户手机号"] || fact.mobile || "";
    parsed["通话时长"] = parsed["通话时长"] || toSecondsText(fact.talking_time_len);

    await upsertSummaryRow({
      sessionId: fact.session_id,
      tenantId: fact.tenant_id,
      memberId: fact.member_id,
      mobile: fact.mobile,
      model,
      promptVersion,
      status: "success",
      summaryJson: parsed,
      rawResponse: resp,
      errorMessage: null,
    });

    return { ok: true, summaryJson: parsed };
  } catch (error) {
    await upsertSummaryRow({
      sessionId: fact.session_id,
      tenantId: fact.tenant_id,
      memberId: fact.member_id,
      mobile: fact.mobile,
      model,
      promptVersion,
      status: "failed",
      summaryJson: null,
      rawResponse: null,
      errorMessage: error.message,
    });
    throw error;
  }
}

async function pickNextPendingSession() {
  const pool = getPool();
  const retryDelayMs = config.summary.retryDelayMs;
  const [rows] = await pool.query(
    `SELECT f.session_id
     FROM baidu_call_facts f
     LEFT JOIN baidu_call_summaries s ON s.session_id = f.session_id
     WHERE
       s.session_id IS NULL
       OR s.status = 'pending'
       OR (
         s.status = 'failed'
         AND s.updated_at <= (NOW(3) - INTERVAL ? MICROSECOND)
       )
     ORDER BY f.received_at DESC
     LIMIT 1`,
    [retryDelayMs * 1000],
  );
  return rows?.[0]?.session_id || null;
}

async function getSummariesByMobile({ mobile, take = 1, skip = 0, beforeId = null }) {
  const pool = getPool();
  const safeTake = Math.max(1, Math.min(50, Number.parseInt(String(take), 10) || 1));
  const safeSkip = Math.max(0, Number.parseInt(String(skip), 10) || 0);
  const safeBeforeId = beforeId ? Number.parseInt(String(beforeId), 10) : null;

  const params = [mobile];
  let where = "s.mobile = ? AND s.status = 'success'";
  if (safeBeforeId && Number.isFinite(safeBeforeId)) {
    where += " AND s.id < ?";
    params.push(safeBeforeId);
  }

  // 最新优先：按 id 倒序（id 单调递增，适合“上一条/下一条”语音拉取场景）
  const [rows] = await pool.query(
    `SELECT
        s.id,
        s.session_id,
        s.mobile,
        s.summary_json,
        s.model,
        s.prompt_version,
        s.created_at,
        s.updated_at,
        f.member_id,
        f.tenant_id,
        f.talking_time_len,
        f.end_type,
        f.start_time,
        f.end_time
     FROM baidu_call_summaries s
     LEFT JOIN baidu_call_facts f ON f.session_id = s.session_id
     WHERE ${where}
     ORDER BY s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeTake, safeSkip],
  );

  return rows;
}

module.exports = {
  generateAndStoreSummary,
  pickNextPendingSession,
  getSummariesByMobile,
};

