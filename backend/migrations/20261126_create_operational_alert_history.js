module.exports = {
  description: "Persist operational alert history, delivery state, and shared cooldown claims.",
  transaction: false,
  async up({ connection, logger }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS operational_alert_cooldowns (
        alert_key VARCHAR(120) NOT NULL PRIMARY KEY,
        last_alert_at DATETIME(3) NOT NULL,
        alert_id CHAR(36) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS operational_alert_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        alert_id CHAR(36) NOT NULL,
        alert_key VARCHAR(120) NOT NULL,
        alert_type VARCHAR(80) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        service VARCHAR(80) NOT NULL,
        environment VARCHAR(80) NOT NULL,
        occurred_at DATETIME(3) NOT NULL,
        summary VARCHAR(500) NOT NULL,
        request_id VARCHAR(128) DEFAULT NULL,
        job_run_id VARCHAR(128) DEFAULT NULL,
        details_json LONGTEXT DEFAULT NULL,
        delivery_status VARCHAR(20) NOT NULL,
        delivery_error_code VARCHAR(80) DEFAULT NULL,
        delivered_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_operational_alert_history_id (alert_id),
        KEY idx_operational_alert_history_occurred (occurred_at, id),
        KEY idx_operational_alert_history_key_occurred (alert_key, occurred_at),
        KEY idx_operational_alert_history_delivery (delivery_status, occurred_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    logger.info("migration_tables_checked", {
      table_names: ["operational_alert_cooldowns", "operational_alert_history"],
    });
  },
};
