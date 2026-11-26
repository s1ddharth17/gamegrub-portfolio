function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase();
}

function isProductionEnvironment(env = process.env) {
  const nodeEnv = normalizeEnvironment(env.NODE_ENV);
  const appEnv = normalizeEnvironment(env.APP_ENV);
  return nodeEnv === "production" || appEnv === "production";
}

function parseBoolean(value) {
  const normalized = normalizeEnvironment(value);
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function looksLikePlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    normalized === "gamegrub_secret" ||
    normalized.startsWith("replace-with-") ||
    normalized.includes("your-openai-api-key") ||
    normalized.includes("example.com") ||
    normalized === "changeme" ||
    normalized === "change-me"
  );
}

function hasStrongSecret(value, minimumLength = 32) {
  const normalized = String(value || "").trim();
  return normalized.length >= minimumLength && !looksLikePlaceholder(normalized);
}

function buildStartupConfigReport(env = process.env) {
  const errors = [];
  const warnings = [];
  const production = isProductionEnvironment(env);
  const uploadStorage = normalizeEnvironment(env.UPLOAD_STORAGE || "local");
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (!production) {
    return {
      errors,
      warnings,
      isProduction: false,
      allowedOrigins,
    };
  }

  if (!hasStrongSecret(env.JWT_SECRET)) {
    errors.push(
      "JWT_SECRET must be set to a long random value before starting production."
    );
  }

  if (!hasStrongSecret(env.OTP_PEPPER)) {
    errors.push(
      "OTP_PEPPER must be set to a long random value before starting production."
    );
  }

  if (allowedOrigins.length === 0) {
    errors.push(
      "CORS_ALLOWED_ORIGINS must list the allowed browser origins in production."
    );
  }

  if (uploadStorage === "s3") {
    if (!String(env.AWS_REGION || "").trim()) {
      errors.push("AWS_REGION is required when UPLOAD_STORAGE=s3.");
    }

    if (!String(env.S3_BUCKET_NAME || "").trim()) {
      errors.push("S3_BUCKET_NAME is required when UPLOAD_STORAGE=s3.");
    }
  }

  if (parseBoolean(env.ENABLE_IN_PROCESS_CRON)) {
    warnings.push(
      "ENABLE_IN_PROCESS_CRON is enabled in production. Prefer an external scheduler or dedicated worker."
    );
  }

  if (!String(env.SMTP_HOST || "").trim()) {
    warnings.push(
      "SMTP_HOST is not configured. Registration and password-reset email flows will fail in production."
    );
  }

  if (!String(env.RAZORPAY_KEY_ID || "").trim() || !String(env.RAZORPAY_KEY_SECRET || "").trim()) {
    warnings.push(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured. Online payment checkout will be unavailable in production."
    );
  }
  if (!String(env.RAZORPAY_WEBHOOK_SECRET || "").trim()) {
    warnings.push(
      "RAZORPAY_WEBHOOK_SECRET is not configured. Signed Razorpay webhook updates will be unavailable in production."
    );
  }
  if (!String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim()) {
    warnings.push(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not configured. Firebase push delivery will be unavailable in production."
    );
  }
  if (!String(env.FIREBASE_WEB_VAPID_KEY || "").trim()) {
    warnings.push(
      "FIREBASE_WEB_VAPID_KEY is not configured. Browser push subscriptions will be unavailable in production."
    );
  }

  const alertWebhookUrl = String(env.OPS_ALERT_WEBHOOK_URL || "").trim();
  const alertWebhookSecret = String(env.OPS_ALERT_WEBHOOK_SECRET || "").trim();
  if (!alertWebhookUrl) {
    warnings.push(
      "OPS_ALERT_WEBHOOK_URL is not configured. Operational alerts will be logged but not delivered externally."
    );
  } else {
    let parsedWebhookUrl;
    try {
      parsedWebhookUrl = new URL(alertWebhookUrl);
    } catch (_) {
      errors.push("OPS_ALERT_WEBHOOK_URL must be a valid HTTPS URL.");
    }
    if (parsedWebhookUrl && parsedWebhookUrl.protocol !== "https:") {
      errors.push("OPS_ALERT_WEBHOOK_URL must use HTTPS in production.");
    }
    if (!alertWebhookSecret) {
      errors.push(
        "OPS_ALERT_WEBHOOK_SECRET is required when OPS_ALERT_WEBHOOK_URL is configured."
      );
    } else if (alertWebhookSecret.length < 24 || looksLikePlaceholder(alertWebhookSecret)) {
      errors.push("OPS_ALERT_WEBHOOK_SECRET must be a long random value.");
    }
  }

  return {
    errors,
    warnings,
    isProduction: true,
    allowedOrigins,
  };
}

function assertStartupConfig({ env = process.env, logger } = {}) {
  const report = buildStartupConfigReport(env);

  for (const warning of report.warnings) {
    logger?.warn?.("startup_config_warning", {
      message: warning,
    });
  }

  if (report.errors.length > 0) {
    const error = new Error(
      `Invalid startup configuration: ${report.errors.join(" ")}`
    );
    error.code = "INVALID_STARTUP_CONFIG";
    error.details = report.errors;
    throw error;
  }

  return report;
}

module.exports = {
  assertStartupConfig,
  buildStartupConfigReport,
  isProductionEnvironment,
  parseAllowedOrigins,
  parseBoolean,
};
