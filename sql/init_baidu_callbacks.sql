-- MySQL 5.7
-- 百度智能外呼：任务单通电话回调落库表（原始 payload + 关键字段索引）

CREATE TABLE IF NOT EXISTS `baidu_outbound_task_call_callbacks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `callback_type` TINYINT NOT NULL,
  `session_id` VARCHAR(128) NOT NULL,
  `tenant_id` BIGINT NOT NULL,
  `task_id` VARCHAR(64) NOT NULL,
  `task_name` VARCHAR(255) NOT NULL DEFAULT '',
  `robot_id` VARCHAR(64) NOT NULL DEFAULT '',
  `robot_name` VARCHAR(255) NOT NULL DEFAULT '',
  `member_id` BIGINT NOT NULL,
  `mobile` VARCHAR(64) NOT NULL DEFAULT '',
  `end_type` INT NOT NULL,
  `payload` JSON NOT NULL,
  `received_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_callback_session` (`callback_type`, `session_id`),
  KEY `idx_task_member` (`task_id`, `member_id`),
  KEY `idx_mobile` (`mobile`),
  KEY `idx_received_at` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

