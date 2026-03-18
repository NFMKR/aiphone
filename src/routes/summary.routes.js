const express = require("express");
const { summaryController } = require("../controllers");

const router = express.Router();

// 手动触发某次通话总结（用于补历史）
router.post("/baidu/:sessionId/generate", summaryController.generateSummaryForSession);

// 获取某手机号的总结（最新/上一条/指定条数）
// 示例：
// - 最新 1 条：GET /summaries/baidu/mobile/138xxxx1234?take=1
// - 最新 2 条：GET /summaries/baidu/mobile/138xxxx1234?take=2
// - 上一条：先拿 items[0].id，再 GET ...?beforeId=<id>&take=1
router.get("/baidu/mobile/:mobile", summaryController.getSummariesForMobile);

module.exports = router;

