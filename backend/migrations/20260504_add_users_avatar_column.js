async function ensureColumn(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName]
  );

  if (rows.length) {
    return false;
  }

  await connection.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`
  );
  return true;
}

module.exports = {
  description: "Add a persistent avatar column to users.",
  transaction: false,
  async up({ connection, logger }) {
    const created = await ensureColumn(
      connection,
      "users",
      "avatar",
      "avatar VARCHAR(255) DEFAULT NULL AFTER mobile"
    );

    logger.info("migration_column_checked", {
      table_name: "users",
      column_name: "avatar",
      created,
    });
  },
};
