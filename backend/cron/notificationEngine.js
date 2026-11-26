const { withNamedLock } = require("../utils/db");
const {
  CRON_ENGINES,
  getCronSchedulerMode,
} = require("./config");
const { trackCronRun } = require("./monitor");
const { processNotificationPushQueue, createCustomerNotification } = require("../utils/customerNotifications");
const { dateKey, formatTimeInZone, zonedDateTimeToUtc } = require("../utils/timeZones");
const { logger } = require("../utils/logger");

const CRON_LOCK_TIMEOUT_SECONDS = Number(process.env.CRON_LOCK_TIMEOUT_SECONDS || 0);
const NO_SHOW_GRACE_MINUTES = Math.max(1, Number(process.env.NO_SHOW_GRACE_MINUTES || 15));
const ENGINE = CRON_ENGINES.notification_engine;
const cronLogger = logger.child({ component: "cron", engine: ENGINE.name });

function getBookingStartUtc(booking) {
  return zonedDateTimeToUtc({
    date: dateKey(booking.booking_date),
    hour: Number(booking.start_hour),
    minute: 0,
    timezone: booking.business_timezone || booking.timezone || "Asia/Kolkata",
  });
}

function reminderEventForBooking(booking, now = new Date()) {
  const startAt = getBookingStartUtc(booking);
  if (!startAt) return null;
  const minutesUntil = (startAt.getTime() - now.getTime()) / 60000;
  const bookingId = Number(booking.booking_id);
  if (minutesUntil > 0 && minutesUntil <= 60) {
    return {
      category: "booking_reminders",
      eventType: "booking_reminder_1h",
      title: "Your gaming session is coming up",
      message: `Your session starts at ${formatTimeInZone(startAt, booking.display_timezone || booking.timezone)}. Open your booking for details.`,
      key: `booking:${bookingId}:reminder:1h`,
    };
  }
  if (minutesUntil > 23 * 60 && minutesUntil <= 24 * 60) {
    return {
      category: "booking_reminders",
      eventType: "booking_reminder_24h",
      title: "Your gaming session is tomorrow",
      message: `Your session starts at ${formatTimeInZone(startAt, booking.display_timezone || booking.timezone)}. Open your booking for details.`,
      key: `booking:${bookingId}:reminder:24h`,
    };
  }
  const minutesSinceStart = -minutesUntil;
  if (minutesSinceStart >= 5 && minutesSinceStart < NO_SHOW_GRACE_MINUTES) {
    return {
      category: "no_show_warnings",
      eventType: "booking_no_show_warning",
      title: "Check in for your session",
      message: "Your booking has started. Please check in with the café team before the no-show grace period ends.",
      key: `booking:${bookingId}:no_show_warning`,
    };
  }
  return null;
}

function reminderEventForTournament(tournament, now = new Date()) {
  const startAt = new Date(tournament.start_at || "");
  if (Number.isNaN(startAt.getTime())) return null;
  const minutesUntil = (startAt.getTime() - now.getTime()) / 60000;
  const tournamentId = Number(tournament.tournament_id || 0);
  const scheduleKey = startAt.toISOString().replace(/[-:.TZ]/g, "");
  const time = formatTimeInZone(startAt, tournament.business_timezone || "Asia/Kolkata");
  const venue = String(tournament.location_label || tournament.business_name || "the venue").trim();
  if (minutesUntil > 0 && minutesUntil <= 60) {
    return {
      eventType: "tournament_reminder_1h",
      title: `${tournament.title || "Your tournament"} starts soon`,
      message: `The event starts at ${time} at ${venue}. Open the tournament for the latest schedule and venue details.`,
      key: `tournament:${tournamentId}:${scheduleKey}:reminder:1h`,
    };
  }
  if (minutesUntil > 23 * 60 && minutesUntil <= 24 * 60) {
    return {
      eventType: "tournament_reminder_24h",
      title: `${tournament.title || "Your tournament"} is tomorrow`,
      message: `The event starts at ${time} at ${venue}. Open the tournament for the latest schedule and venue details.`,
      key: `tournament:${tournamentId}:${scheduleKey}:reminder:24h`,
    };
  }
  return null;
}

