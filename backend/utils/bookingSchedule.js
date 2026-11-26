const { zonedDateTimeToUtc } = require("./timeZones");

function toDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(value) {
  const parsed = toDate(value);

  if (parsed) {
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function buildSlotDate(bookingDate, hour) {
  const dateKey = formatDateKey(bookingDate);
  const normalizedHour = Number(hour);

  if (!dateKey || !Number.isInteger(normalizedHour)) {
    return null;
  }

  return new Date(`${dateKey}T${String(normalizedHour).padStart(2, "0")}:00:00`);
}

function toReferenceDate(value = new Date()) {
  const parsed = toDate(value);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function determineConfirmedBookingAction({
  bookingDate,
  startHour,
  endHour,
  referenceTime = new Date(),
}) {
  const now = toReferenceDate(referenceTime);
  const scheduledStart = buildSlotDate(bookingDate, startHour);
  const scheduledEnd = buildSlotDate(bookingDate, endHour);

  if (!now || !scheduledStart || !scheduledEnd) {
    return "none";
  }

  if (now >= scheduledEnd) {
    return "catch_up_close";
  }

  if (now >= scheduledStart) {
    return "start";
  }

  return "none";
}

function shouldFinishRunningBooking({
  bookingDate,
  endHour,
  referenceTime = new Date(),
}) {
  const now = toReferenceDate(referenceTime);
  const scheduledEnd = buildSlotDate(bookingDate, endHour);
  return Boolean(now && scheduledEnd && now >= scheduledEnd);
}

function shouldCancelNoShowBooking({
  bookingDate,
  startHour,
  timezone,
  referenceTime = new Date(),
  graceMinutes = 15,
}) {
  const now = toReferenceDate(referenceTime);
  const normalizedStartHour = Number(startHour);
  const normalizedGraceMinutes = Number(graceMinutes);

  if (bookingDate && timezone) {
    const scheduledStart = zonedDateTimeToUtc({
      date: bookingDate,
      hour: normalizedStartHour,
      minute: 0,
      timezone,
    });
    if (!now || !scheduledStart) return false;
    return now.getTime() > scheduledStart.getTime() +
      (Number.isFinite(normalizedGraceMinutes) ? normalizedGraceMinutes : 15) * 60_000;
  }

  if (!now || !Number.isInteger(normalizedStartHour)) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const allowedMinutes =
    normalizedStartHour * 60 +
    (Number.isFinite(normalizedGraceMinutes) ? normalizedGraceMinutes : 15);

  return currentMinutes > allowedMinutes;
}

module.exports = {
  buildSlotDate,
  determineConfirmedBookingAction,
  formatDateKey,
  shouldCancelNoShowBooking,
  shouldFinishRunningBooking,
};
