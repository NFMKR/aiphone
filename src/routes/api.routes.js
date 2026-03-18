const express = require("express");

const router = express.Router();

router.get("/", (_request, response) => {
  response.json({
    message: "API 根路径，后续在此挂载业务路由",
    version: "1.0.0",
  });
});

module.exports = router;
