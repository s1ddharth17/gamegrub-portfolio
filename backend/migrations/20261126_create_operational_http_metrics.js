module.exports = {
  description: "Persist HTTP metric buckets and recent server error samples for operations dashboards.",
  transaction: false,
  async up({ connection, logger }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS operational_http_minute_metrics (
        minute_start DATETIME NOT NULL,
        instance_id CHAR(36) NOT NULL,
        status_code SMALLINT UNSIGNED NOT NULL,
        request_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        duration_total_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (minute_start, instance_id, status_code),
        KEY idx_operational_http_metrics_minute (minute_start)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS operational_http_error_samples (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        occurred_at DATETIME(3) NOT NULL,
        request_id VARCHAR(128) DEFAULT NULL,
        method VARCHAR(10) NOT NULL,
        route VARCHAR(180) NOT NULL,
        status_code SMALLINT UNSIGNED NOT NULL,
        duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_operational_http_errors_occurred (occurred_at, id),
        KEY idx_operational_http_errors_request (request_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    logger.info("migration_tables_checked", {
      table_names: ["operational_http_minute_metrics", "operational_http_error_samples"],
    });
  },
};
