const config = require("../config");
const { pickNextPendingSession, generateAndStoreSummary } = require("./baiduSummaryService");

let running = false;
let inFlight = 0;

async function tickOnce() {
  if (!config.summary.enabled) return;
  if (inFlight >= config.summary.concurrency) return;

  const sessionId = await pickNextPendingSession();
  if (!sessionId) return;

  inFlight += 1;
  try {
    await generateAndStoreSummary(sessionId);
    // eslint-disable-next-line no-console
    console.log(`[summary] generated: ${sessionId}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[summary] failed: ${sessionId} - ${error.message}`);
  } finally {
    inFlight -= 1;
  }
}

function startSummaryWorker() {
  if (running) return;
  running = true;

  setInterval(() => {
    tickOnce().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[summary] tick error:", e);
    });
  }, config.summary.pollIntervalMs).unref?.();
}

module.exports = { startSummaryWorker };

