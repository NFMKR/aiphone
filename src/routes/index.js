const express = require("express");
const healthRoutes = require("./health.routes");
const apiRoutes = require("./api.routes");
const baiduCallbackRoutes = require("./baiduCallback.routes");
const summaryRoutes = require("./summary.routes");

function mountRoutes(app) {
  app.use("/health", healthRoutes);
  app.use("/api", apiRoutes);
  app.use("/callbacks/baidu", baiduCallbackRoutes);
  app.use("/summaries", summaryRoutes);
}

module.exports = { mountRoutes };
