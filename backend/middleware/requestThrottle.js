const DEFAULT_MESSAGE = "Too many requests. Please try again shortly.";

const buckets = new Map();

function normalizeWindowMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanupExpiredBuckets(now) {
  for (const [key, entry] of buckets.entries()) {
    if (!entry || entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  keyPrefix = "global",
  message = DEFAULT_MESSAGE,
  keyBuilder,
} = {}) {
  const resolvedWindowMs = normalizeWindowMs(windowMs, 60 * 1000);
  const resolvedMax = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : 10;

  return (req, res, next) => {
    const now = Date.now();

    if (buckets.size > 2000) {
      cleanupExpiredBuckets(now);
    }

    const rawKey =
      typeof keyBuilder === "function"
        ? keyBuilder(req)
        : req.user?.id || req.ip || req.headers["x-forwarded-for"] || "anonymous";
    const key = `${keyPrefix}:${String(rawKey || "anonymous")}`;

    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + resolvedWindowMs,
      });
      return next();
    }

    current.count += 1;

    if (current.count > resolvedMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retry_after_seconds: retryAfterSeconds,
      });
    }

    return next();
  };
}

function byIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || "anonymous";
}

function byUserOrIp(req) {
  return req.user?.id || byIp(req);
}

module.exports = {
  createRateLimiter,
  authAttemptLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: "auth-attempt",
    keyBuilder: byIp,
    message: "Too many login attempts. Please wait before trying again.",
  }),
  otpRequestLimiter: createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyPrefix: "otp-request",
    keyBuilder: byIp,
    message: "Too many verification requests. Please wait before requesting another code.",
  }),
  otpVerifyLimiter: createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 8,
    keyPrefix: "otp-verify",
    keyBuilder: byIp,
    message: "Too many verification attempts. Please request a new code or try again later.",
  }),
  aiQueryLimiter: createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 20,
    keyPrefix: "ai-query",
    keyBuilder: byUserOrIp,
    message: "Too many GameGuru requests. Please wait a moment and try again.",
  }),
  paymentAttemptLimiter: createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 12,
    keyPrefix: "payment-attempt",
    keyBuilder: byUserOrIp,
    message: "Too many payment-related requests. Please wait a moment and try again.",
  }),
};
