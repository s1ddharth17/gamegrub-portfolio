const test = require("node:test");
const assert = require("node:assert/strict");

const { createOperationalMetrics } = require("../utils/operationalMetrics");

test("operational metrics alert with request and scheduler IDs and a configured webhook secret", async () => {
  const deliveries = [];
  const logEntries = [];
  const env = {
    NODE_ENV: "test",
    OPS_ALERT_WEBHOOK_URL: "https://alerts.gamegrub.test/ops",
    OPS_ALERT_WEBHOOK_SECRET: "test-secret-that-is-not-in-alert-body",
    OPS_METRICS_WINDOW_MINUTES: "5",
    OPS_API_ERROR_THRESHOLD: "2",
    OPS_PAYMENT_FAILURE_THRESHOLD: "1",
    OPS_ALERT_COOLDOWN_MINUTES: "15",
  };
  const service = createOperationalMetrics({
    env,
    now: () => new Date("2026-10-25T11:00:00.000Z"),
    activeLogger: {
      info: (event, meta) => logEntries.push({ level: "info", event, meta }),
      warn: (event, meta) => logEntries.push({ level: "warn", event, meta }),
      error: (event, meta) => logEntries.push({ level: "error", event, meta }),
    },
    fetchImpl: async (url, options) => {
      deliveries.push({ url, options });
      return { ok: true, status: 204 };
    },
  });

  service.recordHttpResponse({
    requestId: "req-api-1",
    method: "GET",
    route: "/api/booking/:id",
    statusCode: 500,
    durationMs: 40,
  });
  service.recordHttpResponse({
    requestId: "req-api-2",
    method: "POST",
    route: "/api/payment/intents",
    statusCode: 502,
    durationMs: 90,
  });
  service.recordHttpResponse({
    requestId: "req-api-3",
    method: "POST",
    route: "/api/payment/intents",
    statusCode: 500,
    durationMs: 30,
  });
  service.recordPaymentFailure({
    requestId: "req-pay-1",
    attemptId: "attempt-101",
    bookingId: 202,
    paymentId: 303,
    failureCode: "BAD_GATEWAY",
  });
  service.recordCronFailure({
    engineName: "session_engine",
    runId: 404,
    errorCode: "ER_LOCK_WAIT_TIMEOUT",
  });
  await service.flushPendingDeliveries();

  const snapshot = service.getOperationalMetricsSnapshot();
  assert.equal(snapshot.http.requests, 3);
  assert.equal(snapshot.http.server_errors, 3);
  assert.equal(snapshot.http.error_rate_percent, 100);
  assert.equal(snapshot.payment_events.observed_failures, 1);
  assert.equal(snapshot.alert_delivery.configured, true);

  const alerts = deliveries.map(({ options }) => JSON.parse(options.body));
  const apiAlert = alerts.find((alert) => alert.alert_type === "api_server_errors");
  assert.equal(apiAlert.request_id, "req-api-2");
  assert.deepEqual(apiAlert.details.request_ids, ["req-api-2", "req-api-1"]);
  assert.equal(alerts.find((alert) => alert.alert_type === "payment_failures").request_id, "req-pay-1");
  assert.equal(alerts.find((alert) => alert.alert_type === "cron_failing").job_run_id, 404);
  assert.ok(deliveries.every(({ url }) => url === env.OPS_ALERT_WEBHOOK_URL));
  assert.ok(deliveries.every(({ options }) =>
    options.headers["x-gamegrub-alert-secret"] === env.OPS_ALERT_WEBHOOK_SECRET
  ));
  assert.equal(alerts.some((alert) => JSON.stringify(alert).includes(env.OPS_ALERT_WEBHOOK_SECRET)), false);
  assert.equal(logEntries.filter((entry) => entry.event === "operational_alert").length, 3);
  assert.equal(logEntries.filter((entry) => entry.event === "operational_alert_delivered").length, 3);
});
