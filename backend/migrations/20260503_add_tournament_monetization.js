module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_monetization");

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS is_sponsored TINYINT(1) NOT NULL DEFAULT 0 AFTER is_featured
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS sponsor_name VARCHAR(120) NULL AFTER is_sponsored
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS sponsor_tagline VARCHAR(220) NULL AFTER sponsor_name
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS sponsor_prize_contribution DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER sponsor_tagline
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS is_premium TINYINT(1) NOT NULL DEFAULT 0 AFTER sponsor_prize_contribution
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS premium_entry_fee DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER is_premium
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS premium_label VARCHAR(64) NULL AFTER premium_entry_fee
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS premium_perks VARCHAR(500) NULL AFTER premium_label
    `);

    await connection.query(`
      ALTER TABLE tournament_registration_payments
      ADD COLUMN IF NOT EXISTS premium_access TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id
    `);

    await connection.query(`
      ALTER TABLE tournament_registration_payments
      ADD COLUMN IF NOT EXISTS premium_access_fee DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER amount_due
    `);

    await connection.query(`
      ALTER TABLE tournament_registration_payments
      ADD COLUMN IF NOT EXISTS premium_access_label VARCHAR(64) NULL AFTER premium_access_fee
    `);

    await connection.query(`
      ALTER TABLE tournament_registration_payments
      ADD KEY IF NOT EXISTS idx_tournament_registration_payment_premium (tournament_id, premium_access, payment_status)
    `);
  },
};
