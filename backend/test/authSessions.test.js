const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRefreshExpiryDate, hashRefreshToken } = require("../utils/authSessions");

test("hashRefreshToken is deterministic and non-empty", () => {
  const first = hashRefreshToken("refresh-token-value");
  const second = hashRefreshToken("refresh-token-value");

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("buildRefreshExpiryDate adds at least one day to the base date", () => {
  const baseDate = new Date("2026-04-13T10:00:00Z");
  const expiry = buildRefreshExpiryDate(baseDate);

  assert.equal(expiry > baseDate, true);
  assert.equal(expiry.getTime() - baseDate.getTime() >= 24 * 60 * 60 * 1000, true);
});
