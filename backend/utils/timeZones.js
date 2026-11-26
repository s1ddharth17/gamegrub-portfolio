function isValidTimeZone(value) {
  const timezone = String(value || "").trim();
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch (_) {
    return false;
  }
}

function dateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

function zonedDateTimeToUtc({ date, hour = 0, minute = 0, timezone = "UTC" }) {
  const key = dateKey(date);
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (
    !key || !Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23 ||
    !Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59 ||
    !isValidTimeZone(timezone)
  ) return null;

  const [year, month, day] = key.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, parsedHour, parsedMinute);
  let candidate = desiredUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value])
    );
    const observedUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute)
    );
    const delta = observedUtc - desiredUtc;
    if (delta === 0) break;
    candidate -= delta;
  }

  return new Date(candidate);
}

function formatTimeInZone(value, timezone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timezone)) return "";
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

module.exports = {
  dateKey,
  formatTimeInZone,
  isValidTimeZone,
  zonedDateTimeToUtc,
};
