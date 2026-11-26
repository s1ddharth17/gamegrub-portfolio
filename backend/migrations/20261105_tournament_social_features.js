module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS skill_level VARCHAR(24) NOT NULL DEFAULT 'open'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_player_profiles (
        user_id INT NOT NULL PRIMARY KEY,
        is_public TINYINT(1) NOT NULL DEFAULT 0,
        looking_for_team TINYINT(1) NOT NULL DEFAULT 0,
        skill_level VARCHAR(24) NOT NULL DEFAULT 'open',
        city VARCHAR(120) NULL,
        state VARCHAR(120) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tournament_player_discovery (is_public, looking_for_team, skill_level, state, city)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_community_reactions (
        reaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        reaction VARCHAR(16) NOT NULL DEFAULT 'like',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tournament_post_user_reaction (post_id, user_id),
        KEY idx_tournament_post_reaction_post (post_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_community_reports (
        report_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        reason VARCHAR(32) NOT NULL,
        details VARCHAR(500) NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        moderated_by INT NULL,
        moderation_note VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        moderated_at DATETIME NULL,
        UNIQUE KEY uq_tournament_post_user_report (post_id, user_id),
        KEY idx_tournament_community_report_queue (status, created_at),
        KEY idx_tournament_community_report_post (post_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },

  async down({ connection }) {
    await connection.query("DROP TABLE IF EXISTS tournament_community_reports");
    await connection.query("DROP TABLE IF EXISTS tournament_community_reactions");
    await connection.query("DROP TABLE IF EXISTS tournament_player_profiles");
    await connection.query("ALTER TABLE tournaments DROP COLUMN IF EXISTS skill_level");
  },
};
