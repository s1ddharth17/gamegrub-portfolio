const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStartupConfigReport,
  parseAllowedOrigins,
} = require("../config/runtime");

test("parseAllowedOrigins returns a clean list", () => {
  assert.deepEqual(
    parseAllowedOrigins(" https://admin.example.com, http://localhost:3000 ,, "),
    ["https://admin.example.com", "http://localhost:3000"]
  );
});

test("buildStartupConfigReport rejects weak production secrets and empty cors", () => {
  const report = buildStartupConfigReport({
    NODE_ENV: "production",
    APP_ENV: "production",
    JWT_SECRET: "gamegrub_secret",
    OTP_PEPPER: "replace-with-a-long-random-secret",
    CORS_ALLOWED_ORIGINS: "",
    ENABLE_IN_PROCESS_CRON: "false",
  });

  assert.equal(report.isProduction, true);
  assert.match(report.errors.join(" "), /JWT_SECRET/i);
  assert.match(report.errors.join(" "), /OTP_PEPPER/i);
  assert.match(report.errors.join(" "), /CORS_ALLOWED_ORIGINS/i);
});

test("buildStartupConfigReport warns when production cron stays in-process", () => {
  const report = buildStartupConfigReport({
    NODE_ENV: "production",
    APP_ENV: "production",
    JWT_SECRET: "12345678901234567890123456789012-long-secret",
    OTP_PEPPER: "abcdefghijklmnopqrstuvwxyz123456",
    CORS_ALLOWED_ORIGINS: "https://admin.example.com",
    ENABLE_IN_PROCESS_CRON: "true",
  });

  assert.deepEqual(report.errors, []);
  assert.match(report.warnings.join(" "), /external scheduler/i);
});

test("buildStartupConfigReport warns when production payment and push providers are not configured", () => {
  const report = buildStartupConfigReport({
    NODE_ENV: "production",
    APP_ENV: "production",
    JWT_SECRET: "12345678901234567890123456789012-long-secret",
    OTP_PEPPER: "abcdefghijklmnopqrstuvwxyz123456",
    CORS_ALLOWED_ORIGINS: "https://admin.gamegrub.app",
    SMTP_HOST: "smtp.gamegrub.app",
    ENABLE_IN_PROCESS_CRON: "false",
    OPS_ALERT_WEBHOOK_URL: "https://alerts.gamegrub.app/events",
    OPS_ALERT_WEBHOOK_SECRET: "a-strong-random-webhook-secret-123456",
  });

  assert.deepEqual(report.errors, []);
  assert.match(report.warnings.join(" "), /RAZORPAY_KEY_ID/);
  assert.match(report.warnings.join(" "), /RAZORPAY_WEBHOOK_SECRET/);
  assert.match(report.warnings.join(" "), /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(report.warnings.join(" "), /FIREBASE_WEB_VAPID_KEY/);
});

test("buildStartupConfigReport requires a protected HTTPS operational alert webhook", () => {
  const baseEnv = {
    NODE_ENV: "production",
    APP_ENV: "production",
    JWT_SECRET: "12345678901234567890123456789012-long-secret",
    OTP_PEPPER: "abcdefghijklmnopqrstuvwxyz123456",
    CORS_ALLOWED_ORIGINS: "https://admin.gamegrub.app",
    SMTP_HOST: "smtp.example.net",
    ENABLE_IN_PROCESS_CRON: "false",
    RAZORPAY_KEY_ID: "rzp_test_gamegrub",
    RAZORPAY_KEY_SECRET: "razorpay-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "razorpay-webhook-test-secret",
    FIREBASE_SERVICE_ACCOUNT_JSON: "{\"type\":\"service_account\"}",
    FIREBASE_WEB_VAPID_KEY: "firebase-test-vapid-key",
  };

  const missingWebhook = buildStartupConfigReport(baseEnv);
  assert.match(missingWebhook.warnings.join(" "), /OPS_ALERT_WEBHOOK_URL/i);

  const missingSecret = buildStartupConfigReport({
    ...baseEnv,
    OPS_ALERT_WEBHOOK_URL: "https://alerts.gamegrub.net/webhook",
  });
  assert.match(missingSecret.errors.join(" "), /OPS_ALERT_WEBHOOK_SECRET/i);

  const insecureWebhook = buildStartupConfigReport({
    ...baseEnv,
    OPS_ALERT_WEBHOOK_URL: "http://alerts.gamegrub.net/webhook",
    OPS_ALERT_WEBHOOK_SECRET: "random-strong-secret-value-123456",
  });
  assert.match(insecureWebhook.errors.join(" "), /HTTPS/i);

  const configuredWebhook = buildStartupConfigReport({
    ...baseEnv,
    OPS_ALERT_WEBHOOK_URL: "https://alerts.gamegrub.net/webhook",
    OPS_ALERT_WEBHOOK_SECRET: "random-strong-secret-value-123456",
  });
  assert.deepEqual(configuredWebhook.errors, []);
  assert.equal(configuredWebhook.warnings.length, 0);
});
