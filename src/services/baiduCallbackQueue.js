const config = require("../config");
const { getPool } = require("./database");

/**
 * 设计目标：请求线程快速返回；后台批量入库。
 * MySQL 5.7 JSON 字段可用，使用 ON DUPLICATE KEY 实现幂等（callbackType + sessionId）。
 */

const queue = [];
let flushing = false;
let timer = null;

function normalizeEpochToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // 微秒级（> 1e14）转毫秒
  if (n > 1e14) return Math.floor(n / 1000);
  // 毫秒级（> 1e11）保持
  if (n > 1e11) return Math.floor(n);
  // 秒级（> 1e9）转毫秒
  if (n > 1e9) return Math.floor(n * 1000);
  return null;
}

function toDateFromEpoch(value) {
  const ms = normalizeEpochToMs(value);
  if (ms === null) return null;
  return new Date(ms);
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function extractFactColumns(item) {
  const data = item.raw?.data || {};
  return {
    callbackType: item.callbackType,
    sessionId: item.sessionId,
    tenantId: item.tenantId,
    taskId: item.taskId || "",
    taskName: item.taskName || "",
    robotId: item.robotId || "",
    robotName: item.robotName || "",
    memberId: item.memberId,
    mobile: item.mobile || "",
    callerNum: toNullableString(data.callerNum),
    endType: item.endType,
    endTypeReason: toNullableString(data.endTypeReason),
    sipCode: toNullableString(data.sipCode),
    sipInfo: toNullableString(data.sipInfo),
    intent: toNullableString(data.intent),
    callTimes: toNullableInt(data.callTimes),
    callType: toNullableInt(data.callType),
    durationTimeLen: toNullableInt(data.durationTimeLen),
    ringingTimeLen: toNullableInt(data.ringingTimeLen),
    talkingTimeLen: toNullableInt(data.talkingTimeLen),
    robotTalkingTimeLen: toNullableInt(data.robotTalkingTimeLen),
    startTime: toDateFromEpoch(data.startTime),
    ringStartTime: toDateFromEpoch(data.ringStartTime),
    talkingStartTime: toDateFromEpoch(data.talkingStartTime),
    endTime: toDateFromEpoch(data.endTime),
  };
}

function extractRecords(item) {
  const data = item.raw?.data || {};
  const list = Array.isArray(data.record) ? data.record : [];
  const createdAt = item.receivedAt;

  return list.map((r, idx) => ({
    sessionId: item.sessionId,
    recordIndex: idx,
    role: toNullableString(r.role),
    timestampUs: (() => {
      const n = Number(r.timestamp);
      if (!Number.isFinite(n)) return null;
      // 文档写“微秒”，但实际可能是毫秒；这里统一保留原数值
      return Math.floor(n);
    })(),
    contextText: r.contextText ?? null,
    content: r.content ?? null,
    intent: toNullableString(r.intent),
    start: toNullableString(r.start),
    stop: toNullableString(r.stop),
    timeLenMs: (() => {
      const n = Number(r.timeLen);
      return Number.isFinite(n) ? Math.floor(n) : null;
    })(),
    interrupted: r.interrupted === undefined ? null : r.interrupted ? 1 : 0,
    interruptedTime: toNullableString(r.interruptedTime),
    silent: r.silent === undefined ? null : r.silent ? 1 : 0,
    sn: toNullableString(r.sn),
    nodeInfo: r.nodeInfo ?? null,
    createdAt,
  }));
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    flush().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[baidu-callback] flush error:", error);
    });
  }, config.baiduCallback.flushIntervalMs);
  timer.unref?.();
}

