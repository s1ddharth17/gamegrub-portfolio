module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE orders
      MODIFY COLUMN status ENUM(
        'active', 'preparing', 'completed', 'delivered', 'closed'
      ) NOT NULL DEFAULT 'active'
    `);
  },
};
