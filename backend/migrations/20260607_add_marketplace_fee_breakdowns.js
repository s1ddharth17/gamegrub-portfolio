module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_marketplace_fee_breakdowns");

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS convenience_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER loyalty_amount
    `);

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS customer_final_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER final_amount
    `);

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER convenience_fee
    `);

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS platform_commission DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER commission_rate
    `);

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS seller_net_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER platform_commission
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS convenience_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER subtotal
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS customer_final_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER final_amount
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER convenience_fee
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS platform_commission DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER commission_rate
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS seller_net_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER platform_commission
    `);

    await connection.query(`
      UPDATE payments
      SET
        customer_final_amount = CASE
          WHEN customer_final_amount IS NULL OR customer_final_amount = 0 THEN COALESCE(final_amount, 0)
          ELSE customer_final_amount
        END,
        seller_net_amount = CASE
          WHEN seller_net_amount IS NULL OR seller_net_amount = 0 THEN COALESCE(final_amount, 0)
          ELSE seller_net_amount
        END
    `);

    await connection.query(`
      UPDATE bills
      SET
        customer_final_amount = CASE
          WHEN customer_final_amount IS NULL OR customer_final_amount = 0 THEN COALESCE(final_amount, 0)
          ELSE customer_final_amount
        END,
        seller_net_amount = CASE
          WHEN seller_net_amount IS NULL OR seller_net_amount = 0 THEN COALESCE(final_amount, 0)
          ELSE seller_net_amount
        END
    `);
  },
};
