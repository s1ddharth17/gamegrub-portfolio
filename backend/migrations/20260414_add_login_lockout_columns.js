async function ensureColumn(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);

  if (rows.length) {
    return false;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  return true;
}

module.exports = {
  description: "Add failed-login tracking and lockout columns to users and admin accounts.",
  transaction: false,
  async up({ connection, logger }) {
    const operations = [
      [
        "users",
        "failed_login_attempts",
        "failed_login_attempts INT NOT NULL DEFAULT 0 AFTER password",
      ],
      [
        "users",
        "last_failed_login_at",
        "last_failed_login_at DATETIME NULL AFTER failed_login_attempts",
      ],
      [
        "users",
        "locked_until",
        "locked_until DATETIME NULL AFTER last_failed_login_at",
      ],
      [
        "admin",
        "failed_login_attempts",
        "failed_login_attempts INT NOT NULL DEFAULT 0 AFTER password",
      ],
      [
        "admin",
        "last_failed_login_at",
        "last_failed_login_at DATETIME NULL AFTER failed_login_attempts",
      ],
      [
        "admin",
        "locked_until",
        "locked_until DATETIME NULL AFTER last_failed_login_at",
      ],
    ];

    for (const [tableName, columnName, definition] of operations) {
      const created = await ensureColumn(connection, tableName, columnName, definition);
      logger.info("migration_column_checked", {
        table_name: tableName,
        column_name: columnName,
        created,
      });
    }
  },
};
