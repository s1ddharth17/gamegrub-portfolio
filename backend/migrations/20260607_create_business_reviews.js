module.exports = {
  async up({ connection, ensureIndex, logger }) {
    logger.info("creating_business_reviews");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_reviews (
        review_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        business_id INT NOT NULL,
        user_id INT NOT NULL,
        bill_id INT NULL,
        rating TINYINT UNSIGNED NOT NULL,
        review_title VARCHAR(80) NOT NULL DEFAULT '',
        review_text VARCHAR(480) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_business_reviews_business_user (business_id, user_id),
        KEY idx_business_reviews_business_created (business_id, created_at),
        KEY idx_business_reviews_user_updated (user_id, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await ensureIndex(
      "business_reviews",
      "idx_business_reviews_business_rating",
      ["business_id", "rating"]
    );
  },
};
