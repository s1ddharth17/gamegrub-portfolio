module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_waitlist_columns");

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS waitlisted_at DATETIME NULL AFTER cancelled_at
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS waitlist_promoted_at DATETIME NULL AFTER waitlisted_at
    `);

    await connection.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_registration_waitlist
      ON tournament_registrations (tournament_id, status, waitlisted_at, registration_id)
    `);
  },
};
