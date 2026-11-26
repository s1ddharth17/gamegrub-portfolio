const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function createResponseRecorder() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("operations dashboard combines failed payment metrics and actionable scheduler alerts", async (t) => {
  const originalThreshold = process.env.OPS_PAYMENT_FAILURE_THRESHOLD;
  process.env.OPS_PAYMENT_FAILURE_THRESHOLD = "2";

  const db = require("../utils/db");
  const monitor = require("../cron/monitor");
  t.mock.method(db, "query", async (sql) => {
    if (/FROM operational_alert_history/.test(sql)) return [];
    if (/GROUP BY status_code/.test(sql)) {
      return [
        { status_code: 200, requests: 10, duration_total_ms: 500 },
        { status_code: 500, requests: 2, duration_total_ms: 300 },
      ];
    }
    if (/operational_http_error_samples/.test(sql)) {
      return [{
        occurred_at: "2026-10-25T11:00:00.000Z",
        request_id: "req-api-500",
        method: "GET",
        route: "/api/booking/:id",
        status_code: 500,
        duration_ms: 200,
      }];
    }
    if (/COUNT\(\*\)/.test(sql)) {
      return [{ failed_attempts: 2, failed: 1, expired: 1 }];
    }
    return [{
      attempt_id: "attempt-45",
      booking_id: 78,
      payment_id: 91,
      status: "failed",
      failure_code: "BAD_GATEWAY",
      updated_at: "2026-10-25T11:00:00.000Z",
    }];
  });
  t.mock.method(monitor, "getCronHealthSnapshot", async () => ({
    status: "degraded",
    monitoring: "database",
    engines: {
      session_engine: {
        engine_name: "session_engine",
        label: "Session Engine",
        health: "failing",
        last_run_id: 909,
        runner_id: "runner-909",
      },
    },
  }));

  const routePath = require.resolve("../routes/adminOperations");
  delete require.cache[routePath];
  t.after(() => {
    delete require.cache[routePath];
    if (originalThreshold === undefined) delete process.env.OPS_PAYMENT_FAILURE_THRESHOLD;
    else process.env.OPS_PAYMENT_FAILURE_THRESHOLD = originalThreshold;
  });

  const router = require("../routes/adminOperations");
  const route = router.stack.find((layer) => layer.route?.path === "/").route;
  assert.equal(route.stack.length, 2, "dashboard requires an active super admin");
  const res = createResponseRecorder();
  await route.stack.at(-1).handle({ admin: { id: 1, role: "super_admin" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sources.api, "database");
  assert.equal(res.body.sources.alert_history, "database");
  assert.equal(res.body.metrics.http.requests, 12);
  assert.equal(res.body.metrics.http.server_errors, 2);
  assert.equal(res.body.metrics.http.recent_errors[0].request_id, "req-api-500");
  assert.equal(res.body.metrics.payments.failed_attempts, 2);
  assert.equal(res.body.metrics.payments.failed, 1);
  assert.equal(res.body.metrics.payments.expired, 1);
  assert.equal(res.body.metrics.payments.recent_failures[0].attempt_id, "attempt-45");
  assert.ok(res.body.alerts.active.some((alert) => alert.alert_type === "payment_failures"));
  const cronAlert = res.body.alerts.active.find((alert) => alert.alert_type === "cron_failing");
  assert.equal(cronAlert.job_run_id, 909);
  assert.equal(res.body.sources.payments, "ok");
  assert.equal(res.body.sources.scheduler, "ok");
});

test("operations dashboard rejects unauthenticated requests before reading metrics", async (t) => {
  const adminAccess = require("../utils/adminAccess");
  t.mock.method(adminAccess, "ensureAdminTableReady", async () => {});

  const routePath = require.resolve("../routes/adminOperations");
  const authPath = require.resolve("../middleware/adminAuth");
  delete require.cache[routePath];
  delete require.cache[authPath];
  t.after(() => {
    delete require.cache[routePath];
    delete require.cache[authPath];
  });

  const router = require("../routes/adminOperations");
  const route = router.stack.find((layer) => layer.route?.path === "/").route;
  const res = createResponseRecorder();
  await route.stack[0].handle({ headers: {} }, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Admin token required." });
});
