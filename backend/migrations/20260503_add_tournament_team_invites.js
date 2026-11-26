module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_team_invites");

    await connection.query(`
      ALTER TABLE tournament_team_members
      ADD COLUMN IF NOT EXISTS user_id INT NULL AFTER team_id
    `);

    await connection.query(`
      ALTER TABLE tournament_team_members
      ADD COLUMN IF NOT EXISTS membership_status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER is_captain
    `);

    await connection.query(`
      UPDATE tournament_team_members tm
      JOIN tournament_teams tt ON tt.team_id = tm.team_id
      SET
        tm.user_id = CASE
          WHEN tm.is_captain = 1 THEN tt.owner_user_id
          ELSE tm.user_id
        END,
        tm.membership_status = CASE
          WHEN tm.is_captain = 1 THEN 'captain'
          WHEN tm.membership_status IS NULL OR tm.membership_status = '' THEN 'pending'
          ELSE tm.membership_status
        END
    `);

    await connection.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_team_members_user_status
      ON tournament_team_members (user_id, membership_status, team_id)
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_team_invites (
        invite_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        team_member_id INT NOT NULL,
        invited_email VARCHAR(191) NOT NULL,
        invited_user_id INT NULL,
        invited_by_user_id INT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        message VARCHAR(280) NULL,
        responded_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tournament_team_invites_member_status (team_member_id, status, created_at),
        KEY idx_tournament_team_invites_email_status (invited_email, status, created_at),
        KEY idx_tournament_team_invites_user_status (invited_user_id, status, created_at),
        KEY idx_tournament_team_invites_team_status (team_id, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
