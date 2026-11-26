const test = require("node:test");
const assert = require("node:assert/strict");

const { createOperationalMetricStore } = require("../utils/operationalMetricStore");

test("HTTP metric snapshots aggregate shared status buckets and correlated errors", async () => {
  const service = createOperationalMetricStore({
    executeQuery: async (sql) => {
      if (/GROUP BY status_code/.test(sql)) {
        return [
          { status_code: 200, requests: 8, duration_total_ms: 800 },
          { status_code: 500, requests: 2, duration_total_ms: 400 },
        ];
      }
      return [{
        occurred_at: "2026-11-26 10:00:00.000",
        request_id: "req-500",
        method: "POST",
        route: "/api/booking/:id",
        status_code: 500,
        duration_ms: 240,
      }];
    },
    now: () => new Date("2026-11-26T10:01:00.000Z"),
  });

  const snapshot = await service.getHttpMetricsSnapshot(5);

  assert.equal(snapshot.requests, 10);
  assert.equal(snapshot.server_errors, 2);
  assert.equal(snapshot.error_rate_percent, 20);
  assert.equal(snapshot.average_duration_ms, 120);
  assert.deepEqual(snapshot.errors_by_status, { 500: 2 });
  assert.equal(snapshot.recent_errors[0].request_id, "req-500");
});

test("HTTP responses persist in minute buckets and 5xx samples use safe routes", async () => {
  const calls = [];
  const service = createOperationalMetricStore({
    executeQuery: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
    instanceId: "00000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-11-26T10:01:12.000Z"),
  });

  await service.recordHttpResponse({
    occurred_at: "2026-11-26T10:00:48.000Z",
    request_id: "req-500",
    method: "GET",
    route: "/api/booking/123?token=private",
    status_code: 502,
    duration_ms: 80,
  });

  assert.match(calls[0].sql, /INSERT INTO operational_http_minute_metrics/);
  assert.deepEqual(calls[0].params, [
    "2026-11-26 10:00:00",
    "00000000-0000-4000-8000-000000000001",
    502,
    80,
  ]);
  assert.match(calls[1].sql, /INSERT INTO operational_http_error_samples/);
  assert.equal(calls[1].params[3], "/api/booking/:id");
  assert.equal(calls[1].params.includes("token=private"), false);
});

test("expired HTTP buckets and error samples are pruned periodically", async () => {
  const calls = [];
  let currentTime = new Date("2026-11-26T10:00:00.000Z");
  const service = createOperationalMetricStore({
    executeQuery: async (sql) => {
      calls.push(sql);
      return [];
    },
    now: () => currentTime,
  });
  const event = {
    occurred_at: "2026-11-26T10:00:00.000Z",
    status_code: 200,
    duration_ms: 10,
  };

  await service.recordHttpResponse(event);
  currentTime = new Date("2026-11-26T16:00:01.000Z");
  await service.recordHttpResponse({ ...event, occurred_at: currentTime.toISOString() });

  assert.equal(calls.filter((sql) => /DELETE FROM operational_http_error_samples/.test(sql)).length, 1);
  assert.equal(calls.filter((sql) => /DELETE FROM operational_http_minute_metrics/.test(sql)).length, 1);
  assert.equal(calls.filter((sql) => /DELETE FROM operational_alert_history/.test(sql)).length, 1);
});

test("operational alert history claims one shared cooldown and persists delivery status", async () => {
  let currentTime = new Date("2026-11-26T10:00:00.000Z");
  const cooldowns = new Map();
  const history = [];
  const service = createOperationalMetricStore({
    now: () => currentTime,
    executeTransaction: async (work) => work({
      query: async (sql, params = []) => {
        if (/INSERT IGNORE INTO operational_alert_cooldowns/.test(sql)) {
          if (!cooldowns.has(params[0])) cooldowns.set(params[0], new Date("1970-01-01T00:00:00.000Z"));
          return [{ affectedRows: 1 }];
        }
        if (/SELECT CASE/.test(sql)) {
          const seconds = Number(sql.match(/INTERVAL (\d+) SECOND/)[1]);
          const lastAlertAt = cooldowns.get(params[0]);
          const canEmit = currentTime.getTime() - lastAlertAt.getTime() >= seconds * 1000;
          return [[{ can_emit: canEmit ? 1 : 0 }]];
        }
        if (/UPDATE operational_alert_cooldowns/.test(sql)) {
          cooldowns.set(params[1], new Date(currentTime));
          return [{ affectedRows: 1 }];
        }
        if (/INSERT INTO operational_alert_history/.test(sql)) {
          history.push({
            alert_id: params[0],
            alert_key: params[1],
            alert_type: params[2],
            severity: params[3],
            service: params[4],
            environment: params[5],
            occurred_at: params[6],
            summary: params[7],
            request_id: params[8],
            job_run_id: params[9],
            details_json: params[10],
            delivery_status: params[11],
          });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      },
    }),
    executeQuery: async (sql, params = []) => {
      if (/UPDATE operational_alert_history/.test(sql)) {
        const row = history.find((entry) => entry.alert_id === params[3]);
        if (row) {
          row.delivery_status = params[0];
          row.delivery_error_code = params[1];
        }
        return [];
      }
      if (/FROM operational_alert_history/.test(sql)) return [...history].reverse();
      throw new Error(`Unexpected query: ${sql}`);
    },
  });
  const buildAlert = (alertId) => ({
    alert_id: alertId,
    alert_type: "api_server_errors",
    severity: "critical",
    service: "backend",
    environment: "test",
    occurred_at: currentTime.toISOString(),
    summary: "Server error threshold exceeded.",
    request_id: "req-500",
    details: { route: "/api/booking/:id" },
  });

  assert.equal(await service.claimAndRecordOperationalAlert({
    alertKey: "api_server_errors",
    cooldownSeconds: 900,
    alert: buildAlert("alert-1"),
    deliveryStatus: "pending",
  }), true);
  assert.equal(await service.claimAndRecordOperationalAlert({
    alertKey: "api_server_errors",
    cooldownSeconds: 900,
    alert: buildAlert("alert-2"),
    deliveryStatus: "pending",
  }), false);

  currentTime = new Date("2026-11-26T10:16:00.000Z");
  assert.equal(await service.claimAndRecordOperationalAlert({
    alertKey: "api_server_errors",
    cooldownSeconds: 900,
    alert: buildAlert("alert-3"),
    deliveryStatus: "pending",
  }), true);
  await service.markOperationalAlertDelivery({ alertId: "alert-3", status: "delivered" });

  const alerts = await service.getRecentOperationalAlerts(20);
  assert.deepEqual(alerts.map((alert) => alert.alert_id), ["alert-3", "alert-1"]);
  assert.equal(alerts[0].delivery_status, "delivered");
  assert.deepEqual(alerts[0].details, { route: "/api/booking/:id" });
});