function stopTimerIfIdle() {
  if (queue.length > 0) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function enqueueTaskCall(payload) {
  ensureTimer();

  if (queue.length >= config.baiduCallback.queueMaxSize) {
    // 队列爆了：保留最新的数据，丢弃最旧的，避免无限占用内存
    queue.shift();
  }
  queue.push(payload);
}

async function flush() {
  if (flushing) return;
  if (queue.length === 0) {
    stopTimerIfIdle();
    return;
  }
  flushing = true;

  try {
    const batchSize = config.baiduCallback.batchSize;
    const items = queue.splice(0, Math.min(batchSize, queue.length));

    const pool = getPool();
    const sqlRaw = `
      INSERT INTO baidu_outbound_task_call_callbacks
        (callback_type, session_id, tenant_id, task_id, task_name, robot_id, robot_name, member_id, mobile, end_type, payload, received_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        tenant_id=VALUES(tenant_id),
        task_id=VALUES(task_id),
        task_name=VALUES(task_name),
        robot_id=VALUES(robot_id),
        robot_name=VALUES(robot_name),
        member_id=VALUES(member_id),
        mobile=VALUES(mobile),
        end_type=VALUES(end_type),
        payload=VALUES(payload),
        updated_at=VALUES(updated_at)
    `;

    const rawValues = items.map((item) => [
      item.callbackType,
      item.sessionId,
      item.tenantId,
      item.taskId,
      item.taskName,
      item.robotId,
      item.robotName,
      item.memberId,
      item.mobile,
      item.endType,
      JSON.stringify(item.raw),
      item.receivedAt,
      item.receivedAt,
    ]);

    await pool.query(sqlRaw, [rawValues]);

    // 结构化事实表（session_id 幂等）
    const sqlFacts = `
      INSERT INTO baidu_call_facts
        (callback_type, session_id, tenant_id, task_id, task_name, robot_id, robot_name, member_id, mobile, caller_num, end_type, end_type_reason, sip_code, sip_info, intent,
         call_times, call_type, duration_time_len, ringing_time_len, talking_time_len, robot_talking_time_len,
         start_time, ring_start_time, talking_start_time, end_time,
         received_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        callback_type=VALUES(callback_type),
        tenant_id=VALUES(tenant_id),
        task_id=VALUES(task_id),
        task_name=VALUES(task_name),
        robot_id=VALUES(robot_id),
        robot_name=VALUES(robot_name),
        member_id=VALUES(member_id),
        mobile=VALUES(mobile),
        caller_num=VALUES(caller_num),
        end_type=VALUES(end_type),
        end_type_reason=VALUES(end_type_reason),
        sip_code=VALUES(sip_code),
        sip_info=VALUES(sip_info),
        intent=VALUES(intent),
        call_times=VALUES(call_times),
        call_type=VALUES(call_type),
        duration_time_len=VALUES(duration_time_len),
        ringing_time_len=VALUES(ringing_time_len),
        talking_time_len=VALUES(talking_time_len),
        robot_talking_time_len=VALUES(robot_talking_time_len),
        start_time=VALUES(start_time),
        ring_start_time=VALUES(ring_start_time),
        talking_start_time=VALUES(talking_start_time),
        end_time=VALUES(end_time),
        updated_at=VALUES(updated_at)
    `;

    const factValues = items.map((item) => {
      const f = extractFactColumns(item);
      return [
        f.callbackType,
        f.sessionId,
        f.tenantId,
        f.taskId,
        f.taskName,
        f.robotId,
        f.robotName,
        f.memberId,
        f.mobile,
        f.callerNum,
        f.endType,
        f.endTypeReason,
        f.sipCode,
        f.sipInfo,
        f.intent,
        f.callTimes,
        f.callType,
        f.durationTimeLen,
        f.ringingTimeLen,
        f.talkingTimeLen,
        f.robotTalkingTimeLen,
        f.startTime,
        f.ringStartTime,
        f.talkingStartTime,
        f.endTime,
        item.receivedAt,
        item.receivedAt,
      ];
    });

    await pool.query(sqlFacts, [factValues]);

    // record 明细表（每通电话按 record_index 幂等）
    const allRecords = items.flatMap((item) => extractRecords(item));
    if (allRecords.length > 0) {
      const sqlRecords = `
        INSERT INTO baidu_call_records
          (session_id, record_index, role, timestamp_us, context_text, content, intent, start, stop, time_len_ms,
           interrupted, interrupted_time, silent, sn, node_info, created_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          role=VALUES(role),
          timestamp_us=VALUES(timestamp_us),
          context_text=VALUES(context_text),
          content=VALUES(content),
          intent=VALUES(intent),
          start=VALUES(start),
          stop=VALUES(stop),
          time_len_ms=VALUES(time_len_ms),
          interrupted=VALUES(interrupted),
          interrupted_time=VALUES(interrupted_time),
          silent=VALUES(silent),
          sn=VALUES(sn),
          node_info=VALUES(node_info)
      `;

      const recordValues = allRecords.map((r) => [
        r.sessionId,
        r.recordIndex,
        r.role,
        r.timestampUs,
        r.contextText,
        r.content,
        r.intent,
        r.start,
        r.stop,
        r.timeLenMs,
        r.interrupted,
        r.interruptedTime,
        r.silent,
        r.sn,
        r.nodeInfo,
        r.createdAt,
      ]);

      await pool.query(sqlRecords, [recordValues]);
    }
  } finally {
    flushing = false;
    if (queue.length === 0) {
      stopTimerIfIdle();
    }
  }
}

module.exports = {
  enqueueTaskCall,
  flush,
};

