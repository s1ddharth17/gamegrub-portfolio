module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_registration_rosters");

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS team_name VARCHAR(160) NULL AFTER participant_mobile
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_registration_members (
        member_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        registration_id INT NOT NULL,
        slot_number INT NOT NULL DEFAULT 1,
        member_name VARCHAR(120) NOT NULL,
        member_email VARCHAR(191) NULL,
        member_mobile VARCHAR(32) NULL,
        is_captain TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_registration_member_slot (registration_id, slot_number),
        KEY idx_tournament_registration_members_registration (registration_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
