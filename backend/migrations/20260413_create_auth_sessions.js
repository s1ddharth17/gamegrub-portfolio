module.exports = {
  description: "Create tracked auth sessions for refresh tokens and logout revocation.",
  transaction: false,
  async up({ connection, logger }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id CHAR(36) NOT NULL UNIQUE,
        actor_type VARCHAR(20) NOT NULL,
        actor_id BIGINT UNSIGNED NOT NULL,
        refresh_token_hash CHAR(64) NOT NULL UNIQUE,
        refresh_expires_at DATETIME NOT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_ip VARCHAR(64) DEFAULT NULL,
        last_seen_ip VARCHAR(64) DEFAULT NULL,
        last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_refreshed_at DATETIME DEFAULT NULL,
        revoked_at DATETIME DEFAULT NULL,
        revoke_reason VARCHAR(80) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_auth_sessions_actor (actor_type, actor_id, revoked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    logger.info("migration_table_checked", { table_name: "auth_sessions" });
  },
};
