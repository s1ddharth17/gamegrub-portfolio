module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(180) NULL,
        ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7) NULL,
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7) NULL,
        ADD COLUMN IF NOT EXISTS amenities JSON NULL,
        ADD COLUMN IF NOT EXISTS equipment_highlights JSON NULL,
        ADD COLUMN IF NOT EXISTS gallery_images JSON NULL,
        ADD COLUMN IF NOT EXISTS parking_info VARCHAR(1000) NULL,
        ADD COLUMN IF NOT EXISTS accessibility_info VARCHAR(1500) NULL,
        ADD COLUMN IF NOT EXISTS policies TEXT NULL
    `);
  },

  async down({ connection }) {
    await connection.query(`
      ALTER TABLE businesses
        DROP COLUMN IF EXISTS policies,
        DROP COLUMN IF EXISTS accessibility_info,
        DROP COLUMN IF EXISTS parking_info,
        DROP COLUMN IF EXISTS gallery_images,
        DROP COLUMN IF EXISTS equipment_highlights,
        DROP COLUMN IF EXISTS amenities,
        DROP COLUMN IF EXISTS longitude,
        DROP COLUMN IF EXISTS latitude,
        DROP COLUMN IF EXISTS postal_code,
        DROP COLUMN IF EXISTS address_line2
    `);
  },
};
