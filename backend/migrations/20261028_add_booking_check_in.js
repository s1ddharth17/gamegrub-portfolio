module.exports = {
  async up({ connection, ensureIndex }) {
    await connection.query(`
      ALTER TABLE booking
        ADD COLUMN IF NOT EXISTS checked_in_at DATETIME NULL AFTER actual_end_time,
        ADD COLUMN IF NOT EXISTS checked_in_by INT NULL AFTER checked_in_at
    `);

    await ensureIndex("booking", "idx_booking_check_in", [
      "business_id",
      "booking_date",
      "checked_in_at",
    ]);
  },

  async down({ connection }) {
    await connection.query("DROP INDEX IF EXISTS idx_booking_check_in ON booking");
    await connection.query(`
      ALTER TABLE booking
        DROP COLUMN IF EXISTS checked_in_by,
        DROP COLUMN IF EXISTS checked_in_at
    `);
  },
};
