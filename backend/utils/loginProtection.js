function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const LOGIN_LOCKOUT_MAX_ATTEMPTS = parsePositiveInt(
  process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS,
  5
);
const LOGIN_LOCKOUT_WINDOW_MINUTES = parsePositiveInt(
  process.env.LOGIN_LOCKOUT_WINDOW_MINUTES,
  15
);
const LOGIN_LOCKOUT_DURATION_MINUTES = parsePositiveInt(
  process.env.LOGIN_LOCKOUT_DURATION_MINUTES,
  30
);

function toDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLockoutState(row, now = new Date()) {
  const lockedUntil = toDate(row?.locked_until);
  if (!lockedUntil || lockedUntil <= now) {
    return {
      locked: false,
      lockedUntil: null,
    };
  }

  return {
    locked: true,
    lockedUntil,
    remainingMs: lockedUntil.getTime() - now.getTime(),
  };
}

function computeFailedLoginUpdate(row, now = new Date()) {
  const failedAttempts = Math.max(0, Number(row?.failed_login_attempts || 0));
  const lastFailedLoginAt = toDate(row?.last_failed_login_at);
  const windowMs = LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000;
  const durationMs = LOGIN_LOCKOUT_DURATION_MINUTES * 60 * 1000;
  const isWithinWindow =
    lastFailedLoginAt && now.getTime() - lastFailedLoginAt.getTime() <= windowMs;
  const nextAttempts = (isWithinWindow ? failedAttempts : 0) + 1;
  const shouldLock = nextAttempts >= LOGIN_LOCKOUT_MAX_ATTEMPTS;

  return {
    failedLoginAttempts: shouldLock ? 0 : nextAttempts,
    lastFailedLoginAt: now,
    lockedUntil: shouldLock ? new Date(now.getTime() + durationMs) : null,
    lockedNow: shouldLock,
    attemptsRemaining: shouldLock ? 0 : Math.max(0, LOGIN_LOCKOUT_MAX_ATTEMPTS - nextAttempts),
  };
}

function buildLockoutMessage({ actorLabel = "Account", lockedUntil, now = new Date() }) {
  const expiresAt = toDate(lockedUntil);

  if (!expiresAt || expiresAt <= now) {
    return `${actorLabel} is not locked.`;
  }

  const remainingMinutes = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 1000))
  );

  return `${actorLabel} is temporarily locked due to repeated failed sign-in attempts. Try again in about ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`;
}

module.exports = {
  LOGIN_LOCKOUT_DURATION_MINUTES,
  LOGIN_LOCKOUT_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  buildLockoutMessage,
  computeFailedLoginUpdate,
  getLockoutState,
};
