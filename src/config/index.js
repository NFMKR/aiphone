const path = require("path");

require("dotenv").config({
  path: path.resolve(process.cwd(), ".env"),
});

function requireEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value !== undefined && value !== "") {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`缺少环境变量: ${name}`);
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number.parseInt(process.env.PORT || "3000", 10),
  bodyLimit: process.env.BODY_LIMIT || "10mb",

  mysql: {
    host: requireEnv("MYSQL_HOST"),
    port: Number.parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE"),
    waitForConnections: true,
    connectionLimit: Number.parseInt(process.env.MYSQL_POOL_LIMIT || "10", 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  },

  baiduCallback: {
    queueMaxSize: Number.parseInt(process.env.BAIDU_CB_QUEUE_MAX || "5000", 10),
    batchSize: Number.parseInt(process.env.BAIDU_CB_BATCH_SIZE || "50", 10),
    flushIntervalMs: Number.parseInt(process.env.BAIDU_CB_FLUSH_MS || "200", 10),
  },

  doubaoArk: {
    baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: process.env.ARK_API_KEY || "",
    model: process.env.ARK_MODEL || "doubao-seed-2.0-pro",
    timeoutMs: Number.parseInt(process.env.ARK_TIMEOUT_MS || "20000", 10),
  },

  summary: {
    enabled: (process.env.SUMMARY_ENABLED || "false").toLowerCase() === "true",
    concurrency: Number.parseInt(process.env.SUMMARY_CONCURRENCY || "1", 10),
    pollIntervalMs: Number.parseInt(process.env.SUMMARY_POLL_MS || "2000", 10),
    maxRecords: Number.parseInt(process.env.SUMMARY_MAX_RECORDS || "120", 10),
    retryDelayMs: Number.parseInt(process.env.SUMMARY_RETRY_DELAY_MS || "60000", 10),
  },
};

module.exports = config;
