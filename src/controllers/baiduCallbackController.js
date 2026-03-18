const { enqueueTaskCall } = require("../services/baiduCallbackQueue");
const { enqueueIngressLog } = require("../services/baiduIngressLogQueue");

function badRequest(response, msg) {
  return response.status(400).json({ code: 400, msg });
}

function okSuccess(response, memberId = null) {
  return response.status(200).json({
    code: 200,
    msg: "success",
    data: memberId ? { memberId } : {},
  });
}

function normalizeBody(request) {
  const body = request.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

function toInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function requiredString(obj, key) {
  const v = obj?.[key];
  if (typeof v !== "string" || v.trim() === "") return null;
  return v;
}

function requiredNumberLike(obj, key) {
  const v = obj?.[key];
  const n = toInt(v);
  if (n === null) return null;
  return n;
}

function tryParseJsonString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * 百度客悦：任务单通电话回调（callbackType=0）
 * 文档：`https://cloud.baidu.com/doc/ky/s/jmfnjplck`
 */
async function handleTaskCallCallback(request, response) {
  const body = normalizeBody(request);
  enqueueIngressLog({
    path: request.originalUrl || request.url,
    contentType: request.headers["content-type"],
    remoteIp: request.ip,
    headers: request.headers,
    body: body ?? request.body,
    receivedAt: new Date(),
  });

  // 注意：外部回调高峰期不建议用 4xx 触发重试风暴；这里“解析失败也返回 200”，同时入站日志落库方便排查。
  if (!body || typeof body !== "object") return okSuccess(response);

  const callbackType = requiredNumberLike(body, "callbackType");
  // 文档：0-任务单通电话回调；3-实时呼叫单通电话回调
  if (callbackType !== 0 && callbackType !== 3) {
    return okSuccess(response);
  }

  const data = tryParseJsonString(body?.data);
  if (!data || typeof data !== "object") {
    return okSuccess(response);
  }

  const sessionId = requiredString(data, "sessionId");
  const taskId = requiredString(data, "taskId") || "";
  const taskName = requiredString(data, "taskName") || "";
  const robotId = requiredString(data, "robotId") || "";
  const robotName = requiredString(data, "robotName") || "";
  const mobile = requiredString(data, "mobile") || "";

  // 有些回调 tenantId 可能出现在根级（body.tenantId），这里做兜底
  const tenantId = requiredNumberLike(data, "tenantId") ?? requiredNumberLike(body, "tenantId");
  const memberId = requiredNumberLike(data, "memberId");
  const endType = requiredNumberLike(data, "endType");

  if (!sessionId) return okSuccess(response);
  if (!tenantId) return okSuccess(response);
  // callbackType=0 强依赖 taskId；callbackType=3 可能没有 taskId/taskName
  if (callbackType === 0 && !taskId) return okSuccess(response);
  if (!memberId) return okSuccess(response);
  if (endType === null) return okSuccess(response);

  enqueueTaskCall({
    callbackType,
    sessionId,
    tenantId,
    taskId,
    taskName,
    robotId,
    robotName,
    memberId,
    mobile,
    endType,
    receivedAt: new Date(),
    raw: body,
  });

  return okSuccess(response, memberId);
}

module.exports = {
  handleTaskCallCallback,
};

