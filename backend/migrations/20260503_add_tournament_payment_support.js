module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_tournament_payment_support");

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS refund_policy VARCHAR(48) NOT NULL DEFAULT 'no_refunds' AFTER prize_pool
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS refund_cutoff_hours INT NOT NULL DEFAULT 24 AFTER refund_policy
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS refund_percentage INT NOT NULL DEFAULT 100 AFTER refund_cutoff_hours
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_registration_payments (
        registration_payment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        registration_id INT NOT NULL,
        tournament_id INT NOT NULL,
        user_id INT NOT NULL,
        amount_due DECIMAL(10, 2) NOT NULL DEFAULT 0,
        amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
        payment_method VARCHAR(32) NULL,
        payment_reference VARCHAR(191) NULL,
        payment_notes VARCHAR(500) NULL,
        paid_at DATETIME NULL,
        refund_status VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
        refund_requested_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        refund_processed_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        refund_requested_at DATETIME NULL,
        refund_processed_at DATETIME NULL,
        refund_notes VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_registration_payment_registration (registration_id),
        KEY idx_tournament_registration_payment_tournament (tournament_id, payment_status),
        KEY idx_tournament_registration_payment_refund (tournament_id, refund_status, refund_requested_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
