module.exports = {
  async up({ connection, ensureIndex }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_payout_settings (
        business_id INT NOT NULL PRIMARY KEY,
        payout_method VARCHAR(32) NOT NULL DEFAULT 'manual',
        payout_schedule VARCHAR(32) NOT NULL DEFAULT 'manual',
        minimum_payout_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        updated_by_admin_id INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_audit_logs (
        audit_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        business_id INT NOT NULL,
        actor_admin_id INT NULL,
        action VARCHAR(64) NOT NULL,
        before_json LONGTEXT NULL,
        after_json LONGTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      INSERT INTO business_payout_settings (business_id)
      SELECT b.business_id
      FROM businesses b
      WHERE NOT EXISTS (
        SELECT 1 FROM business_payout_settings s WHERE s.business_id = b.business_id
      )
    `);

    await ensureIndex("business_audit_logs", "idx_business_audit_business_created", [
      "business_id",
      "created_at",
    ]);
    await ensureIndex("business_audit_logs", "idx_business_audit_actor_created", [
      "actor_admin_id",
      "created_at",
    ]);
  },
};
