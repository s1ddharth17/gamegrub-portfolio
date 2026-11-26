module.exports = {
  async up({ connection, logger }) {
    logger.info("creating_tournaments_table");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        tournament_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(191) NOT NULL,
        title VARCHAR(160) NOT NULL,
        game_title VARCHAR(120) NOT NULL,
        format VARCHAR(32) NOT NULL DEFAULT 'solo',
        team_size INT NOT NULL DEFAULT 1,
        max_participants INT NOT NULL DEFAULT 16,
        registered_count INT NOT NULL DEFAULT 0,
        entry_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        prize_pool DECIMAL(10, 2) NOT NULL DEFAULT 0,
        location_label VARCHAR(160) NOT NULL DEFAULT 'GameGrub Arena',
        summary VARCHAR(500) NULL,
        description TEXT NULL,
        rules TEXT NULL,
        cover_image VARCHAR(512) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        is_featured TINYINT(1) NOT NULL DEFAULT 0,
        start_at DATETIME NOT NULL,
        end_at DATETIME NULL,
        registration_open_at DATETIME NULL,
        registration_close_at DATETIME NULL,
        published_at DATETIME NULL,
        created_by INT NULL,
        updated_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournaments_slug (slug),
        KEY idx_tournaments_status_start (status, start_at),
        KEY idx_tournaments_featured_start (is_featured, start_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
  },
};
