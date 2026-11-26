module.exports = {
  transaction: false,
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00
    `);
    await connection.query(`
      ALTER TABLE bills
        ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(64) NULL
    `);

    await connection.query(`
      UPDATE payments
      SET receipt_number = CONCAT('GG-PAY-', LPAD(payment_id, 10, '0'))
      WHERE receipt_number IS NULL OR receipt_number = ''
    `);
    await connection.query(`
      UPDATE bills
      SET receipt_number = CONCAT('GG-BILL-', LPAD(bill_id, 10, '0'))
      WHERE receipt_number IS NULL OR receipt_number = ''
    `);

    for (const [table, name] of [
      ["payments", "uq_payments_receipt_number"],
      ["bills", "uq_bills_receipt_number"],
    ]) {
      const [indexes] = await connection.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
      if (!indexes.length) {
        await connection.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${name}\` (receipt_number)`);
      }
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        business_id INT NOT NULL,
        payment_id BIGINT UNSIGNED NOT NULL,
        booking_id BIGINT UNSIGNED NOT NULL,
        kind VARCHAR(24) NOT NULL,
        channel VARCHAR(24) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        reference VARCHAR(120) DEFAULT NULL,
        source_type VARCHAR(32) NOT NULL,
        source_id VARCHAR(64) NOT NULL,
        admin_id INT DEFAULT NULL,
        note VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (transaction_id),
        UNIQUE KEY uq_payment_transaction_source (source_type, source_id, kind),
        KEY idx_payment_transaction_payment (payment_id, created_at),
        KEY idx_payment_transaction_business (business_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO payment_transactions (
        business_id, payment_id, booking_id, kind, channel, amount, reference,
        source_type, source_id, note
      )
      SELECT p.business_id, p.payment_id, p.booking_id, 'capture',
        CASE
          WHEN LOWER(COALESCE(p.payment_method, '')) IN ('cash', 'upi', 'card', 'wallet', 'razorpay')
            THEN LOWER(p.payment_method)
          ELSE 'manual'
        END,
        p.captured_amount, NULLIF(p.payment_reference, ''), 'legacy_backfill',
        CAST(p.payment_id AS CHAR), 'Opening captured balance imported during receipt upgrade.'
      FROM payments p
      WHERE COALESCE(p.captured_amount, 0) > 0
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS payment_refunds (
        refund_id CHAR(36) NOT NULL,
        refund_number VARCHAR(48) NOT NULL,
        business_id INT NOT NULL,
        payment_id BIGINT UNSIGNED NOT NULL,
        booking_id BIGINT UNSIGNED NOT NULL,
        order_id BIGINT UNSIGNED DEFAULT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        requested_by_user_id BIGINT UNSIGNED NOT NULL,
        processed_by_admin_id INT DEFAULT NULL,
        request_key VARCHAR(100) NOT NULL,
        provider_payment_id VARCHAR(64) DEFAULT NULL,
        provider_refund_id VARCHAR(64) DEFAULT NULL,
        refund_method VARCHAR(24) NOT NULL DEFAULT 'manual',
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        requested_amount DECIMAL(10, 2) NOT NULL,
        processed_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        loyalty_points_to_restore INT NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'requested',
        reason VARCHAR(500) DEFAULT NULL,
        admin_note VARCHAR(500) DEFAULT NULL,
        outcome_message VARCHAR(500) DEFAULT NULL,
        failure_description VARCHAR(500) DEFAULT NULL,
        requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME DEFAULT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (refund_id),
        UNIQUE KEY uq_payment_refund_number (refund_number),
        UNIQUE KEY uq_payment_refund_request (user_id, request_key),
        UNIQUE KEY uq_payment_refund_provider (provider_refund_id),
        KEY idx_payment_refund_business_status (business_id, status, requested_at),
        KEY idx_payment_refund_payment_status (payment_id, status),
        KEY idx_payment_refund_booking (booking_id, requested_at),
        KEY idx_payment_refund_provider_payment (provider_payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS finance_reconciliation_notes (
        note_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        business_id INT NOT NULL,
        entity_type VARCHAR(24) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        admin_id INT NOT NULL,
        note VARCHAR(1000) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id),
        KEY idx_finance_note_entity (business_id, entity_type, entity_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
