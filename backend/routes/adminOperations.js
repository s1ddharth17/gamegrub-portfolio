const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const { query } = require("../utils/db");
const { getCronHealthSnapshot } = require("../cron/monitor");
const { operationalMetricStore } = require("../utils/operationalMetricStore");
const {
  getOperationalAlertConfig,
  getOperationalMetricsSnapshot,
} = require("../utils/operationalMetrics");

const router = express.Router();

function buildActiveAlerts({ metrics, paymentCounts, cronSnapshot }) {
  const alerts = [];
  const apiErrors = Number(metrics.http.server_errors || 0);
  if (apiErrors >= metrics.thresholds.api_server_errors) {
    const latestError = metrics.http.recent_errors[0] || {};
    alerts.push({
      alert_type: "api_server_errors",
      severity: "critical",
      summary: `${apiErrors} server errors in the last ${metrics.window_minutes} minutes.`,
      request_id: latestError.request_id || null,
      job_run_id: null,
    });
  }

  const failedPayments = Number(paymentCounts?.failed_attempts || 0);
  if (failedPayments >= metrics.thresholds.payment_failures) {
    const latestFailure = metrics.payment_events.recent_failures[0] || {};
    alerts.push({
      alert_type: "payment_failures",
      severity: "critical",
      summary: `${failedPayments} payment attempts failed or expired in the last ${metrics.window_minutes} minutes.`,
      request_id: latestFailure.request_id || null,
      job_run_id: null,
    });
  }

  if (cronSnapshot?.monitoring === "unavailable") {
    alerts.push({
      alert_type: "cron_monitoring_unavailable",
      severity: "critical",
      summary: "Cron run history is unavailable.",
      request_id: null,
      job_run_id: null,
    });
  }
  for (const engine of Object.values(cronSnapshot?.engines || {})) {
    if (engine.health === "healthy") continue;
    alerts.push({
      alert_type: `cron_${engine.health}`,
      severity: "critical",
      summary: `${engine.label} is ${engine.health.replaceAll("_", " ")}.`,
      request_id: null,
      job_run_id: engine.last_run_id || engine.runner_id || null,
      engine_name: engine.engine_name,
    });
  }
  return alerts;
}

router.get(
  "/",
  adminAuth.requireSuperAdmin,
  async (req, res) => {
    const config = getOperationalAlertConfig();
    const metrics = getOperationalMetricsSnapshot();
    const windowMinutes = config.windowMinutes;
    const sources = {};
    let paymentCounts = null;
    let recentPaymentRows = [];
    let recentAlertRows = null;
    let cronSnapshot = null;
    let httpMetrics = metrics.http;

    const [httpResult, alertHistoryResult, paymentResult, recentPaymentResult, cronResult] = await Promise.allSettled([
      operationalMetricStore.getHttpMetricsSnapshot(windowMinutes),
      operationalMetricStore.getRecentOperationalAlerts(20),
      query(
        `SELECT
           COUNT(*) AS failed_attempts,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired
         FROM payment_attempts
         WHERE status IN ('failed', 'expired')
         AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
        [windowMinutes]
      ),
      query(
        `SELECT attempt_id, booking_id, payment_id, status, failure_code, updated_at
         FROM payment_attempts
         WHERE status IN ('failed', 'expired')
         AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
         ORDER BY updated_at DESC
         LIMIT 25`,
        [windowMinutes]
      ),
      getCronHealthSnapshot(),
    ]);

    if (httpResult.status === "fulfilled") {
      httpMetrics = {
        ...httpMetrics,
        ...httpResult.value,
      };
      sources.api = "database";
    } else {
      sources.api = "unavailable";
    }
    if (alertHistoryResult.status === "fulfilled") {
      recentAlertRows = alertHistoryResult.value;
      sources.alert_history = "database";
    } else {
      sources.alert_history = "unavailable";
    }

    if (paymentResult.status === "fulfilled") {
      paymentCounts = paymentResult.value[0] || {
        failed_attempts: 0,
        failed: 0,
        expired: 0,
      };
      sources.payments = "ok";
    } else {
      sources.payments = "unavailable";
    }
    if (recentPaymentResult.status === "fulfilled") {
      recentPaymentRows = recentPaymentResult.value;
    }
    if (cronResult.status === "fulfilled") {
      cronSnapshot = cronResult.value;
      sources.scheduler = cronSnapshot.monitoring === "unavailable" ? "unavailable" : "ok";
    } else {
      sources.scheduler = "unavailable";
    }
    const requestIdByAttempt = new Map(
      metrics.payment_events.recent_failures.map((event) => [event.attempt_id, event.request_id])
    );
    const response = {
      generated_at: new Date().toISOString(),
      environment: String(process.env.APP_ENV || process.env.NODE_ENV || "development"),
      sources,
      window_minutes: windowMinutes,
      metrics: {
        http: httpMetrics,
        payments: {
          failed_attempts: Number(paymentCounts?.failed_attempts || 0),
          failed: Number(paymentCounts?.failed || 0),
          expired: Number(paymentCounts?.expired || 0),
          recent_failures: recentPaymentRows.map((row) => ({
            attempt_id: row.attempt_id,
            booking_id: Number(row.booking_id || 0),
            payment_id: row.payment_id ? Number(row.payment_id) : null,
            status: row.status,
            failure_code: row.failure_code || null,
            occurred_at: row.updated_at,
            request_id: requestIdByAttempt.get(row.attempt_id) || null,
          })),
        },
        scheduler: cronSnapshot,
      },
      alert_delivery: metrics.alert_delivery,
      thresholds: metrics.thresholds,
      alerts: {
        active: buildActiveAlerts({ metrics, paymentCounts, cronSnapshot }),
        recent: recentAlertRows || metrics.recent_alerts,
      },
    };
    const isDegraded = Object.values(sources).includes("unavailable");
    return res.status(isDegraded ? 503 : 200).json(response);
  }
);

module.exports = router;
module.exports.buildActiveAlerts = buildActiveAlerts;
