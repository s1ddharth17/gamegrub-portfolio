module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_attendance");

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER status
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS checked_in_at DATETIME NULL AFTER attendance_status
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS checked_in_by INT NULL AFTER checked_in_at
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS no_show_marked_at DATETIME NULL AFTER checked_in_by
    `);

    await connection.query(`
      ALTER TABLE tournament_registrations
      ADD COLUMN IF NOT EXISTS no_show_marked_by INT NULL AFTER no_show_marked_at
    `);

    await connection.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_registration_attendance
      ON tournament_registrations (tournament_id, status, attendance_status)
    `);
  },
};
