const { randomUUID } = require("node:crypto");

const RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function asSqlDateTime(date, includeMilliseconds = false) {
  const iso = date.toISOString();
  return includeMilliseconds
    ? iso.slice(0, 23).replace("T", " ")
    : iso.slice(0, 19).replace("T", " ");
}

function normalizeSampleRoute(value) {
  return String(value || "unknown")
    .split("?")[0]
    .split("/")
    .map((segment) => {
      if (
        /^\d+$/.test(segment) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
        /^[^/\s@]+@[^/\s@]+$/.test(segment) ||
        segment.length > 72
      ) {
        return ":id";
      }
      return segment;
    })
    .join("/")
    .slice(0, 180);
}

function createOperationalMetricStore({
  executeQuery = null,
  executeTransaction = null,
  instanceId = randomUUID(),
  now = () => new Date(),
} = {}) {
  const runQuery = executeQuery || ((...args) => require("./db").query(...args));
  const runTransaction = executeTransaction || ((work) => require("./db").withTransaction(work));
  let lastCleanupAt = new Date(now()).getTime();
  let cleanupPromise = null;

  async function pruneExpiredMetrics(currentTime) {
    const currentMs = currentTime.getTime();
    if (currentMs - lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }
    if (cleanupPromise) {
      await cleanupPromise;
      return;
    }

    cleanupPromise = (async () => {
      try {
        await runQuery(
          `DELETE FROM operational_http_error_samples
           WHERE occurred_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RETENTION_DAYS} DAY)`
        );
        await runQuery(
          `DELETE FROM operational_http_minute_metrics
           WHERE minute_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RETENTION_DAYS} DAY)`
        );
        await runQuery(
          `DELETE FROM operational_alert_history
           WHERE occurred_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RETENTION_DAYS} DAY)`
        );
      } finally {
        lastCleanupAt = currentMs;
      }
    })();

    try {
      await cleanupPromise;
    } finally {
      cleanupPromise = null;
    }
  }

  async function recordHttpResponse(event) {
    const occurredAt = new Date(event.occurred_at || now());
    const minuteStart = new Date(Math.floor(occurredAt.getTime() / 60000) * 60000);
    const statusCode = Math.max(0, Math.min(65535, Math.trunc(Number(event.status_code) || 0)));
    const durationMs = Math.max(0, Math.round(Number(event.duration_ms) || 0));

    await runQuery(
      `INSERT INTO operational_http_minute_metrics (
         minute_start, instance_id, status_code, request_count, duration_total_ms
       ) VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         request_count = request_count + 1,
         duration_total_ms = duration_total_ms + VALUES(duration_total_ms)`,
      [asSqlDateTime(minuteStart), instanceId, statusCode, durationMs]
    );

    if (statusCode >= 500) {
      await runQuery(
        `INSERT INTO operational_http_error_samples (
           occurred_at, request_id, method, route, status_code, duration_ms
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          asSqlDateTime(occurredAt, true),
          event.request_id || null,
          String(event.method || "").slice(0, 10),
          normalizeSampleRoute(event.route),
          statusCode,
          durationMs,
        ]
      );
    }

    await pruneExpiredMetrics(new Date(now()));
  }

  async function getHttpMetricsSnapshot(windowMinutes) {
    const [statusRows, recentErrorRows] = await Promise.all([
      runQuery(
        `SELECT
           status_code,
           SUM(request_count) AS requests,
           SUM(duration_total_ms) AS duration_total_ms
         FROM operational_http_minute_metrics
         WHERE minute_start >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
         GROUP BY status_code`,
        [windowMinutes]
      ),
      runQuery(
        `SELECT occurred_at, request_id, method, route, status_code, duration_ms
         FROM operational_http_error_samples
         WHERE occurred_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
         ORDER BY occurred_at DESC, id DESC
         LIMIT 25`,
        [windowMinutes]
      ),
    ]);

    const rows = Array.isArray(statusRows) ? statusRows : [];
    const requests = rows.reduce((total, row) => total + Number(row.requests || 0), 0);
    const durationTotal = rows.reduce(
      (total, row) => total + Number(row.duration_total_ms || 0),
      0
    );
    const errorsByStatus = {};
    let serverErrors = 0;
    for (const row of rows) {
      const statusCode = Number(row.status_code || 0);
      if (statusCode < 500) continue;
      const count = Number(row.requests || 0);
      errorsByStatus[String(statusCode)] = count;
      serverErrors += count;
    }

    return {
      requests,
      server_errors: serverErrors,
      error_rate_percent: requests ? Number(((serverErrors / requests) * 100).toFixed(2)) : 0,
      average_duration_ms: requests ? Number((durationTotal / requests).toFixed(2)) : 0,
      errors_by_status: errorsByStatus,
      recent_errors: (Array.isArray(recentErrorRows) ? recentErrorRows : []).map((row) => ({
        occurred_at: row.occurred_at,
        request_id: row.request_id || null,
        method: row.method,
        route: row.route,
        status_code: Number(row.status_code || 0),
        duration_ms: Number(row.duration_ms || 0),
      })),
    };
  }

  async function claimAndRecordOperationalAlert({
    alertKey,
    cooldownSeconds,
    alert,
    deliveryStatus = "not_configured",
  }) {
    const key = String(alertKey || "operational_event").slice(0, 120);
    const cooldown = Math.min(86400, Math.max(1, Math.trunc(Number(cooldownSeconds) || 1)));
    const status = new Set(["pending", "not_configured"]).has(deliveryStatus)
      ? deliveryStatus
      : "not_configured";

    return runTransaction(async (connection) => {
      await connection.query(
        `INSERT IGNORE INTO operational_alert_cooldowns
           (alert_key, last_alert_at, alert_id)
         VALUES (?, '1970-01-01 00:00:00.000', '00000000-0000-0000-0000-000000000000')`,
        [key]
      );
      const [cooldownRows] = await connection.query(
        `SELECT CASE
           WHEN last_alert_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${cooldown} SECOND) THEN 1
           ELSE 0
         END AS can_emit
         FROM operational_alert_cooldowns
         WHERE alert_key = ?
         FOR UPDATE`,
        [key]
      );
      if (Number(cooldownRows[0]?.can_emit || 0) !== 1) return false;

      await connection.query(
        `UPDATE operational_alert_cooldowns
         SET last_alert_at = UTC_TIMESTAMP(3), alert_id = ?
         WHERE alert_key = ?`,
        [alert.alert_id, key]
      );
      await connection.query(
        `INSERT INTO operational_alert_history (
           alert_id, alert_key, alert_type, severity, service, environment,
           occurred_at, summary, request_id, job_run_id, details_json, delivery_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alert.alert_id,
          key,
          alert.alert_type,
          alert.severity,
          alert.service,
          alert.environment,
          asSqlDateTime(new Date(alert.occurred_at), true),
          String(alert.summary || "").slice(0, 500),
          alert.request_id || null,
          alert.job_run_id ? String(alert.job_run_id).slice(0, 128) : null,
          JSON.stringify(alert.details || {}),
          status,
        ]
      );
      return true;
    });
  }

  async function markOperationalAlertDelivery({ alertId, status, errorCode = null }) {
    const deliveryStatus = new Set(["delivered", "failed", "not_configured"]).has(status)
      ? status
      : "failed";
    await runQuery(
      `UPDATE operational_alert_history
       SET delivery_status = ?,
           delivery_error_code = ?,
           delivered_at = CASE WHEN ? = 'delivered' THEN UTC_TIMESTAMP(3) ELSE delivered_at END
       WHERE alert_id = ?`,
      [deliveryStatus, String(errorCode || "").slice(0, 80) || null, deliveryStatus, alertId]
    );
  }

  async function getRecentOperationalAlerts(limit = 20) {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)));
    const rows = await runQuery(
      `SELECT alert_id, alert_type, severity, service, environment, occurred_at,
              summary, request_id, job_run_id, details_json, delivery_status,
              delivery_error_code, delivered_at
       FROM operational_alert_history
       ORDER BY occurred_at DESC, id DESC
       LIMIT ${safeLimit}`
    );

    return (Array.isArray(rows) ? rows : []).map((row) => {
      let details = {};
      try {
        details = JSON.parse(row.details_json || "{}");
      } catch (_) {
        details = {};
      }
      return {
        alert_id: row.alert_id,
        alert_type: row.alert_type,
        severity: row.severity,
        service: row.service,
        environment: row.environment,
        occurred_at: row.occurred_at,
        summary: row.summary,
        request_id: row.request_id || null,
        job_run_id: row.job_run_id || null,
        details,
        delivery_status: row.delivery_status,
        delivery_error_code: row.delivery_error_code || null,
        delivered_at: row.delivered_at || null,
      };
    });
  }

  return {
    claimAndRecordOperationalAlert,
    getHttpMetricsSnapshot,
    getRecentOperationalAlerts,
    markOperationalAlertDelivery,
    recordHttpResponse,
  };
}

const operationalMetricStore = createOperationalMetricStore();

module.exports = {
  createOperationalMetricStore,
  operationalMetricStore,
};
