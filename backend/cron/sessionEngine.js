const { withNamedLock } = require("../utils/db");
const {
  CRON_ENGINES,
  getCronSchedulerMode,
} = require("./config");
const { trackCronRun } = require("./monitor");
const {
  determineConfirmedBookingAction,
  shouldFinishRunningBooking,
} = require("../utils/bookingSchedule");
const { logger } = require("../utils/logger");
const { createCustomerNotification } = require("../utils/customerNotifications");

const CRON_LOCK_TIMEOUT_SECONDS = Number(process.env.CRON_LOCK_TIMEOUT_SECONDS || 0);
const ENGINE = CRON_ENGINES.session_engine;
const cronLogger = logger.child({ component: "cron", engine: "session_engine" });

async function finalizeConfirmedBooking(connection, booking) {
  const [result] = await connection.query(
    `
      UPDATE booking
      SET status='session_over',
          start_time = COALESCE(start_time, TIMESTAMP(booking_date, MAKETIME(?, 0, 0))),
          actual_end_time = TIMESTAMP(booking_date, MAKETIME(?, 0, 0))
      WHERE booking_id=? AND status='confirmed'
    `,
    [booking.start_hour, booking.end_hour, booking.booking_id]
  );

  if (Number(result?.affectedRows || 0) > 0) {
    await connection.query(
      `
        UPDATE pc
        SET status='active'
        WHERE pc_id=?
      `,
      [booking.pc_id]
    );
    await notifySessionEnded(connection, booking);
    return true;
  }

  return false;
}

async function startConfirmedBooking(connection, booking) {
  const [result] = await connection.query(
    `
      UPDATE booking
      SET status='running',
          start_time = COALESCE(start_time, TIMESTAMP(booking_date, MAKETIME(?, 0, 0)))
      WHERE booking_id=? AND status='confirmed'
    `,
    [booking.start_hour, booking.booking_id]
  );

  if (Number(result?.affectedRows || 0) > 0) {
    await connection.query(
      `
        UPDATE pc
        SET status='occupied'
        WHERE pc_id=?
      `,
      [booking.pc_id]
    );
    return true;
  }

  return false;
}

async function finishRunningBooking(connection, booking) {
  const [result] = await connection.query(
    `
      UPDATE booking
      SET status='session_over',
          start_time = COALESCE(start_time, TIMESTAMP(booking_date, MAKETIME(?, 0, 0))),
          actual_end_time = TIMESTAMP(booking_date, MAKETIME(?, 0, 0))
      WHERE booking_id=? AND status='running'
    `,
    [booking.start_hour, booking.end_hour, booking.booking_id]
  );

  if (Number(result?.affectedRows || 0) > 0) {
    await connection.query(
      `
        UPDATE pc
        SET status='active'
        WHERE pc_id=?
      `,
      [booking.pc_id]
    );
    await notifySessionEnded(connection, booking);
    return true;
  }

  return false;
}

async function notifySessionEnded(connection, booking) {
  await createCustomerNotification(connection, {
    userId: booking.user_id,
    category: "session_updates",
    eventType: "session_ended",
    title: "Your gaming session has ended",
    message: "Your session is complete. Open your booking to review the bill and session details.",
    deepLink: `/booking/${Number(booking.booking_id)}`,
    entityType: "booking",
    entityId: booking.booking_id,
    idempotencyKey: `booking:${Number(booking.booking_id)}:session-ended`,
  });
}

async function runSessionEngine(options = {}) {
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
              started: 0,
              catch_up_closed: 0,
              ended: 0,
            };

            const [confirmedBookings] = await connection.query(
              `
                SELECT
                  b.booking_id,
                  b.user_id,
                  b.pc_id,
                  b.booking_date,
                  MIN(bs.hour) AS start_hour,
                  MAX(bs.hour) + 1 AS end_hour
                FROM booking b
                JOIN booking_slots bs ON b.booking_id = bs.booking_id
                WHERE b.status='confirmed'
                AND b.booking_date <= CURDATE()
                GROUP BY b.booking_id, b.pc_id, b.booking_date
              `
            );

            for (const booking of confirmedBookings) {
              const action = determineConfirmedBookingAction({
                bookingDate: booking.booking_date,
                startHour: booking.start_hour,
                endHour: booking.end_hour,
                referenceTime: now,
              });

              if (action === "catch_up_close") {
                if (await finalizeConfirmedBooking(connection, booking)) {
                  result.catch_up_closed += 1;
                }
                continue;
              }

              if (action === "start") {
                if (await startConfirmedBooking(connection, booking)) {
                  result.started += 1;
                }
              }
            }

            const [runningBookings] = await connection.query(
              `
                SELECT
                  b.booking_id,
                  b.user_id,
                  b.pc_id,
                  b.booking_date,
                  MIN(bs.hour) AS start_hour,
                  MAX(bs.hour) + 1 AS end_hour
                FROM booking b
                JOIN booking_slots bs ON b.booking_id = bs.booking_id
                WHERE b.status='running'
                AND b.booking_date <= CURDATE()
                GROUP BY b.booking_id, b.pc_id, b.booking_date
              `
            );

            for (const booking of runningBookings) {
              if (
                !shouldFinishRunningBooking({
                  bookingDate: booking.booking_date,
                  endHour: booking.end_hour,
                  referenceTime: now,
                })
              ) {
                continue;
              }

              if (await finishRunningBooking(connection, booking)) {
                result.ended += 1;
              }
            }

            return result;
          },
          { timeoutSeconds: CRON_LOCK_TIMEOUT_SECONDS }
        );

        cronLogger.info("session_engine_completed", summary);
        return {
          ok: true,
          ...summary,
        };
      } catch (error) {
        if (error.code === "LOCK_NOT_ACQUIRED") {
          cronLogger.warn("session_engine_skipped", { reason: "lock_busy" });
          return {
            ok: true,
            skipped: true,
            reason: "lock_busy",
          };
        }

        cronLogger.error("session_engine_failed", { error });
        throw error;
      }
    }
  );
}

module.exports = runSessionEngine;

if (require.main === module) {
  runSessionEngine()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
