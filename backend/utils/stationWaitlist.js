const { createCustomerNotification } = require("./customerNotifications");

const HOLD_MINUTES = 10;

function fail(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function dateKey(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value || "").slice(0, 10);
}

function currentDateAndHour(timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
  } catch (_) {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function groupContiguousHours(hours) {
  const ordered = [...new Set(hours.map(Number))].filter(Number.isFinite).sort((a, b) => a - b);
  const groups = [];
  for (const hour of ordered) {
    const last = groups[groups.length - 1];
    if (last && hour === last.end_hour) {
      last.end_hour += 1;
    } else {
      groups.push({ start_hour: hour, end_hour: hour + 1 });
    }
  }
  return groups;
}

function isCompatible(entry, opening) {
  return (
    Number(entry.business_id) === Number(opening.business_id) &&
    dateKey(entry.booking_date) === dateKey(opening.booking_date) &&
    Number(entry.start_hour) === Number(opening.start_hour) &&
    Number(entry.end_hour) === Number(opening.end_hour) &&
    (entry.preferred_pc_id == null || Number(entry.preferred_pc_id) === Number(opening.pc_id)) &&
    (entry.preferred_category == null || String(entry.preferred_category).toLowerCase() === String(opening.category || "").toLowerCase())
  );
}

async function promoteOpening(connection, openingId) {
  const [openingRows] = await connection.query(
    `SELECT opening_id, business_id, pc_id, DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, start_hour, end_hour, status
     FROM station_waitlist_openings WHERE opening_id = ? LIMIT 1 FOR UPDATE`,
    [openingId]
  );
  const opening = openingRows[0];
  if (!opening || opening.status !== "open") return null;

  const [[station]] = await connection.query("SELECT category FROM pc WHERE pc_id = ? LIMIT 1", [opening.pc_id]);
  const [entries] = await connection.query(
    `
      SELECT e.waitlist_id, e.user_id, e.business_id, e.preferred_pc_id,
        e.preferred_category, e.booking_date, e.start_hour, e.end_hour
      FROM station_waitlist_entries e
      WHERE e.status = 'waiting'
        AND e.business_id = ?
        AND e.booking_date = ?
        AND e.start_hour = ?
        AND e.end_hour = ?
        AND (e.preferred_pc_id IS NULL OR e.preferred_pc_id = ?)
        AND (e.preferred_category IS NULL OR e.preferred_category = ?)
      ORDER BY e.created_at ASC, e.waitlist_id ASC
      LIMIT 1 FOR UPDATE
    `,
    [opening.business_id, opening.booking_date, opening.start_hour, opening.end_hour, opening.pc_id, station?.category || ""]
  );
  const entry = entries[0];
  if (!entry) {
    await connection.query(
      "UPDATE station_waitlist_openings SET status = 'closed', expires_at = NULL WHERE opening_id = ? AND status = 'open'",
      [openingId]
    );
    return null;
  }

  const [inserted] = await connection.query(
    `INSERT INTO station_waitlist_offers (opening_id, waitlist_id, status, expires_at)
     VALUES (?, ?, 'offered', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [opening.opening_id, entry.waitlist_id, HOLD_MINUTES]
  );
  const offerId = Number(inserted.insertId);
  await connection.query(
    "UPDATE station_waitlist_openings SET status = 'offered', expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE opening_id = ? AND status = 'open'",
    [HOLD_MINUTES, openingId]
  );
  await connection.query(
    "UPDATE station_waitlist_entries SET status = 'offered' WHERE waitlist_id = ? AND status = 'waiting'",
    [entry.waitlist_id]
  );
  await createCustomerNotification(connection, {
    userId: entry.user_id,
    category: "waitlist",
    eventType: "station_waitlist_offer",
    title: "A station opening is ready",
    message: `Your requested time is available. Complete the booking within ${HOLD_MINUTES} minutes to claim it.`,
    deepLink: `/waitlist/offers/${offerId}`,
    entityType: "waitlist_offer",
    entityId: offerId,
    idempotencyKey: `station-waitlist-offer:${offerId}`,
  });
  return { offerId, waitlistId: Number(entry.waitlist_id) };
}

async function createOpeningsFromCancelledBooking(connection, bookingId) {
  if (!connection || typeof connection.beginTransaction !== "function") return [];
  const [rows] = await connection.query(
    `
      SELECT b.booking_id, b.business_id, b.pc_id, DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
        bs.hour, COALESCE(bus.timezone, 'Asia/Kolkata') AS timezone
      FROM booking b
      JOIN booking_slots bs ON bs.booking_id = b.booking_id
      LEFT JOIN businesses bus ON bus.business_id = b.business_id
      WHERE b.booking_id = ?
      ORDER BY bs.hour ASC
    `,
    [bookingId]
  );
  if (!rows.length) return [];

  const booking = rows[0];
  const localNow = currentDateAndHour(booking.timezone);
  const key = dateKey(booking.booking_date);
  const futureHours = rows
    .filter((row) => key > localNow.date || (key === localNow.date && Number(row.hour) > localNow.hour))
    .map((row) => Number(row.hour));
  const openings = [];
  for (const window of groupContiguousHours(futureHours)) {
    const [inserted] = await connection.query(
      `INSERT IGNORE INTO station_waitlist_openings
        (source_booking_id, business_id, pc_id, booking_date, start_hour, end_hour, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [booking.booking_id, booking.business_id, booking.pc_id, key, window.start_hour, window.end_hour]
    );
    if (Number(inserted.affectedRows || 0) > 0) {
      const openingId = Number(inserted.insertId);
      openings.push(openingId);
      await promoteOpening(connection, openingId);
    }
  }
  return openings;
}

async function claimOffer(connection, { offerId, userId, pcId, bookingDate, slots }) {
  const [lookupRows] = await connection.query(
    `
      SELECT opening_id, waitlist_id FROM station_waitlist_offers WHERE offer_id = ? LIMIT 1
    `,
    [offerId]
  );
  const openingId = lookupRows[0]?.opening_id;
  if (!openingId) throw fail("This waitlist offer was not found.", 404);
  await connection.query("SELECT opening_id FROM station_waitlist_openings WHERE opening_id = ? LIMIT 1 FOR UPDATE", [openingId]);
  const [openingRows] = await connection.query(
    `SELECT opening_id, pc_id, DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, start_hour, end_hour, status AS opening_status
     FROM station_waitlist_openings WHERE opening_id = ? LIMIT 1 FOR UPDATE`,
    [openingId]
  );
  const [entryRows] = await connection.query(
    `SELECT waitlist_id, user_id, status AS entry_status FROM station_waitlist_entries
     WHERE waitlist_id = ? LIMIT 1 FOR UPDATE`,
    [lookupRows[0].waitlist_id]
  );
  const [offerRows] = await connection.query(
    `SELECT offer_id, waitlist_id, opening_id, status AS offer_status, expires_at, (expires_at > NOW()) AS offer_live
     FROM station_waitlist_offers WHERE offer_id = ? LIMIT 1 FOR UPDATE`,
    [offerId]
  );
  if (!openingRows[0] || !entryRows[0] || !offerRows[0]) throw fail("This waitlist offer was not found.", 404);
  const offer = { ...openingRows[0], ...offerRows[0], ...entryRows[0] };
  if (Number(offer.user_id) !== Number(userId)) throw fail("This waitlist offer does not belong to your account.", 403);
  if (offer.offer_status !== "offered" || offer.entry_status !== "offered" || offer.opening_status !== "offered") {
    throw fail("This waitlist offer is no longer available. Refresh your waitlist.", 410);
  }
  if (Number(offer.offer_live || 0) !== 1) throw fail("This waitlist offer has expired. Refresh your waitlist for the next opening.", 410);

  const hours = [...new Set((slots || []).map(Number))].sort((a, b) => a - b);
  const expected = [];
  for (let hour = Number(offer.start_hour); hour < Number(offer.end_hour); hour += 1) expected.push(hour);
  if (
    Number(offer.pc_id) !== Number(pcId) ||
    dateKey(offer.booking_date) !== dateKey(bookingDate) ||
    JSON.stringify(hours) !== JSON.stringify(expected)
  ) {
    throw fail("This booking does not match the station and time window in the offer.", 400);
  }
  return { offerId: Number(offer.offer_id), openingId: Number(offer.opening_id), waitlistId: Number(offer.waitlist_id) };
}

async function markOfferClaimed(connection, claim, bookingId) {
  const [updated] = await connection.query(
    `UPDATE station_waitlist_offers SET status = 'claimed', claimed_at = NOW(), booking_id = ?
     WHERE offer_id = ? AND status = 'offered' AND expires_at > NOW()`,
    [bookingId, claim.offerId]
  );
  if (Number(updated.affectedRows || 0) !== 1) throw fail("The waitlist offer expired before the booking was confirmed.", 410);
  await connection.query("UPDATE station_waitlist_openings SET status = 'claimed', expires_at = NULL WHERE opening_id = ?", [claim.openingId]);
  await connection.query("UPDATE station_waitlist_entries SET status = 'claimed' WHERE waitlist_id = ?", [claim.waitlistId]);
  return true;
}

async function expireOffers(limit = 100) {
  const { withTransaction, query } = require("./db");
  const offers = await query(
    `SELECT offer_id FROM station_waitlist_offers WHERE status = 'offered' AND expires_at <= NOW()
     ORDER BY expires_at ASC, offer_id ASC LIMIT ?`,
    [Math.max(1, Math.min(500, Number(limit) || 100))]
  );
  let expired = 0;
  for (const row of offers) {
    const didExpire = await withTransaction(async (connection) => {
      const [lookup] = await connection.query(
        "SELECT opening_id, waitlist_id FROM station_waitlist_offers WHERE offer_id = ? LIMIT 1",
        [row.offer_id]
      );
      if (!lookup[0]) return false;
      await connection.query("SELECT opening_id FROM station_waitlist_openings WHERE opening_id = ? LIMIT 1 FOR UPDATE", [lookup[0].opening_id]);
      const [entryRows] = await connection.query("SELECT waitlist_id, user_id FROM station_waitlist_entries WHERE waitlist_id = ? LIMIT 1 FOR UPDATE", [lookup[0].waitlist_id]);
      if (!entryRows[0]) return false;
      const [locked] = await connection.query(
        `SELECT o.offer_id, o.waitlist_id, o.opening_id FROM station_waitlist_offers o
         WHERE o.offer_id = ? AND o.status = 'offered' AND o.expires_at <= NOW() LIMIT 1 FOR UPDATE`,
        [row.offer_id]
      );
      if (!locked[0]) return false;
      const offer = locked[0];
      await connection.query("UPDATE station_waitlist_offers SET status = 'expired' WHERE offer_id = ?", [offer.offer_id]);
      await connection.query("UPDATE station_waitlist_entries SET status = 'expired' WHERE waitlist_id = ? AND status = 'offered'", [offer.waitlist_id]);
      await createCustomerNotification(connection, {
        userId: entryRows[0].user_id,
        category: "waitlist",
        eventType: "station_waitlist_offer_expired",
        title: "Waitlist offer expired",
        message: `The ${HOLD_MINUTES}-minute claim window ended. You can join the waitlist again for another opening.`,
        deepLink: "/notifications",
        entityType: "waitlist_offer",
        entityId: offer.offer_id,
        idempotencyKey: `station-waitlist-offer:${offer.offer_id}:expired`,
      });
      await connection.query("UPDATE station_waitlist_openings SET status = 'open', expires_at = NULL WHERE opening_id = ? AND status = 'offered'", [offer.opening_id]);
      await promoteOpening(connection, offer.opening_id);
      return true;
    });
    if (didExpire) expired += 1;
  }
  return { expired, checked: offers.length };
}

module.exports = {
  HOLD_MINUTES,
  claimOffer,
  createOpeningsFromCancelledBooking,
  currentDateAndHour,
  expireOffers,
  groupContiguousHours,
  isCompatible,
  markOfferClaimed,
  promoteOpening,
};
