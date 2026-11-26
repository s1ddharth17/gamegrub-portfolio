module.exports = {
  description: "Create persistent cron run tracking for scheduler health and operational visibility.",
  transaction: false,
  async up({ connection, logger }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        engine_name VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL,
        trigger_source VARCHAR(40) NOT NULL,
        scheduler_mode VARCHAR(30) NOT NULL,
        runner_id CHAR(36) NOT NULL,
        lock_name VARCHAR(80) DEFAULT NULL,
        summary_json LONGTEXT DEFAULT NULL,
        error_message VARCHAR(500) DEFAULT NULL,
        error_code VARCHAR(80) DEFAULT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME DEFAULT NULL,
        duration_ms INT UNSIGNED DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_cron_job_runs_engine_started (engine_name, started_at),
        KEY idx_cron_job_runs_engine_status_started (engine_name, status, started_at),
        KEY idx_cron_job_runs_runner (runner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    logger.info("migration_table_checked", { table_name: "cron_job_runs" });
  },
};
