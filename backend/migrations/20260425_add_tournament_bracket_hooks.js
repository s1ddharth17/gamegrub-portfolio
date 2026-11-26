module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_bracket_hooks");

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS operations_stage VARCHAR(32) NOT NULL DEFAULT 'registrations' AFTER registration_close_at
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bracket_handoff_at DATETIME NULL AFTER operations_stage
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS bracket_handoff_by INT NULL AFTER bracket_handoff_at
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_bracket_seeds (
        seed_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT NOT NULL,
        registration_id INT NOT NULL,
        seed_number INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_bracket_seed_registration (tournament_id, registration_id),
        UNIQUE KEY uniq_tournament_bracket_seed_number (tournament_id, seed_number),
        KEY idx_tournament_bracket_registration (registration_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
