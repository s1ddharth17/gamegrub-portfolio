function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseInterval(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SESSION_ENGINE_INTERVAL_MS = parseInterval(process.env.SESSION_ENGINE_INTERVAL_MS, 60 * 1000);
const NO_SHOW_ENGINE_INTERVAL_MS = parseInterval(process.env.NO_SHOW_ENGINE_INTERVAL_MS, 60 * 1000);
const NOTIFICATION_ENGINE_INTERVAL_MS = parseInterval(process.env.NOTIFICATION_ENGINE_INTERVAL_MS, 60 * 1000);
const STATION_WAITLIST_ENGINE_INTERVAL_MS = parseInterval(process.env.STATION_WAITLIST_ENGINE_INTERVAL_MS, 10 * 1000);
const CRON_HEALTH_STALE_MULTIPLIER = Math.max(
  2,
  Number(process.env.CRON_HEALTH_STALE_MULTIPLIER || 2)
);

const CRON_ENGINES = Object.freeze({
  session_engine: Object.freeze({
    name: "session_engine",
    label: "Session Engine",
    intervalMs: SESSION_ENGINE_INTERVAL_MS,
    lockName: "cron:session-engine",
  }),
  no_show_engine: Object.freeze({
    name: "no_show_engine",
    label: "No-Show Engine",
    intervalMs: NO_SHOW_ENGINE_INTERVAL_MS,
    lockName: "cron:no-show-engine",
  }),
  notification_engine: Object.freeze({
    name: "notification_engine",
    label: "Customer Notification Engine",
    intervalMs: NOTIFICATION_ENGINE_INTERVAL_MS,
    lockName: "cron:notification-engine",
  }),
  station_waitlist_engine: Object.freeze({
    name: "station_waitlist_engine",
    label: "Station Waitlist Engine",
    intervalMs: STATION_WAITLIST_ENGINE_INTERVAL_MS,
    lockName: "cron:station-waitlist-engine",
  }),
});

function isInProcessCronEnabled() {
  return parseBoolean(process.env.ENABLE_IN_PROCESS_CRON);
}

function getCronSchedulerMode() {
  return isInProcessCronEnabled() ? "in_process" : "external_scheduler";
}

function getCronStaleAfterMs(intervalMs) {
  return Math.max(60 * 1000, Math.floor(Number(intervalMs || 0) * CRON_HEALTH_STALE_MULTIPLIER));
}

function getCronRunningTimeoutMs(intervalMs) {
  return Math.max(5 * 60 * 1000, Math.floor(Number(intervalMs || 0) * (CRON_HEALTH_STALE_MULTIPLIER + 3)));
}

module.exports = {
  CRON_ENGINES,
  CRON_HEALTH_STALE_MULTIPLIER,
  NO_SHOW_ENGINE_INTERVAL_MS,
  NOTIFICATION_ENGINE_INTERVAL_MS,
  SESSION_ENGINE_INTERVAL_MS,
  STATION_WAITLIST_ENGINE_INTERVAL_MS,
  getCronRunningTimeoutMs,
  getCronSchedulerMode,
  getCronStaleAfterMs,
  isInProcessCronEnabled,
  parseBoolean,
  parseInterval,
};
