const test = require("node:test");
const assert = require("node:assert/strict");

const { createLogger } = require("../utils/logger");

function restoreProcessEnv(snapshot) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, snapshot);
}

test("production logger redacts sensitive fields and hides stack traces", (t) => {
  const envSnapshot = { ...process.env };
  const originalError = console.error;
  const lines = [];

  process.env.NODE_ENV = "production";
  process.env.APP_ENV = "production";
  process.env.LOG_LEVEL = "error";
  console.error = (line) => lines.push(line);

  t.after(() => {
    console.error = originalError;
    restoreProcessEnv(envSnapshot);
  });

  const logger = createLogger();
  logger.error("redaction_check", {
    password: "plain-text-password",
    refresh_token: "plain-text-refresh-token",
    error: new Error("boom"),
  });

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);

  assert.equal(entry.password, "[redacted]");
  assert.equal(entry.refresh_token, "[redacted]");
  assert.equal(entry.error.message, "boom");
  assert.equal(entry.error.stack, undefined);
});`n`n