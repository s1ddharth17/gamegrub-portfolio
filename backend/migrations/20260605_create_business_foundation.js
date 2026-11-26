module.exports = {
  async up({ connection, ensureIndex, logger }) {
    logger.info("creating_business_foundation");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        business_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(140) NOT NULL,
        name VARCHAR(140) NOT NULL,
        tagline VARCHAR(180) NULL,
        description TEXT NULL,
        city VARCHAR(120) NULL,
        state VARCHAR(120) NULL,
        address_line1 VARCHAR(180) NULL,
        phone VARCHAR(30) NULL,
        contact_email VARCHAR(191) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        listing_status VARCHAR(32) NOT NULL DEFAULT 'hidden',
        is_featured TINYINT(1) NOT NULL DEFAULT 0,
        opens_at TIME NULL,
        closes_at TIME NULL,
        logo_image VARCHAR(255) NULL,
        cover_image VARCHAR(255) NULL,
        commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        convenience_fee_flat DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        convenience_fee_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        created_by_admin_id INT NULL,
        approved_by_admin_id INT NULL,
        approved_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_business_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_admin_memberships (
        membership_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        business_id INT NOT NULL,
        admin_id INT NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'manager',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_business_admin (business_id, admin_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      INSERT INTO businesses (
        business_id,
        slug,
        name,
        tagline,
        description,
        status,
        listing_status,
        is_featured,
        approved_at,
        created_at,
        updated_at
      )
      SELECT
        1,
        'gamegrub-cafe',
        'GameGrub Cafe',
        'Legacy launch venue',
        'Default business created during the marketplace migration.',
        'active',
        'listed',
        1,
        NOW(),
        NOW(),
        NOW()
      FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1
        FROM businesses
        WHERE business_id = 1
      )
    `);

    await connection.query(`
      ALTER TABLE pc
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER pc_id
    `);

    await connection.query(`
      ALTER TABLE menu
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER id
    `);

    await connection.query(`
      ALTER TABLE booking
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER booking_id
    `);

    await connection.query(`
      ALTER TABLE booking_slots
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER booking_id
    `);

    await connection.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER order_id
    `);

    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER payment_id
    `);

    await connection.query(`
      ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER bill_id
    `);

    await connection.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS business_id INT NOT NULL DEFAULT 1 AFTER tournament_id
    `);

    await connection.query(`
      UPDATE pc
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE menu
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE booking
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE booking_slots
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE orders
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE payments
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE bills
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      UPDATE tournaments
      SET business_id = 1
      WHERE business_id IS NULL OR business_id = 0
    `);

    await connection.query(`
      INSERT INTO business_admin_memberships (
        business_id,
        admin_id,
        role,
        status,
        created_at,
        updated_at
      )
      SELECT
        1,
        a.id,
        CASE
          WHEN a.role = 'super_admin' THEN 'owner'
          ELSE 'manager'
        END,
        CASE
          WHEN a.status = 'active' THEN 'active'
          WHEN a.status = 'pending' THEN 'pending'
          ELSE 'disabled'
        END,
        COALESCE(a.created_at, NOW()),
        COALESCE(a.updated_at, NOW())
      FROM admin a
      WHERE NOT EXISTS (
        SELECT 1
        FROM business_admin_memberships bam
        WHERE bam.business_id = 1
        AND bam.admin_id = a.id
      )
    `);

    await ensureIndex("businesses", "idx_businesses_status_listing", [
      "status",
      "listing_status",
    ]);
    await ensureIndex("business_admin_memberships", "idx_business_admin_memberships_admin", [
      "admin_id",
      "status",
    ]);
    await ensureIndex("pc", "idx_pc_business", ["business_id"]);
    await ensureIndex("menu", "idx_menu_business", ["business_id"]);
    await ensureIndex("booking", "idx_booking_business", ["business_id"]);
    await ensureIndex("booking_slots", "idx_booking_slots_business", ["business_id"]);
    await ensureIndex("orders", "idx_orders_business", ["business_id"]);
    await ensureIndex("payments", "idx_payments_business", ["business_id"]);
    await ensureIndex("bills", "idx_bills_business", ["business_id"]);
    await ensureIndex("tournaments", "idx_tournaments_business", ["business_id"]);
  },
};