async function runNotificationEngine(options = {}) {
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
            const [bookings] = await connection.query(
              `SELECT b.booking_id, b.user_id, b.booking_date, MIN(bs.hour) AS start_hour,
                COALESCE(NULLIF(bus.timezone, ''), 'Asia/Kolkata') AS business_timezone,
                COALESCE(NULLIF(np.timezone_name, ''), NULLIF(bus.timezone, ''), 'Asia/Kolkata') AS display_timezone
               FROM booking b
               JOIN booking_slots bs ON bs.booking_id = b.booking_id
               LEFT JOIN businesses bus ON bus.business_id = b.business_id
               LEFT JOIN notification_preferences np ON np.user_id = b.user_id
               WHERE b.status = 'confirmed'
                 AND b.booking_date BETWEEN DATE_SUB(UTC_DATE(), INTERVAL 2 DAY)
                   AND DATE_ADD(UTC_DATE(), INTERVAL 3 DAY)
               GROUP BY b.booking_id, b.user_id, b.booking_date, bus.timezone, np.timezone_name
               ORDER BY b.booking_date ASC, start_hour ASC`
            );
            let created = 0;
            for (const booking of bookings) {
              const event = reminderEventForBooking(booking, now);
              if (!event) continue;
              const wasCreated = await createCustomerNotification(connection, {
                userId: booking.user_id,
                category: event.category,
                eventType: event.eventType,
                title: event.title,
                message: event.message,
                deepLink: `/booking/${Number(booking.booking_id)}`,
                entityType: "booking",
                entityId: booking.booking_id,
                idempotencyKey: event.key,
              });
              if (wasCreated) created += 1;
            }
            const [tournamentRegistrations] = await connection.query(
              `SELECT t.tournament_id, t.title, t.slug, t.start_at, t.location_label,
                  tr.user_id,
                  COALESCE(NULLIF(bus.timezone, ''), 'Asia/Kolkata') AS business_timezone
               FROM tournaments t
               JOIN tournament_registrations tr ON tr.tournament_id = t.tournament_id
               LEFT JOIN businesses bus ON bus.business_id = t.business_id
               WHERE t.status = 'published' AND t.published_at IS NOT NULL
                 AND tr.status = 'registered'
                 AND t.start_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)
                   AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 25 HOUR)
               ORDER BY t.start_at ASC, tr.user_id ASC`
            );
            let tournamentRemindersCreated = 0;
            for (const tournament of tournamentRegistrations) {
              const event = reminderEventForTournament(tournament, now);
              if (!event) continue;
              const wasCreated = await createCustomerNotification(connection, {
                userId: tournament.user_id,
                category: "tournaments",
                eventType: event.eventType,
                title: event.title,
                message: event.message,
                deepLink: `/tournament/details/${encodeURIComponent(tournament.slug || tournament.tournament_id)}`,
                entityType: "tournament",
                entityId: tournament.tournament_id,
                idempotencyKey: event.key,
              });
              if (wasCreated) tournamentRemindersCreated += 1;
            }
            const push = await processNotificationPushQueue({ limit: 100 });
            return { reminders_created: created, tournament_reminders_created: tournamentRemindersCreated, ...push };
          },
          { timeoutSeconds: CRON_LOCK_TIMEOUT_SECONDS }
        );
        cronLogger.info("notification_engine_completed", summary);
        return { ok: true, ...summary };
      } catch (error) {
        if (error.code === "LOCK_NOT_ACQUIRED") {
          cronLogger.warn("notification_engine_skipped", { reason: "lock_busy" });
          return { ok: true, skipped: true, reason: "lock_busy" };
        }
        cronLogger.error("notification_engine_failed", { error });
        throw error;
      }
    }
  );
}

module.exports = runNotificationEngine;
module.exports.getBookingStartUtc = getBookingStartUtc;
module.exports.reminderEventForBooking = reminderEventForBooking;
module.exports.reminderEventForTournament = reminderEventForTournament;

if (require.main === module) {
  runNotificationEngine()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
