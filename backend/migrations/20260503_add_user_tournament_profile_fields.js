module.exports = {
  async up({ connection, logger }) {
    logger.info("adding_user_tournament_profile_fields");

    await connection.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS gamer_tag VARCHAR(64) NULL AFTER avatar
    `);

    await connection.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS favorite_game VARCHAR(120) NULL AFTER gamer_tag
    `);

    await connection.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS player_bio VARCHAR(500) NULL AFTER favorite_game
    `);
  },
};
