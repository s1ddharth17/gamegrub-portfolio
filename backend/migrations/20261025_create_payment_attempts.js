exports.up = async function up({ connection }) {
  await connection.query(`
    ALTER TABLE booking
      ADD COLUMN IF NOT EXISTS payment_expires_at DATETIME NULL
  `);

  await connection.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS captured_amount DECIMAL(10, 2) NOT NULL DEFAULT 0
  `);
  await connection.query(`
    UPDATE payments
    SET captured_amount = CASE
      WHEN status IN ('advance_paid', 'partially_paid', 'paid')
        THEN COALESCE(customer_final_amount, final_amount, 0)
      ELSE 0
    END
    WHERE captured_amount = 0
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS payment_attempts (
      attempt_id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      booking_id BIGINT UNSIGNED NOT NULL,
      payment_id BIGINT UNSIGNED DEFAULT NULL,
      purpose VARCHAR(32) NOT NULL,
      idempotency_key VARCHAR(100) NOT NULL,
      amount_paise BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      provider VARCHAR(24) NOT NULL DEFAULT 'razorpay',
      provider_order_id VARCHAR(64) DEFAULT NULL,
      provider_payment_id VARCHAR(64) DEFAULT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'creating_order',
      failure_code VARCHAR(100) DEFAULT NULL,
      failure_description VARCHAR(500) DEFAULT NULL,
      checkout_expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (attempt_id),
      UNIQUE KEY uq_payment_attempt_user_idempotency (user_id, idempotency_key),
      UNIQUE KEY uq_payment_attempt_provider_order (provider_order_id),
      UNIQUE KEY uq_payment_attempt_provider_payment (provider_payment_id),
      KEY idx_payment_attempt_booking_status (booking_id, status),
      KEY idx_payment_attempt_payment_id (payment_id),
      KEY idx_payment_attempt_expiry (status, checkout_expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
};
