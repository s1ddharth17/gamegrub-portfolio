module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id INT NOT NULL PRIMARY KEY,
        push_enabled TINYINT(1) NOT NULL DEFAULT 0,
        booking_reminders TINYINT(1) NOT NULL DEFAULT 1,
        no_show_warnings TINYINT(1) NOT NULL DEFAULT 1,
        session_updates TINYINT(1) NOT NULL DEFAULT 1,
        food_orders TINYINT(1) NOT NULL DEFAULT 1,
        payments TINYINT(1) NOT NULL DEFAULT 1,
        refunds TINYINT(1) NOT NULL DEFAULT 1,
        waitlist TINYINT(1) NOT NULL DEFAULT 1,
        tournaments TINYINT(1) NOT NULL DEFAULT 1,
        timezone_name VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS push_installations (
        installation_id VARCHAR(255) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        platform VARCHAR(16) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        user_agent VARCHAR(500) DEFAULT NULL,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_push_installation_user (user_id, is_active),
        KEY idx_push_installation_active (is_active, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_notifications (
        notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        category VARCHAR(32) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message VARCHAR(1000) NOT NULL,
        deep_link VARCHAR(500) NOT NULL,
        entity_type VARCHAR(24) NOT NULL,
        entity_id VARCHAR(80) NOT NULL,
        idempotency_key VARCHAR(191) NOT NULL,
        push_status VARCHAR(24) NOT NULL DEFAULT 'pending',
        read_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notification_id),
        UNIQUE KEY uq_customer_notification_idempotency (idempotency_key),
        KEY idx_customer_notification_user (user_id, read_at, created_at),
        KEY idx_customer_notification_push (push_status, created_at),
        KEY idx_customer_notification_entity (entity_type, entity_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        delivery_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        notification_id BIGINT UNSIGNED NOT NULL,
        installation_id VARCHAR(255) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        provider_message_id VARCHAR(255) DEFAULT NULL,
        last_error VARCHAR(500) DEFAULT NULL,
        attempted_at DATETIME DEFAULT NULL,
        next_attempt_at DATETIME DEFAULT NULL,
        sent_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (delivery_id),
        UNIQUE KEY uq_notification_installation_delivery (notification_id, installation_id),
        KEY idx_notification_delivery_pending (status, next_attempt_at, delivery_id),
        KEY idx_notification_delivery_installation (installation_id, status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
