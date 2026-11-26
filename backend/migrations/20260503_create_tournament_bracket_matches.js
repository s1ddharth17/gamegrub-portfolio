module.exports = {
  async up({ connection, logger }) {
    logger.info("creating_tournament_bracket_matches");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_bracket_matches (
        match_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT NOT NULL,
        round_number INT NOT NULL,
        match_number INT NOT NULL,
        source_match_one_id INT NULL,
        source_match_two_id INT NULL,
        slot_one_registration_id INT NULL,
        slot_two_registration_id INT NULL,
        slot_one_seed_number INT NULL,
        slot_two_seed_number INT NULL,
        slot_one_score INT NULL,
        slot_two_score INT NULL,
        winner_registration_id INT NULL,
        loser_registration_id INT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        notes VARCHAR(255) NULL,
        completed_at DATETIME NULL,
        reported_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_bracket_match_round (tournament_id, round_number, match_number),
        KEY idx_tournament_bracket_match_sources (source_match_one_id, source_match_two_id),
        KEY idx_tournament_bracket_match_winner (winner_registration_id, completed_at),
        KEY idx_tournament_bracket_match_status (tournament_id, status, round_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
