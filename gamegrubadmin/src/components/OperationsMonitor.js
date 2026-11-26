import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config/api";

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function OperationsMonitor() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/admin/operations`);
      setSnapshot(response.data);
      setError("");
    } catch (requestError) {
      setSnapshot(requestError.response?.data || null);
      setError(
        requestError.response?.data?.message ||
          "Operations metrics are temporarily unavailable. Retry or check the backend health endpoint.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const metrics = snapshot?.metrics || {};
  const http = metrics.http || {};
  const payments = metrics.payments || {};
  const scheduler = metrics.scheduler || {};
  const engines = Object.values(scheduler.engines || {});
  const activeAlerts = snapshot?.alerts?.active || [];
  const recentErrors = http.recent_errors || [];
  const recentPaymentFailures = payments.recent_failures || [];

  return (
    <section
      className="dashboard-panel dashboard-panel--full admin-surface-hover operations-monitor"
      aria-label="Platform operations"
    >
      <div className="dashboard-panel__header">
        <div>
          <div className="dashboard-panel__eyebrow">Platform operations</div>
          <div className="dashboard-panel__title">Service health and alerts</div>
          <div className="dashboard-panel__subtitle">
            Rolling {snapshot?.window_minutes || 5}-minute service metrics and actionable incidents.
          </div>
        </div>
        <button
          type="button"
          className="dashboard-action dashboard-action--secondary operations-monitor__refresh"
          onClick={loadSnapshot}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh operations"}
        </button>
      </div>

      {error ? <div className="operations-monitor__error" role="alert">{error}</div> : null}
      {loading && !snapshot ? (
        <div className="dashboard-placeholder">Loading operations metrics…</div>
      ) : snapshot ? (
        <>
          <div className="operations-monitor__metrics">
            <Metric label="Server errors" value={`${http.server_errors || 0} / ${http.requests || 0}`} meta={`${formatPercent(http.error_rate_percent)} of requests`} />
            <Metric label="Average response" value={`${Number(http.average_duration_ms || 0).toFixed(0)} ms`} meta={`Last ${snapshot.window_minutes || 5} minutes`} />
            <Metric label="Failed payments" value={payments.failed_attempts || 0} meta={`${payments.failed || 0} failed · ${payments.expired || 0} expired`} />
            <Metric label="Scheduler health" value={`${engines.filter((engine) => engine.health === "healthy").length} / ${engines.length} healthy`} meta={scheduler.status || "Unavailable"} />
          </div>

          <div className="dashboard-split-grid operations-monitor__details">
            <div className="dashboard-subsection">
              <div className="dashboard-subsection__header">
                <div className="dashboard-subsection__title">Active alerts</div>
                <div className="dashboard-subsection__meta">{activeAlerts.length} requiring attention</div>
              </div>
              {activeAlerts.length ? (
                <div className="dashboard-list">
                  {activeAlerts.map((alert, index) => (
                    <div className="dashboard-list-item operations-monitor__alert" key={`${alert.alert_type}-${alert.job_run_id || alert.request_id || index}`}>
                      <div>
                        <div className="dashboard-list-item__title">{alert.summary}</div>
                        <div className="dashboard-list-item__meta">
                          {alert.request_id ? `Request ${alert.request_id}` : null}
                          {alert.job_run_id ? `Job run ${alert.job_run_id}` : null}
                          {alert.engine_name ? ` · ${alert.engine_name}` : null}
                          {!alert.request_id && !alert.job_run_id && !alert.engine_name ? alert.alert_type : null}
                        </div>
                      </div>
                      <span className="operations-monitor__severity">{alert.severity || "warning"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-placeholder dashboard-placeholder--compact">No active operational alerts.</div>
              )}
            </div>

            <div className="dashboard-subsection">
              <div className="dashboard-subsection__header">
                <div className="dashboard-subsection__title">Recent failures</div>
                <div className="dashboard-subsection__meta">Request and job IDs help trace the cause</div>
              </div>
              {recentErrors.length || recentPaymentFailures.length ? (
                <div className="dashboard-list">
                  {recentErrors.slice(0, 5).map((event) => (
                    <div className="dashboard-list-item" key={`http-${event.request_id || event.occurred_at}`}>
                      <div>
                        <div className="dashboard-list-item__title">HTTP {event.status_code} · {event.method} {event.route}</div>
                        <div className="dashboard-list-item__meta">{formatDateTime(event.occurred_at)}</div>
                      </div>
                      <div className="dashboard-list-item__status">{event.request_id || "Request ID unavailable"}</div>
                    </div>
                  ))}
                  {recentPaymentFailures.slice(0, 5).map((failure) => (
                    <div className="dashboard-list-item" key={`payment-${failure.attempt_id}`}>
                      <div>
                        <div className="dashboard-list-item__title">Payment {failure.status} · booking #{failure.booking_id}</div>
                        <div className="dashboard-list-item__meta">Attempt {failure.attempt_id} · {failure.failure_code || "No provider code"}</div>
                      </div>
                      <div className="dashboard-list-item__status">{failure.request_id || formatDateTime(failure.occurred_at)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-placeholder dashboard-placeholder--compact">No recent API or payment failures.</div>
              )}
            </div>
          </div>

          <div className="operations-monitor__footer">
            <span>Alert webhook: {snapshot.alert_delivery?.configured ? "configured" : "not configured"}</span>
            <span>Updated {formatDateTime(snapshot.generated_at)}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, meta }) {
  return (
    <div className="operations-monitor__metric">
      <div className="dashboard-kpi__label">{label}</div>
      <div className="operations-monitor__value">{value}</div>
      <div className="dashboard-kpi__meta">{meta}</div>
    </div>
  );
}

export default OperationsMonitor;
