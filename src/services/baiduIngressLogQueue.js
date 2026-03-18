const config = require("../config");
const { getPool } = require("./database");

const queue = [];
let flushing = false;
let timer = null;

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    flush().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[baidu-ingress] flush error:", error);
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

function enqueueIngressLog(item) {
  ensureTimer();
  if (queue.length >= config.baiduCallback.queueMaxSize) {
    queue.shift();
  }
  queue.push(item);
}

async function flush() {
  if (flushing) return;
  if (queue.length === 0) {
    stopTimerIfIdle();
    return;
  }
  flushing = true;

  try {
    const batchSize = Math.min(200, config.baiduCallback.batchSize * 2);
    const items = queue.splice(0, Math.min(batchSize, queue.length));

    const pool = getPool();
    const sql = `
      INSERT INTO baidu_callback_ingress_logs
        (path, content_type, remote_ip, headers_json, body_json, received_at)
      VALUES ?
    `;

    const values = items.map((i) => [
      i.path || "",
      i.contentType || "",
      i.remoteIp || "",
      JSON.stringify(i.headers || {}),
      JSON.stringify(i.body || null),
      i.receivedAt,
    ]);

    await pool.query(sql, [values]);
  } finally {
    flushing = false;
    if (queue.length === 0) stopTimerIfIdle();
  }
}

module.exports = {
  enqueueIngressLog,
  flush,
};

