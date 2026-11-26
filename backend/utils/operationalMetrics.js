const { randomUUID } = require("node:crypto");

const { logger } = require("./logger");
const { operationalMetricStore } = require("./operationalMetricStore");

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENT_COUNT = 10000;
const MAX_RECENT_ALERTS = 100;
const MAX_RECENT_ERRORS = 25;

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function getOperationalAlertConfig(env = process.env) {
  const windowMinutes = positiveInteger(env.OPS_METRICS_WINDOW_MINUTES, 5, 1440);
  return {
    webhookUrl: String(env.OPS_ALERT_WEBHOOK_URL || "").trim(),
    webhookSecret: String(env.OPS_ALERT_WEBHOOK_SECRET || "").trim(),
    windowMs: windowMinutes * 60 * 1000,
    windowMinutes,
    apiErrorThreshold: positiveInteger(env.OPS_API_ERROR_THRESHOLD, 5, 10000),
    paymentFailureThreshold: positiveInteger(env.OPS_PAYMENT_FAILURE_THRESHOLD, 3, 10000),
    cooldownMs: positiveInteger(env.OPS_ALERT_COOLDOWN_MINUTES, 15, 1440) * 60 * 1000,
  };
}

function toTimestamp(value, fallback) {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || fallback).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createOperationalMetrics({
  env = process.env,
  activeLogger = logger,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => new Date(),
  metricStore = null,
} = {}) {
  const httpEvents = [];
  const paymentFailureEvents = [];
  const recentAlerts = [];
  const alertCooldowns = new Map();
  const inFlightAlertKeys = new Set();
  const pendingDeliveries = new Set();
  const pendingAlertClaims = new Set();
  const pendingPersistenceWrites = new Set();
  let lastPersistenceWarningAt = 0;

  function currentTime() {
    const value = now();
    return value instanceof Date ? value : new Date(value);
  }

  function trimEvents(events, windowMs) {
    const cutoff = currentTime().getTime() - windowMs;
    while (events.length && events[0].timestamp_ms < cutoff) events.shift();
    if (events.length > MAX_EVENT_COUNT) {
      events.splice(0, events.length - MAX_EVENT_COUNT);
    }
  }

  async function updatePersistentDelivery(alert, status, errorCode = null) {
    if (!metricStore?.markOperationalAlertDelivery) return;
    try {
      await metricStore.markOperationalAlertDelivery({
        alertId: alert.alert_id,
        status,
        errorCode,
      });
    } catch (error) {
      activeLogger.error("operational_alert_delivery_status_persist_failed", {
        alert_id: alert.alert_id,
        alert_type: alert.alert_type,
        error,
      });
    }
  }

  async function dispatchWebhook(alert, { persisted = false } = {}) {
    const config = getOperationalAlertConfig(env);
    if (!config.webhookUrl || !config.webhookSecret) return;

    try {
      const response = await fetchImpl(config.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gamegrub-alert-secret": config.webhookSecret,
        },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Alert webhook returned HTTP ${response.status}.`);
      }
      activeLogger.info("operational_alert_delivered", {
        alert_id: alert.alert_id,
        alert_type: alert.alert_type,
      });
      if (persisted) await updatePersistentDelivery(alert, "delivered");
    } catch (error) {
      activeLogger.error("operational_alert_delivery_failed", {
        alert_id: alert.alert_id,
        alert_type: alert.alert_type,
        error,
      });
      if (persisted) {
        const errorCode = error?.status
          ? `HTTP_${Number(error.status)}`
          : String(error?.code || "WEBHOOK_DELIVERY_FAILED").slice(0, 80);
        await updatePersistentDelivery(alert, "failed", errorCode);
      }
    }
  }

  function createOperationalAlert({
    alertType,
    severity = "warning",
    summary,
    requestId = null,
    jobRunId = null,
    details = {},
  }) {
    const occurredAt = currentTime().toISOString();
    const alert = {
      alert_id: randomUUID(),
      alert_type: String(alertType || "operational_event"),
      severity,
      service: String(env.LOG_SERVICE_NAME || "gamegrub-backend"),
      environment: String(env.APP_ENV || env.NODE_ENV || "development"),
      occurred_at: occurredAt,
      summary: String(summary || "Operational threshold exceeded."),
      request_id: requestId || null,
      job_run_id: jobRunId || null,
      details,
    };

    return alert;
  }

  function publishOperationalAlert(alert, { persisted = false } = {}) {
    recentAlerts.unshift(alert);
    if (recentAlerts.length > MAX_RECENT_ALERTS) recentAlerts.length = MAX_RECENT_ALERTS;
    activeLogger.warn("operational_alert", alert);

    const delivery = dispatchWebhook(alert, { persisted });
    pendingDeliveries.add(delivery);
    delivery.finally(() => pendingDeliveries.delete(delivery));
    return alert;
  }

  function reportOperationalAlert(input) {
    return publishOperationalAlert(createOperationalAlert(input));
  }

  function reportOnceInCooldown(key, alert) {
    const config = getOperationalAlertConfig(env);
    const nowMs = currentTime().getTime();
    const lastAlertAt = alertCooldowns.get(key) || 0;
    if (nowMs - lastAlertAt < config.cooldownMs || inFlightAlertKeys.has(key)) return null;

    const payload = createOperationalAlert(alert);
    if (!metricStore?.claimAndRecordOperationalAlert) {
      alertCooldowns.set(key, nowMs);
      return publishOperationalAlert(payload);
    }

    inFlightAlertKeys.add(key);
    const claim = Promise.resolve()
      .then(() => metricStore.claimAndRecordOperationalAlert({
        alertKey: key,
        cooldownSeconds: Math.ceil(config.cooldownMs / 1000),
        alert: payload,
        deliveryStatus: config.webhookUrl && config.webhookSecret ? "pending" : "not_configured",
      }))
      .then((claimed) => {
        if (!claimed) return null;
        alertCooldowns.set(key, currentTime().getTime());
        return publishOperationalAlert(payload, { persisted: true });
      })
      .catch((error) => {
        activeLogger.error("operational_alert_persistence_failed", {
          alert_id: payload.alert_id,
          alert_type: payload.alert_type,
          error,
        });
        alertCooldowns.set(key, currentTime().getTime());
        return publishOperationalAlert(payload);
      })
      .finally(() => inFlightAlertKeys.delete(key));
    pendingAlertClaims.add(claim);
    claim.finally(() => pendingAlertClaims.delete(claim));
    return claim;
  }

  function recordHttpResponse({
    requestId = null,
    method = "",
    route = "",
    statusCode = 0,
    durationMs = 0,
    occurredAt = currentTime(),
  } = {}) {
    const timestampMs = toTimestamp(occurredAt, currentTime().getTime());
    const event = {
      timestamp_ms: timestampMs,
      occurred_at: new Date(timestampMs).toISOString(),
      request_id: requestId || null,
      method: String(method || "").toUpperCase(),
      route: normalizeOperationalRoute(route),
      status_code: Number(statusCode || 0),
      duration_ms: Math.max(0, Number(durationMs || 0)),
    };
    httpEvents.push(event);

    if (metricStore?.recordHttpResponse) {
      const persistence = Promise.resolve()
        .then(() => metricStore.recordHttpResponse(event))
        .catch((error) => {
          const nowMs = currentTime().getTime();
          if (nowMs - lastPersistenceWarningAt >= 60000) {
            lastPersistenceWarningAt = nowMs;
            activeLogger.warn("operational_http_metric_persistence_failed", {
              error,
            });
          }
        });
      pendingPersistenceWrites.add(persistence);
      persistence.finally(() => pendingPersistenceWrites.delete(persistence));
    }

    const config = getOperationalAlertConfig(env);
    trimEvents(httpEvents, Math.max(config.windowMs, 24 * 60 * 60 * 1000));
    const current = getOperationalMetricsSnapshot();
    if (event.status_code >= 500 && current.http.server_errors >= config.apiErrorThreshold) {
      const recentErrors = current.http.recent_errors;
      reportOnceInCooldown("api_server_errors", {
        alertType: "api_server_errors",
        severity: "critical",
        summary: `${current.http.server_errors} server errors occurred in the last ${config.windowMinutes} minutes.`,
        requestId: event.request_id,
        details: {
          window_minutes: config.windowMinutes,
          server_errors: current.http.server_errors,
          request_ids: recentErrors.map((entry) => entry.request_id).filter(Boolean),
          routes: recentErrors.map((entry) => ({ route: entry.route, status_code: entry.status_code })),
        },
      });
    }
    return event;
  }

  function recordPaymentFailure({
    requestId = null,
    attemptId = null,
    bookingId = null,
    paymentId = null,
    failureCode = null,
    status = "failed",
    occurredAt = currentTime(),
  } = {}) {
    const timestampMs = toTimestamp(occurredAt, currentTime().getTime());
    const event = {
      timestamp_ms: timestampMs,
      occurred_at: new Date(timestampMs).toISOString(),
      request_id: requestId || null,
      attempt_id: attemptId || null,
      booking_id: Number(bookingId || 0) || null,
      payment_id: Number(paymentId || 0) || null,
      failure_code: String(failureCode || "").slice(0, 100) || null,
      status: String(status || "failed"),
    };
    paymentFailureEvents.push(event);

    const config = getOperationalAlertConfig(env);
    trimEvents(paymentFailureEvents, Math.max(config.windowMs, 24 * 60 * 60 * 1000));
    const recentFailures = paymentFailureEvents.filter(
      (entry) => entry.timestamp_ms >= currentTime().getTime() - config.windowMs
    );
    if (recentFailures.length >= config.paymentFailureThreshold) {
      reportOnceInCooldown("payment_failures", {
        alertType: "payment_failures",
        severity: "critical",
        summary: `${recentFailures.length} payment attempts failed or expired in the last ${config.windowMinutes} minutes.`,
        requestId: event.request_id,
        details: {
          window_minutes: config.windowMinutes,
          failed_attempts: recentFailures.length,
          latest_attempt_id: event.attempt_id,
          booking_id: event.booking_id,
          failure_code: event.failure_code,
          status: event.status,
        },
      });
    }
    return event;
  }

  function recordCronHealthIssue({
    engineName,
    health = "failing",
    runId = null,
    runnerId = null,
    errorCode = null,
  }) {
    const jobRunId = runId || runnerId || null;
    const normalizedEngine = String(engineName || "unknown");
    const normalizedHealth = String(health || "failing");
    return reportOnceInCooldown(`cron:${normalizedEngine}:${normalizedHealth}`, {
      alertType: `cron_${normalizedHealth}`,
      severity: "critical",
      summary: `The ${normalizedEngine} scheduler is ${normalizedHealth.replaceAll("_", " ")}.`,
      jobRunId,
      details: {
        engine_name: normalizedEngine,
        health: normalizedHealth,
        job_run_id: jobRunId,
        error_code: String(errorCode || "").slice(0, 80) || null,
      },
    });
  }

  function recordCronFailure({ engineName, runId = null, runnerId = null, errorCode = null }) {
    return recordCronHealthIssue({
      engineName,
      health: "failing",
      runId,
      runnerId,
      errorCode,
    });
  }

  function getOperationalMetricsSnapshot() {
    const config = getOperationalAlertConfig(env);
    const nowMs = currentTime().getTime();
    const cutoff = nowMs - config.windowMs;
    const recentHttp = httpEvents.filter((event) => event.timestamp_ms >= cutoff);
    const recentErrors = recentHttp.filter((event) => event.status_code >= 500);
    const recentPayments = paymentFailureEvents.filter((event) => event.timestamp_ms >= cutoff);
    const durationTotal = recentHttp.reduce((total, event) => total + event.duration_ms, 0);
    const errorsByStatus = {};
    for (const event of recentErrors) {
      const key = String(event.status_code);
      errorsByStatus[key] = (errorsByStatus[key] || 0) + 1;
    }

    return {
      generated_at: new Date(nowMs).toISOString(),
      window_minutes: config.windowMinutes,
      http: {
        requests: recentHttp.length,
        server_errors: recentErrors.length,
        error_rate_percent: recentHttp.length
          ? Number(((recentErrors.length / recentHttp.length) * 100).toFixed(2))
          : 0,
        average_duration_ms: recentHttp.length
          ? Number((durationTotal / recentHttp.length).toFixed(2))
          : 0,
        errors_by_status: errorsByStatus,
        recent_errors: recentErrors.slice(-MAX_RECENT_ERRORS).reverse().map((event) => ({
          occurred_at: event.occurred_at,
          request_id: event.request_id,
          method: event.method,
          route: event.route,
          status_code: event.status_code,
          duration_ms: event.duration_ms,
        })),
      },
      payment_events: {
        observed_failures: recentPayments.length,
        recent_failures: recentPayments.slice(-MAX_RECENT_ERRORS).reverse().map((event) => ({
          occurred_at: event.occurred_at,
          request_id: event.request_id,
          attempt_id: event.attempt_id,
          booking_id: event.booking_id,
          payment_id: event.payment_id,
          failure_code: event.failure_code,
          status: event.status,
        })),
      },
      alert_delivery: {
        configured: Boolean(config.webhookUrl && config.webhookSecret),
        webhook_url_configured: Boolean(config.webhookUrl),
        webhook_secret_configured: Boolean(config.webhookSecret),
      },
      thresholds: {
        api_server_errors: config.apiErrorThreshold,
        payment_failures: config.paymentFailureThreshold,
        cooldown_minutes: Math.round(config.cooldownMs / 60000),
      },
      recent_alerts: recentAlerts.slice(0, 20),
    };
  }

  async function flushPendingDeliveries() {
    while (pendingAlertClaims.size || pendingDeliveries.size || pendingPersistenceWrites.size) {
      await Promise.all([
        ...pendingAlertClaims,
        ...pendingDeliveries,
        ...pendingPersistenceWrites,
      ]);
    }
  }

  return {
    flushPendingDeliveries,
    getOperationalMetricsSnapshot,
    recordCronFailure,
    recordCronHealthIssue,
    recordHttpResponse,
    recordPaymentFailure,
    reportOperationalAlert,
  };
}

function normalizeOperationalRoute(value) {
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

const operationalMetrics = createOperationalMetrics({ metricStore: operationalMetricStore });

module.exports = {
  createOperationalMetrics,
  getOperationalAlertConfig,
  normalizeOperationalRoute,
  ...operationalMetrics,
};
