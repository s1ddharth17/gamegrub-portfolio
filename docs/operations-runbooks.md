# Operations dashboard and runbooks

GameGrub exposes a protected operations summary at `GET /api/admin/operations`.
It requires an active super-admin. The JSON response combines
rolling HTTP error and latency metrics, failed Razorpay attempt counts, recent
failed attempts, cron health, active threshold alerts, and recent alert
deliveries. Use the response's `request_id` or `job_run_id` to find the related
structured log entry or scheduler run.

The public `/health/cron` endpoint remains a coarse liveness check. Use the
admin operations endpoint for payment and request details. Payment-attempt,
cron-run, HTTP metric, and alert history come from the shared database. HTTP
minute buckets aggregate across backend instances.
The HTTP window is minute-granular, so it can include up to one extra minute at
the start of a rolling window. Recent 5xx samples retain their request ID and
normalized route for 90 days. Alert history, delivery outcomes, and cooldowns
are shared across backend instances. If the database is unavailable, alerts
fall back to structured logs and process-local cooldowns until it recovers.

## Alert configuration

Set these environment variables on the backend service:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPS_ALERT_WEBHOOK_URL` | unset | HTTPS endpoint that accepts GameGrub alert JSON. |
| `OPS_ALERT_WEBHOOK_SECRET` | unset | Random secret of at least 24 characters, sent in the `x-gamegrub-alert-secret` header. |
| `OPS_METRICS_WINDOW_MINUTES` | `5` | Rolling window for API and failed-payment thresholds; range 1–1440. |
| `OPS_API_ERROR_THRESHOLD` | `5` | 5xx responses in the rolling window before an alert. |
| `OPS_PAYMENT_FAILURE_THRESHOLD` | `3` | Failed or expired attempts in the rolling window before an alert. |
| `OPS_ALERT_COOLDOWN_MINUTES` | `15` | Minimum time between repeat alerts of the same type. |

The webhook receives JSON with `alert_id`, `alert_type`, `severity`,
`occurred_at`, `request_id` or `job_run_id`, and relevant identifiers. It never
receives the configured secret in the body. The receiver should return a 2xx
response. If delivery fails, the backend logs `operational_alert_delivery_failed`
with the alert ID. In production, an invalid or non-HTTPS webhook URL or a
missing/weak secret prevents startup; with no webhook URL, alerts remain visible
in structured logs and the authenticated operations summary, and startup emits
a warning.

## Payment failures

1. Open `/api/admin/operations` and review `metrics.payments` and
   `alerts.active`. Failed and expired attempts include `attempt_id`,
   `booking_id`, `failure_code`, and a request ID when the failure came through
   the current backend process.
2. Search structured backend logs using the alert's `request_id`; use the
   `attempt_id` to locate the durable row in `payment_attempts`.
3. Confirm the provider state in Razorpay before retrying or changing a payment.
   The webhook and checkout verification paths are idempotent; do not mark a
   payment captured from a customer report or edit payment state directly.
4. If several attempts fail, check provider availability, webhook signatures,
   credentials, and amount/currency mismatch before clearing the alert.

## Booking and API failures

1. Review `metrics.http`, especially `server_errors`, `error_rate_percent`,
   `errors_by_status`, and `recent_errors`.
2. Search structured logs by `request_id`. The corresponding entries include
   method, route, status, duration, and a redacted error record.
3. Use the route and booking ID from the request context to verify booking,
   payment, and slot state before retrying a state-changing operation. Failed
   API requests do not prove that a database transaction rolled back; inspect
   the transaction's durable state first.
4. If errors are isolated to one cafe, inspect the business ID and admin scope
   in the request before changing business-owned data.

## Scheduler failures

1. Check `metrics.scheduler` or run `npm run cron:status` from `backend`.
   Find engines whose health is `failing`, `stale`, `stuck`, or `never_run`.
2. Use `job_run_id`/`last_run_id` to inspect the matching `cron_job_runs` row;
   the row includes engine, trigger source, scheduler mode, summary, error code,
   and timestamps.
3. Check that the configured scheduler is running the expected commands and
   that `ENABLE_IN_PROCESS_CRON` matches the deployment mode. Avoid running a
   second scheduler while the production scheduler is active.
4. Fix the underlying database, lock, or provider problem, then run the
   affected engine once and confirm a new healthy run appears in the operations
   summary.
