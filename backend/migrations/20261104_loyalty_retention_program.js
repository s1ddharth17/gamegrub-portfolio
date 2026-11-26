module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL,
        ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) NULL
    `);

    const [referralIndexes] = await connection.query(
      "SHOW INDEX FROM users WHERE Key_name = ?",
      ["uniq_users_referral_code"]
    );
    if (!referralIndexes.length) {
      await connection.query(
        "ALTER TABLE users ADD UNIQUE INDEX uniq_users_referral_code (referral_code)"
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loyalty_reward_grants (
        grant_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        reward_key VARCHAR(120) NOT NULL,
        reward_type VARCHAR(32) NOT NULL,
        points INT NOT NULL,
        note VARCHAR(255) NOT NULL,
        source_user_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_loyalty_reward_user_key (user_id, reward_key),
        KEY idx_loyalty_reward_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loyalty_referrals (
        referral_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        referrer_user_id INT NOT NULL,
        referred_user_id INT NOT NULL,
        referral_code VARCHAR(16) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        rewarded_at DATETIME NULL,
        UNIQUE KEY uq_loyalty_referral_referred (referred_user_id),
        KEY idx_loyalty_referral_referrer_status (referrer_user_id, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loyalty_visit_days (
        visit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        visit_date DATE NOT NULL,
        booking_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_loyalty_visit_booking (booking_id),
        UNIQUE KEY uq_loyalty_visit_user_day (user_id, visit_date),
        KEY idx_loyalty_visit_user_date (user_id, visit_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loyalty_user_badges (
        badge_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        badge_code VARCHAR(48) NOT NULL,
        badge_name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NOT NULL,
        reward_points INT NOT NULL DEFAULT 0,
        awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_loyalty_user_badge (user_id, badge_code),
        KEY idx_loyalty_badge_user_awarded (user_id, awarded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loyalty_challenges (
        challenge_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        challenge_key VARCHAR(48) NOT NULL,
        title VARCHAR(140) NOT NULL,
        description VARCHAR(255) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        target_visits SMALLINT UNSIGNED NOT NULL,
        reward_points INT UNSIGNED NOT NULL,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_loyalty_challenge_user_key (user_id, challenge_key),
        KEY idx_loyalty_challenge_user_period (user_id, period_start, period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },

  async down({ connection }) {
    await connection.query("DROP TABLE IF EXISTS loyalty_challenges");
    await connection.query("DROP TABLE IF EXISTS loyalty_user_badges");
    await connection.query("DROP TABLE IF EXISTS loyalty_visit_days");
    await connection.query("DROP TABLE IF EXISTS loyalty_referrals");
    await connection.query("DROP TABLE IF EXISTS loyalty_reward_grants");
    await connection.query("ALTER TABLE users DROP INDEX IF EXISTS uniq_users_referral_code");
    await connection.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS referral_code,
        DROP COLUMN IF EXISTS date_of_birth
    `);
  },
};
