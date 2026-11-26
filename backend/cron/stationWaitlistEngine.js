const { withNamedLock } = require("../utils/db");
const { expireOffers } = require("../utils/stationWaitlist");
const { CRON_ENGINES, getCronSchedulerMode } = require("./config");
const { trackCronRun } = require("./monitor");
const { logger } = require("../utils/logger");

const ENGINE = CRON_ENGINES.station_waitlist_engine;
const CRON_LOCK_TIMEOUT_SECONDS = Number(process.env.CRON_LOCK_TIMEOUT_SECONDS || 0);
const cronLogger = logger.child({ component: "cron", engine: ENGINE.name });

async function runStationWaitlistEngine(options = {}) {
  return trackCronRun(
    {
      engineName: ENGINE.name,
      triggerSource: options.triggerSource || "direct_cli",
      schedulerMode: options.schedulerMode || getCronSchedulerMode(),
      lockName: ENGINE.lockName,
    },
    async () => {
      try {
        const summary = await withNamedLock(
          ENGINE.lockName,
          async () => expireOffers(),
          { timeoutSeconds: CRON_LOCK_TIMEOUT_SECONDS }
        );
        cronLogger.info("station_waitlist_engine_completed", summary);
        return { ok: true, ...summary };
      } catch (error) {
        if (error.code === "LOCK_NOT_ACQUIRED") {
          cronLogger.warn("station_waitlist_engine_skipped", { reason: "lock_busy" });
          return { ok: true, skipped: true, reason: "lock_busy" };
        }
        cronLogger.error("station_waitlist_engine_failed", { error });
        throw error;
      }
    }
  );
}

module.exports = runStationWaitlistEngine;

if (require.main === module) {
  runStationWaitlistEngine()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
