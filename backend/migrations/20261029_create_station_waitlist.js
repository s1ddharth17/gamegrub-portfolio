module.exports = {
  async up({ connection }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS station_waitlist_entries (
        waitlist_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        business_id INT NOT NULL,
        preferred_pc_id INT DEFAULT NULL,
        preferred_category VARCHAR(32) DEFAULT NULL,
        booking_date DATE NOT NULL,
        start_hour TINYINT UNSIGNED NOT NULL,
        end_hour TINYINT UNSIGNED NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (waitlist_id),
        KEY idx_station_waitlist_match (business_id, booking_date, start_hour, end_hour, status, created_at),
        KEY idx_station_waitlist_user (user_id, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS station_waitlist_openings (
        opening_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_booking_id INT NOT NULL,
        business_id INT NOT NULL,
        pc_id INT NOT NULL,
        booking_date DATE NOT NULL,
        start_hour TINYINT UNSIGNED NOT NULL,
        end_hour TINYINT UNSIGNED NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        expires_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (opening_id),
        UNIQUE KEY uq_station_waitlist_source_window
          (source_booking_id, pc_id, booking_date, start_hour, end_hour),
        KEY idx_station_waitlist_opening_match
          (business_id, pc_id, booking_date, start_hour, end_hour, status, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS station_waitlist_offers (
        offer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        opening_id BIGINT UNSIGNED NOT NULL,
        waitlist_id BIGINT UNSIGNED NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'offered',
        offered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        claimed_at DATETIME DEFAULT NULL,
        booking_id INT DEFAULT NULL,
        PRIMARY KEY (offer_id),
        UNIQUE KEY uq_station_waitlist_offer_entry (opening_id, waitlist_id),
        KEY idx_station_waitlist_offer_expiry (status, expires_at, offer_id),
        KEY idx_station_waitlist_offer_user (waitlist_id, status, offer_id),
        KEY idx_station_waitlist_offer_opening (opening_id, status, offer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },

  async down({ connection }) {
    await connection.query("DROP TABLE IF EXISTS station_waitlist_offers");
    await connection.query("DROP TABLE IF EXISTS station_waitlist_openings");
    await connection.query("DROP TABLE IF EXISTS station_waitlist_entries");
  },
};
