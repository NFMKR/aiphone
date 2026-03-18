const mysql = require("mysql2/promise");
const config = require("../config");

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: config.mysql.waitForConnections,
      connectionLimit: config.mysql.connectionLimit,
      queueLimit: config.mysql.queueLimit,
      enableKeepAlive: config.mysql.enableKeepAlive,
      keepAliveInitialDelay: config.mysql.keepAliveInitialDelay,
    });
  }
  return pool;
}

async function pingDatabase() {
  const connectionPool = getPool();
  const connection = await connectionPool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  pingDatabase,
  closePool,
};
