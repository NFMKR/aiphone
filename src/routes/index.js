const express = require("express");
const healthRoutes = require("./health.routes");
const apiRoutes = require("./api.routes");

function mountRoutes(app) {
  app.use("/health", healthRoutes);
  app.use("/api", apiRoutes);
}

module.exports = { mountRoutes };
