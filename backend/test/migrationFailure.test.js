const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { applyMigrations } = require("../scripts/migrate");

test("a failed migration rolls back and fails with the migration error", async (t) => {
  const migrationsDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "gamegrub-migration-failure-")
  );
  const filename = "20990101_fail_fixture_migration.js";
  await fs.writeFile(
    path.join(migrationsDirectory, filename),
    'module.exports = { async up() { throw new Error("fixture schema change failed"); } };\n'
  );
  t.after(() => fs.rm(migrationsDirectory, { recursive: true, force: true }));

  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(sql);
      if (/SELECT filename, checksum, applied_at/.test(sql)) {
        return [[]];
      }
      throw new Error(`Unexpected migration query: ${sql}`);
    },
    async beginTransaction() {
      calls.push("BEGIN");
    },
    async commit() {
      calls.push("COMMIT");
    },
    async rollback() {
      calls.push("ROLLBACK");
    },
  };

  await assert.rejects(
    applyMigrations(connection, [filename], migrationsDirectory),
    /fixture schema change failed/
  );
  assert.ok(calls.includes("BEGIN"));
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.includes("COMMIT"), false);
});

test("the migration runner reports an unavailable database as a clear failure", () => {
  const backendDirectory = path.resolve(__dirname, "..");
  const result = spawnSync(process.execPath, ["scripts/migrate.js"], {
    cwd: backendDirectory,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      DATABASE_URL: "",
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
      DB_USER: "gamegrub_test",
      DB_PASSWORD: "disposable-test-password",
      DB_NAME: "gamegrub_test",
      NODE_ENV: "test",
      APP_ENV: "test",
    },
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.notEqual(result.status, 0, "migration runner must exit nonzero if the database is unavailable");
  assert.match(output, /migration_runner_failed/);
  assert.match(output, /ECONNREFUSED|connect/i);
});
