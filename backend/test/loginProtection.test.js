const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOGIN_LOCKOUT_MAX_ATTEMPTS,
  buildLockoutMessage,
  computeFailedLoginUpdate,
  getLockoutState,
} = require("../utils/loginProtection");

test("computeFailedLoginUpdate increments attempts inside the active window", () => {
  const now = new Date("2026-04-14T10:00:00Z");
  const result = computeFailedLoginUpdate(
    {
      failed_login_attempts: 2,
      last_failed_login_at: new Date("2026-04-14T09:55:00Z"),
    },
    now
  );

  assert.equal(result.failedLoginAttempts, 3);
  assert.equal(result.lockedNow, false);
  assert.equal(result.attemptsRemaining, Math.max(0, LOGIN_LOCKOUT_MAX_ATTEMPTS - 3));
});

test("computeFailedLoginUpdate locks the account at the configured threshold", () => {
  const now = new Date("2026-04-14T10:00:00Z");
  const result = computeFailedLoginUpdate(
    {
      failed_login_attempts: LOGIN_LOCKOUT_MAX_ATTEMPTS - 1,
      last_failed_login_at: new Date("2026-04-14T09:58:00Z"),
    },
    now
  );

  assert.equal(result.failedLoginAttempts, 0);
  assert.equal(result.lockedNow, true);
  assert.equal(result.lockedUntil > now, true);
});

test("getLockoutState reports a lock while locked_until is in the future", () => {
  const state = getLockoutState(
    { locked_until: new Date("2026-04-14T10:30:00Z") },
    new Date("2026-04-14T10:00:00Z")
  );

  assert.equal(state.locked, true);
  assert.equal(state.lockedUntil.toISOString(), "2026-04-14T10:30:00.000Z");
});

test("buildLockoutMessage includes the actor label and retry guidance", () => {
  const message = buildLockoutMessage({
    actorLabel: "Admin account",
    lockedUntil: new Date("2026-04-14T10:30:00Z"),
    now: new Date("2026-04-14T10:00:00Z"),
  });

  assert.match(message, /Admin account is temporarily locked/i);
  assert.match(message, /30 minute/i);
});
