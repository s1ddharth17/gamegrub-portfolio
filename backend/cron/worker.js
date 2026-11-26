const noShowEngine = require("./noShowEngine");
const sessionEngine = require("./sessionEngine");
const notificationEngine = require("./notificationEngine");
const stationWaitlistEngine = require("./stationWaitlistEngine");
const { logger } = require("../utils/logger");
const {
  NO_SHOW_ENGINE_INTERVAL_MS,
  NOTIFICATION_ENGINE_INTERVAL_MS,
  STATION_WAITLIST_ENGINE_INTERVAL_MS,
  SESSION_ENGINE_INTERVAL_MS,
  getCronSchedulerMode,
  isInProcessCronEnabled,
} = require("./config");
const cronLogger = logger.child({ component: "cron", engine: "worker" });

async function runAllEnginesOnce() {
  const summary = {
    session: await sessionEngine({
      triggerSource: "run_all_engines",
      schedulerMode: getCronSchedulerMode(),
    }),
    no_show: await noShowEngine({
      triggerSource: "run_all_engines",
      schedulerMode: getCronSchedulerMode(),
    }),
    station_waitlist: await stationWaitlistEngine({
      triggerSource: "run_all_engines",
      schedulerMode: getCronSchedulerMode(),
    }),
    notifications: await notificationEngine({
      triggerSource: "run_all_engines",
      schedulerMode: getCronSchedulerMode(),
    }),
  };

  cronLogger.info("cron_run_once_completed", { summary });
  return summary;
}

function scheduleEngine(label, engine, intervalMs) {
  const run = async () => {
    try {
      await engine({
        triggerSource: "in_process_interval",
        schedulerMode: "in_process",
      });
    } catch (error) {
      cronLogger.error("cron_engine_failed", {
        scheduled_engine: label,
        error,
      });
    }
  };

  run();
  return setInterval(run, intervalMs);
}

function startInProcessCron() {
  if (!isInProcessCronEnabled()) {
    cronLogger.info("in_process_scheduler_disabled");
    return {
      enabled: false,
      handles: [],
    };
  }

  cronLogger.info("in_process_scheduler_enabled", {
    session_interval_ms: SESSION_ENGINE_INTERVAL_MS,
    no_show_interval_ms: NO_SHOW_ENGINE_INTERVAL_MS,
    notification_interval_ms: NOTIFICATION_ENGINE_INTERVAL_MS,
    station_waitlist_interval_ms: STATION_WAITLIST_ENGINE_INTERVAL_MS,
  });

  const handles = [
    scheduleEngine("session-engine", sessionEngine, SESSION_ENGINE_INTERVAL_MS),
    scheduleEngine("no-show-engine", noShowEngine, NO_SHOW_ENGINE_INTERVAL_MS),
    scheduleEngine("notification-engine", notificationEngine, NOTIFICATION_ENGINE_INTERVAL_MS),
    scheduleEngine("station-waitlist-engine", stationWaitlistEngine, STATION_WAITLIST_ENGINE_INTERVAL_MS),
  ];

  return {
    enabled: true,
    handles,
  };
}

module.exports = {
  isInProcessCronEnabled,
  getCronSchedulerMode,
  NO_SHOW_ENGINE_INTERVAL_MS,
  NOTIFICATION_ENGINE_INTERVAL_MS,
  SESSION_ENGINE_INTERVAL_MS,
  STATION_WAITLIST_ENGINE_INTERVAL_MS,
  runAllEnginesOnce,
  startInProcessCron,
};

if (require.main === module) {
  startInProcessCron();
}
