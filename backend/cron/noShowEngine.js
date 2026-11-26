const { withNamedLock } = require("../utils/db");
const {
  CRON_ENGINES,
  getCronSchedulerMode,
} = require("./config");
const { trackCronRun } = require("./monitor");
const { shouldCancelNoShowBooking } = require("../utils/bookingSchedule");
const { createOpeningsFromCancelledBooking } = require("../utils/stationWaitlist");
const { logger } = require("../utils/logger");

const CRON_LOCK_TIMEOUT_SECONDS = Number(process.env.CRON_LOCK_TIMEOUT_SECONDS || 0);
const GRACE_MINUTES = Number(process.env.NO_SHOW_GRACE_MINUTES || 15);
const ENGINE = CRON_ENGINES.no_show_engine;
const cronLogger = logger.child({ component: "cron", engine: "no_show_engine" });

async function cancelNoShowBooking(connection, bookingId, pcId) {
  const transactional = typeof connection.beginTransaction === "function";
  if (transactional) await connection.beginTransaction();
  try {
    const [result] = await connection.query(
    `
      UPDATE booking
      SET status='cancelled'
      WHERE booking_id=? AND status='confirmed' AND checked_in_at IS NULL
    `,
    [bookingId]
  );

    if (Number(result?.affectedRows || 0) === 0) {
      if (transactional) await connection.commit();
      return false;
    }

    await createOpeningsFromCancelledBooking(connection, bookingId);
    await connection.query("DELETE FROM booking_slots WHERE booking_id = ?", [bookingId]);
    await connection.query(
    `
      UPDATE payments
      SET status='cancelled', gateway_status='cancelled'
      WHERE booking_id = ?
    `,
    [bookingId]
  );
    await connection.query("UPDATE pc SET status='active' WHERE pc_id=?", [pcId]);
    if (transactional) await connection.commit();

    return true;
  } catch (error) {
    if (transactional) await connection.rollback();
    throw error;
  }
}

async function runNoShowEngine(options = {}) {
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
          async (connection) => {
            const now = new Date();
            const result = {
              cancelled: 0,
            };

            const [bookings] = await connection.query(
              `
                SELECT
                  b.booking_id,
                  b.pc_id,
                  b.booking_date,
                  COALESCE(bus.timezone, 'Asia/Kolkata') AS timezone,
                  MIN(bs.hour) AS start_hour
                FROM booking b
                JOIN booking_slots bs ON b.booking_id = bs.booking_id
                LEFT JOIN businesses bus ON bus.business_id = b.business_id
                WHERE b.status='confirmed'
                AND b.checked_in_at IS NULL
                AND b.booking_date <= DATE_ADD(UTC_DATE(), INTERVAL 1 DAY)
                GROUP BY b.booking_id, b.pc_id, b.booking_date, bus.timezone
              `
            );

            for (const booking of bookings) {
              if (
                !shouldCancelNoShowBooking({
                  bookingDate: booking.booking_date,
                  startHour: booking.start_hour,
                  timezone: booking.timezone,
                  graceMinutes: GRACE_MINUTES,
                  referenceTime: now,
                })
              ) {
                continue;
              }

              if (await cancelNoShowBooking(connection, booking.booking_id, booking.pc_id)) {
                result.cancelled += 1;
              }
            }

            return result;
          },
          { timeoutSeconds: CRON_LOCK_TIMEOUT_SECONDS }
        );

        cronLogger.info("no_show_engine_completed", summary);
        return {
          ok: true,
          ...summary,
        };
      } catch (error) {
        if (error.code === "LOCK_NOT_ACQUIRED") {
          cronLogger.warn("no_show_engine_skipped", { reason: "lock_busy" });
          return {
            ok: true,
            skipped: true,
            reason: "lock_busy",
          };
        }

        cronLogger.error("no_show_engine_failed", { error });
        throw error;
      }
    }
  );
}

module.exports = runNoShowEngine;

if (require.main === module) {
  runNoShowEngine()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
