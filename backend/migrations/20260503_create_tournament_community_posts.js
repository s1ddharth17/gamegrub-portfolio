module.exports = {
  async up({ connection, logger }) {
    logger.info("creating_tournament_community_posts");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournament_community_posts (
        post_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        linked_tournament_id INT NULL,
        content_type VARCHAR(32) NOT NULL DEFAULT 'spotlight',
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        accent_tone VARCHAR(32) NOT NULL DEFAULT 'orange',
        title VARCHAR(160) NOT NULL,
        subtitle VARCHAR(220) NULL,
        summary VARCHAR(420) NOT NULL,
        body TEXT NULL,
        badge_label VARCHAR(48) NULL,
        cta_label VARCHAR(64) NULL,
        priority INT NOT NULL DEFAULT 0,
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        published_at DATETIME NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tournament_community_posts_status (status, published_at),
        KEY idx_tournament_community_posts_schedule (starts_at, ends_at),
        KEY idx_tournament_community_posts_tournament (linked_tournament_id, status),
        KEY idx_tournament_community_posts_priority (priority, published_at)
      )
    `);
  },
};
