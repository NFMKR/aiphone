-- MySQL 5.7
-- 百度回调入站原始日志（用于排查回调 content-type / body 格式差异）

CREATE TABLE IF NOT EXISTS `baidu_callback_ingress_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `path` VARCHAR(255) NOT NULL DEFAULT '',
  `content_type` VARCHAR(255) NOT NULL DEFAULT '',
  `remote_ip` VARCHAR(64) NOT NULL DEFAULT '',
  `headers_json` JSON NOT NULL,
  `body_json` JSON NULL,
  `received_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_received_at` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

