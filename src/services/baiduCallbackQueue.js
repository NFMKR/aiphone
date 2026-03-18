const config = require("../config");
const { getPool } = require("./database");

/**
 * 设计目标：请求线程快速返回；后台批量入库。
 * MySQL 5.7 JSON 字段可用，使用 ON DUPLICATE KEY 实现幂等（callbackType + sessionId）。
 */

const queue = [];
let flushing = false;
let timer = null;

function nowSql() {
  return new Date();
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
    const sql = `
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

    const values = items.map((item) => [
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

    await pool.query(sql, [values]);
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

