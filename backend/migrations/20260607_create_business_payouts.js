module.exports = {
  async up({ connection, ensureIndex, logger }) {
    logger.info("creating_business_payouts");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_payouts (
        payout_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        business_id INT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        bill_count INT NOT NULL DEFAULT 0,
        gross_service_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        customer_total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        convenience_fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        platform_commission_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        seller_net_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        requested_by_admin_id INT NULL,
        paid_by_admin_id INT NULL,
        payout_reference VARCHAR(120) NULL,
        notes VARCHAR(400) NOT NULL DEFAULT '',
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processing_at DATETIME NULL,
        paid_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_business_payouts_business_requested (business_id, requested_at),
        KEY idx_business_payouts_status_requested (status, requested_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS payout_id INT NULL AFTER business_id
    `);

    await ensureIndex("bills", "idx_bills_payout_id", ["payout_id"]);
    await ensureIndex("bills", "idx_bills_business_payout_created", ["business_id", "payout_id", "created_at"]);
  },
};
