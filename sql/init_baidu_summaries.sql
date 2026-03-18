-- MySQL 5.7
-- 通话总结结果表（豆包模型生成）

CREATE TABLE IF NOT EXISTS `baidu_call_summaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(128) NOT NULL,
  `tenant_id` BIGINT NOT NULL,
  `member_id` BIGINT NOT NULL,
  `mobile` VARCHAR(64) NOT NULL DEFAULT '',
  `model` VARCHAR(128) NOT NULL DEFAULT '',
  `prompt_version` VARCHAR(32) NOT NULL DEFAULT 'v1',
  `summary_json` JSON NULL,
  `raw_response` JSON NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending|success|failed
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_status_updated` (`status`, `updated_at`),
  KEY `idx_member` (`member_id`),
  KEY `idx_mobile` (`mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

