module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_persistent_tournament_teams");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_teams (
        team_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        team_name VARCHAR(160) NOT NULL,
        team_tag VARCHAR(24) NULL,
        preferred_game VARCHAR(120) NULL,
        team_bio VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_teams_owner_name (owner_user_id, team_name),
        KEY idx_tournament_teams_owner_updated (owner_user_id, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_team_members (
        team_member_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        slot_number INT NOT NULL DEFAULT 1,
        member_name VARCHAR(120) NOT NULL,
        member_email VARCHAR(191) NULL,
        member_mobile VARCHAR(32) NULL,
        is_captain TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_team_member_slot (team_id, slot_number),
        KEY idx_tournament_team_members_team (team_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS team_id INT NULL AFTER team_name
    `);

    await connection.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_team
      ON tournament_registrations (team_id, status, created_at)
    `);
  },
};
