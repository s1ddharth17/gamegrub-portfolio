module.exports = {
  async up({ connection, logger }) {
    logger.info("creating_tournament_registrations_table");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_registrations (
        registration_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT NOT NULL,
        user_id INT NOT NULL,
        registration_type VARCHAR(32) NOT NULL DEFAULT 'solo',
        status VARCHAR(32) NOT NULL DEFAULT 'registered',
        participant_name VARCHAR(120) NOT NULL,
        participant_email VARCHAR(191) NOT NULL,
        participant_mobile VARCHAR(32) NULL,
        cancelled_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_registrations_user (tournament_id, user_id),
        KEY idx_tournament_registrations_tournament_status (tournament_id, status),
        KEY idx_tournament_registrations_user_status (user_id, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
