const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const config = require("./src/config");
const { mountRoutes } = require("./src/routes");
const { closePool } = require("./src/services/database");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

mountRoutes(app);

app.use((_request, response) => {
  response.status(404).json({ ok: false, message: "Not Found" });
});

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode || error.status || 500;
  response.status(statusCode).json({
    ok: false,
    message: config.nodeEnv === "production" ? "服务器错误" : error.message,
  });
});

const server = http.createServer(app);

server.listen(config.port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on 0.0.0.0:${config.port} (${config.nodeEnv})`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, closing...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
