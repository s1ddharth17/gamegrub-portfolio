module.exports = {
  async up({ connection, logger }) {
    logger.info("creating_tournament_notifications");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_notification_campaigns (
        campaign_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT NOT NULL,
        event_type VARCHAR(64) NOT NULL DEFAULT 'announcement',
        recipient_scope VARCHAR(32) NOT NULL DEFAULT 'all_registered',
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        send_email TINYINT(1) NOT NULL DEFAULT 0,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tournament_notification_campaign_tournament (tournament_id, created_at),
        KEY idx_tournament_notification_campaign_event (event_type, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_notifications (
        notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        tournament_id INT NOT NULL,
        registration_id INT NULL,
        user_id INT NOT NULL,
        event_type VARCHAR(64) NOT NULL DEFAULT 'announcement',
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        email_status VARCHAR(32) NOT NULL DEFAULT 'skipped',
        email_attempted_at DATETIME NULL,
        emailed_at DATETIME NULL,
        email_error VARCHAR(255) NULL,
        read_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tournament_notification_user (user_id, read_at, created_at),
        KEY idx_tournament_notification_tournament (tournament_id, created_at),
        KEY idx_tournament_notification_campaign (campaign_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
