const { pingDatabase } = require("../services/database");

async function getHealth(_request, response) {
  response.status(200).json({
    ok: true,
    service: "aiphone-api",
    timestamp: new Date().toISOString(),
  });
}

async function getHealthDatabase(_request, response) {
  try {
    await pingDatabase();
    response.status(200).json({
      ok: true,
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      database: "unavailable",
      message: process.env.NODE_ENV === "production" ? "数据库不可用" : error.message,
    });
  }
}

module.exports = {
  getHealth,
  getHealthDatabase,
};
