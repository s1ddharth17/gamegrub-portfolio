const { signToken, verifyToken } = require("./security");
const { zonedDateTimeToUtc } = require("./timeZones");

const QR_PREFIX = "GAMEGRUB-CHECKIN:1:";
const CHECK_IN_LEAD_MINUTES = Number(process.env.BOOKING_CHECK_IN_LEAD_MINUTES || 15);
const CHECK_IN_GRACE_MINUTES = Number(process.env.BOOKING_CHECK_IN_GRACE_MINUTES || 15);

function createBookingCheckInCode({ bookingId, userId }) {
  const normalizedBookingId = Number(bookingId);
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedBookingId) || normalizedBookingId <= 0 ||
      !Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error("A valid booking and customer are required to create a check-in code.");
  }

  const token = signToken(
    {
      purpose: "booking_check_in",
      booking_id: normalizedBookingId,
      user_id: normalizedUserId,
    },
    { expiresIn: "365d" }
  );
  return `${QR_PREFIX}${token}`;
}

function verifyBookingCheckInCode(value) {
  const code = String(value || "").trim();
  if (!code.startsWith(QR_PREFIX)) return null;

  try {
    const payload = verifyToken(code.slice(QR_PREFIX.length));
    const bookingId = Number(payload?.booking_id || 0);
    const userId = Number(payload?.user_id || 0);
    if (payload?.purpose !== "booking_check_in" || !Number.isInteger(bookingId) || bookingId <= 0 ||
        !Number.isInteger(userId) || userId <= 0) return null;
    return { bookingId, userId };
  } catch (_) {
    return null;
  }
}

function getVisitState({ status, checkedInAt, paymentStatus }) {
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedPaymentStatus = String(paymentStatus || "").toLowerCase();
  if (["closed", "completed"].includes(normalizedStatus) ||
      (normalizedStatus === "session_over" && normalizedPaymentStatus === "paid")) {
    return "settled";
  }
  if (normalizedStatus === "session_over") return "ending";
  if (normalizedStatus === "running") return "running";
  if (checkedInAt) return "checked_in";
  if (normalizedStatus === "confirmed") return "confirmed";
  return normalizedStatus || "unknown";
}

function getCheckInWindow({ bookingDate, startHour, timezone, now = new Date() }) {
  const scheduledStart = zonedDateTimeToUtc({
    date: bookingDate,
    hour: Number(startHour),
    minute: 0,
    timezone: timezone || "Asia/Kolkata",
  });
  if (!scheduledStart || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { open: false, reason: "schedule_unavailable", scheduledStart: null };
  }

  const opensAt = new Date(scheduledStart.getTime() - CHECK_IN_LEAD_MINUTES * 60_000);
  const closesAt = new Date(scheduledStart.getTime() + CHECK_IN_GRACE_MINUTES * 60_000);
  if (now < opensAt) return { open: false, reason: "too_early", scheduledStart, opensAt, closesAt };
  if (now > closesAt) return { open: false, reason: "too_late", scheduledStart, opensAt, closesAt };
  return { open: true, reason: null, scheduledStart, opensAt, closesAt };
}

module.exports = {
  CHECK_IN_GRACE_MINUTES,
  CHECK_IN_LEAD_MINUTES,
  QR_PREFIX,
  createBookingCheckInCode,
  getCheckInWindow,
  getVisitState,
  verifyBookingCheckInCode,
};
