const express = require("express");
const { baiduCallbackController } = require("../controllers");

const router = express.Router();

// 任务单通电话回调（callbackType=0）
router.post("/task-call", baiduCallbackController.handleTaskCallCallback);

module.exports = router;

