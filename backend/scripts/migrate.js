require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { pool } = require("../utils/db");
const { logger } = require("../utils/logger");

const migrationsLogger = logger.child({ component: "migrations" });
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const MIGRATIONS_TABLE = String(
  process.env.DB_MIGRATIONS_TABLE || "schema_migrations"
).trim();

const MIGRATION_ORDER_BY_DATE = {
  "20260425": [
    "20260425_create_tournaments.js",
    "20260425_create_tournaments_registrations.js",
    "20260425_add_tournament_bracket_hooks.js",
    "20260425_add_tournament_registration_rosters.js",
  ],
  "20260503": [
    "20260503_add_user_tournament_profile_fields.js",
    "20260503_create_tournament_bracket_matches.js",
    "20260503_create_tournament_community_posts.js",
    "20260503_create_tournament_notifications.js",
    "20260503_add_persistent_tournament_teams.js",
    "20260503_add_tournament_attendance.js",
    "20260503_add_tournament_payment_support.js",
    "20260503_add_tournament_monetization.js",
    "20260503_add_tournament_team_invites.js",
    "20260503_add_tournament_waitlist.js",
  ],
  "20260607": [
    "20260607_add_marketplace_fee_breakdowns.js",
    "20260607_create_business_payouts.js",
    "20260607_create_business_reviews.js",
  ],
};

function escapeIdentifier(identifier) {
  return `\`${String(identifier || "").replace(/`/g, "``")}\``;
}

function buildChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function createMigrationsTableSql() {
  return `
      CREATE TABLE IF NOT EXISTS ${escapeIdentifier(MIGRATIONS_TABLE)} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_filename (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;
}

function isMissingInEngineError(error) {
  return (
    Number(error?.errno) === 1932 ||
    /doesn't exist in engine/i.test(String(error?.message || ""))
  );
}

function isBrokenTableStatus(statusRow) {
  if (!statusRow) {
    return false;
  }

  return (
    !statusRow.Engine ||
    /doesn't exist in engine/i.test(String(statusRow.Comment || ""))
  );
}

async function getMigrationsTableStatus(connection) {
  const [rows] = await connection.query("SHOW TABLE STATUS LIKE ?", [MIGRATIONS_TABLE]);
  return rows[0] || null;
}

async function rebuildMigrationsTable(connection, reason) {
  migrationsLogger.warn("migrations_table_rebuild_started", {
    table_name: MIGRATIONS_TABLE,
    reason,
  });

  await connection.query(`DROP TABLE IF EXISTS ${escapeIdentifier(MIGRATIONS_TABLE)}`);
  await connection.query(createMigrationsTableSql());

  migrationsLogger.info("migrations_table_rebuild_completed", {
    table_name: MIGRATIONS_TABLE,
  });
}

async function ensureMigrationsTable(connection) {
  const status = await getMigrationsTableStatus(connection);

  if (isBrokenTableStatus(status)) {
    await rebuildMigrationsTable(connection, "table_exists_in_metadata_but_not_engine");
    return;
  }

  await connection.query(createMigrationsTableSql());

  try {
    await connection.query(
      `SELECT 1 FROM ${escapeIdentifier(MIGRATIONS_TABLE)} LIMIT 1`
    );
  } catch (error) {
    if (!isMissingInEngineError(error)) {
      throw error;
    }

    await rebuildMigrationsTable(connection, "select_failed_with_missing_in_engine");
  }
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return sortMigrationFiles(
    entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => entry.name)
  );
}

function sortMigrationFiles(files) {
  const orderByFilename = new Map();

  for (const orderedFiles of Object.values(MIGRATION_ORDER_BY_DATE)) {
    orderedFiles.forEach((filename, index) => {
      orderByFilename.set(filename, index);
    });
  }

  return [...files].sort((left, right) => {
    const leftDate = left.slice(0, 8);
    const rightDate = right.slice(0, 8);
    const dateComparison = leftDate.localeCompare(rightDate);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    const leftRank = orderByFilename.get(left);
    const rightRank = orderByFilename.get(right);

    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }

    return left.localeCompare(right);
  });
}

async function getAppliedMigrations(connection) {
  let rows;

  try {
    [rows] = await connection.query(
      `
        SELECT filename, checksum, applied_at
        FROM ${escapeIdentifier(MIGRATIONS_TABLE)}
        ORDER BY filename ASC
      `
    );
  } catch (error) {
    if (!isMissingInEngineError(error)) {
      throw error;
    }

    await rebuildMigrationsTable(connection, "read_failed_with_missing_in_engine");

    [rows] = await connection.query(
      `
        SELECT filename, checksum, applied_at
        FROM ${escapeIdentifier(MIGRATIONS_TABLE)}
        ORDER BY filename ASC
      `
    );
  }

  return new Map(rows.map((row) => [row.filename, row]));
}

async function ensureIndex(connection, tableName, indexName, columns) {
  const [existingIndexes] = await connection.query(
    `SHOW INDEX FROM ${escapeIdentifier(tableName)} WHERE Key_name = ?`,
    [indexName]
  );

  if (existingIndexes.length) {
    return false;
  }

  const columnList = columns.map((columnName) => escapeIdentifier(columnName)).join(", ");

  await connection.query(
    `
      ALTER TABLE ${escapeIdentifier(tableName)}
      ADD INDEX ${escapeIdentifier(indexName)} (${columnList})
    `
  );

  return true;
}

async function loadMigration(filePath) {
  delete require.cache[require.resolve(filePath)];
  const migration = require(filePath);

  if (!migration || typeof migration.up !== "function") {
    throw new Error(`Migration ${path.basename(filePath)} must export an up() function.`);
  }

  return migration;
}

async function printStatus(connection, files, migrationsDirectory = MIGRATIONS_DIR) {
  const applied = await getAppliedMigrations(connection);
  const statusRows = [];

  for (const filename of files) {
    const fullPath = path.join(migrationsDirectory, filename);
    const fileContents = await fs.readFile(fullPath, "utf8");
    const checksum = buildChecksum(fileContents);
    const appliedMigration = applied.get(filename);

    statusRows.push({
      filename,
      status: appliedMigration ? "applied" : "pending",
      checksum_match: appliedMigration ? appliedMigration.checksum === checksum : null,
      applied_at: appliedMigration?.applied_at || null,
    });
  }

  migrationsLogger.info("migration_status", { migrations: statusRows });
}

async function applyMigrations(connection, files, migrationsDirectory = MIGRATIONS_DIR) {
  const applied = await getAppliedMigrations(connection);
  let appliedCount = 0;

  for (const filename of files) {
    const fullPath = path.join(migrationsDirectory, filename);
    const fileContents = await fs.readFile(fullPath, "utf8");
    const checksum = buildChecksum(fileContents);
    const appliedMigration = applied.get(filename);

    if (appliedMigration) {
      if (appliedMigration.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${filename}.`);
      }

      migrationsLogger.info("migration_skipped", { filename, reason: "already_applied" });
      continue;
    }

    const migration = await loadMigration(fullPath);
    const migrationLogger = migrationsLogger.child({ migration: filename });
    const useTransaction = migration.transaction !== false;

    migrationLogger.info("migration_started");
    if (useTransaction) {
      await connection.beginTransaction();
    }

    try {
      await migration.up({
        connection,
        ensureIndex: async (tableName, indexName, columns) =>
          ensureIndex(connection, tableName, indexName, columns),
        logger: migrationLogger,
      });

      await connection.query(
        `
          INSERT INTO ${escapeIdentifier(MIGRATIONS_TABLE)} (
            filename,
            checksum
          )
          VALUES (?, ?)
        `,
        [filename, checksum]
      );

      if (useTransaction) {
        await connection.commit();
      }
      appliedCount += 1;
      migrationLogger.info("migration_completed");
    } catch (error) {
      if (useTransaction) {
        await connection.rollback();
      }
      migrationLogger.error("migration_failed", { error });
      throw error;
    }
  }

  migrationsLogger.info("migration_run_completed", {
    total_files: files.length,
    applied_count: appliedCount,
  });
}

async function closePool() {
  await new Promise((resolve, reject) => {
    pool.end((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main() {
  const mode = process.argv.includes("--status") ? "status" : "apply";
  const connection = await pool.promise().getConnection();

  try {
    await ensureMigrationsTable(connection);
    const files = await listMigrationFiles();

    if (mode === "status") {
      await printStatus(connection, files);
      return;
    }

    await applyMigrations(connection, files);
  } finally {
    connection.release();
    await closePool();
  }
}

if (require.main === module) {
  main().catch((error) => {
    migrationsLogger.error("migration_runner_failed", { error });
    process.exitCode = 1;
  });
}

module.exports = {
  applyMigrations,
  MIGRATION_ORDER_BY_DATE,
  sortMigrationFiles,
};
