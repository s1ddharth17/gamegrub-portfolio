const express = require("express");
const auth = require("../middleware/auth");
const { query, withTransaction } = require("../utils/db");
const { currentDateAndHour, HOLD_MINUTES, promoteOpening } = require("../utils/stationWaitlist");

const router = express.Router();
const OPEN_HOUR = 9;
const CLOSE_HOUR = 23;

function userIdFrom(req) {
  return Number(req.user?.id || 0);
}

function dateIsValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.post("/", auth, async (req, res) => {
  const userId = userIdFrom(req);
  const businessId = Number(req.body?.business_id || 0);
  const preferredPcId = req.body?.preferred_pc_id == null ? null : Number(req.body.preferred_pc_id);
  const preferredCategory = String(req.body?.preferred_category || "").trim();
  const bookingDate = String(req.body?.booking_date || "");
  const startHour = Number(req.body?.start_hour);
  const endHour = Number(req.body?.end_hour);
  if (
    !Number.isInteger(businessId) || businessId <= 0 || !dateIsValid(bookingDate) ||
    (!preferredPcId && !preferredCategory) || (preferredPcId && preferredCategory) ||
    (preferredPcId != null && (!Number.isInteger(preferredPcId) || preferredPcId <= 0)) ||
    !Number.isInteger(startHour) || !Number.isInteger(endHour) ||
    startHour < OPEN_HOUR || endHour > CLOSE_HOUR || endHour <= startHour
  ) return res.status(400).json({ error: "Choose a station or category and a valid continuous time window." });

  try {
    const result = await withTransaction(async (connection) => {
      const [[user]] = await connection.query("SELECT uid FROM users WHERE uid = ? LIMIT 1 FOR UPDATE", [userId]);
      if (!user) {
        const error = new Error("User not found."); error.statusCode = 404; throw error;
      }
      const [[business]] = await connection.query("SELECT timezone FROM businesses WHERE business_id = ? LIMIT 1", [businessId]);
      if (!business) { const error = new Error("Café not found."); error.statusCode = 404; throw error; }
      const localNow = currentDateAndHour(business.timezone);
      if (bookingDate < localNow.date || (bookingDate === localNow.date && startHour <= localNow.hour)) {
        const error = new Error("Choose a future booking window."); error.statusCode = 400; throw error;
      }
      const [stations] = await connection.query(
        `SELECT pc_id, business_id, category FROM pc WHERE business_id = ? AND status <> 'inactive'
          AND (? IS NULL OR pc_id = ?) AND (? = '' OR category = ?) ORDER BY pc_id`,
        [businessId, preferredPcId, preferredPcId, preferredCategory, preferredCategory]
      );
      if (!stations.length) {
        const error = new Error("No active station matches that preference."); error.statusCode = 404; throw error;
      }

      const pcIds = stations.map((station) => Number(station.pc_id));
      const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
      const [userConflicts] = await connection.query(
        `SELECT b.booking_id FROM booking b JOIN booking_slots bs ON bs.booking_id = b.booking_id
         WHERE b.user_id = ? AND bs.booking_date = ? AND bs.hour IN (?)
           AND b.status NOT IN ('cancelled', 'closed', 'completed')
           AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
         LIMIT 1`,
        [userId, bookingDate, hours]
      );
      if (userConflicts.length) {
        const error = new Error("You already have a booking during part of that window."); error.statusCode = 409; throw error;
      }
      const [bookingBusyRows] = await connection.query(
        `
          SELECT DISTINCT bs.pc_id, bs.hour
          FROM booking_slots bs JOIN booking b ON b.booking_id = bs.booking_id
          WHERE bs.business_id = ? AND bs.pc_id IN (?) AND bs.booking_date = ? AND bs.hour IN (?)
            AND b.status NOT IN ('cancelled', 'closed', 'completed')
            AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
        `,
        [businessId, pcIds, bookingDate, hours]
      );
      const [heldOpenings] = await connection.query(
        `SELECT pc_id, start_hour, end_hour FROM station_waitlist_openings
         WHERE pc_id IN (?) AND booking_date = ? AND status IN ('open', 'offered')`,
        [pcIds, bookingDate]
      );
      const busy = new Set(bookingBusyRows.map((row) => `${Number(row.pc_id)}:${Number(row.hour)}`));
      for (const opening of heldOpenings) {
        for (let hour = Number(opening.start_hour); hour < Number(opening.end_hour); hour += 1) {
          busy.add(`${Number(opening.pc_id)}:${hour}`);
        }
      }
      const hasBookableStation = pcIds.some((pcId) => hours.every((hour) => !busy.has(`${pcId}:${hour}`)));
      if (hasBookableStation) {
        const error = new Error("That window is still available. Book it directly to reserve your station."); error.statusCode = 409; throw error;
      }

      const [duplicates] = await connection.query(
        `SELECT waitlist_id FROM station_waitlist_entries WHERE user_id = ? AND business_id = ?
          AND booking_date = ? AND start_hour = ? AND end_hour = ?
          AND (preferred_pc_id <=> ?) AND (preferred_category <=> ?)
          AND status IN ('waiting', 'offered') LIMIT 1 FOR UPDATE`,
        [userId, businessId, bookingDate, startHour, endHour, preferredPcId, preferredCategory || null]
      );
      if (duplicates.length) {
        const error = new Error("You already have an active waitlist request for this window."); error.statusCode = 409; throw error;
      }
      const [inserted] = await connection.query(
        `INSERT INTO station_waitlist_entries
          (user_id, business_id, preferred_pc_id, preferred_category, booking_date, start_hour, end_hour, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
        [userId, businessId, preferredPcId, preferredCategory || null, bookingDate, startHour, endHour]
      );
      const waitlistId = Number(inserted.insertId);
      const [openings] = await connection.query(
        `SELECT opening_id FROM station_waitlist_openings WHERE business_id = ? AND booking_date = ?
          AND start_hour = ? AND end_hour = ? AND status = 'open'
          AND pc_id IN (?) ORDER BY created_at ASC, opening_id ASC`,
        [businessId, bookingDate, startHour, endHour, pcIds]
      );
      for (const opening of openings) await promoteOpening(connection, opening.opening_id);
      return { waitlist_id: waitlistId, status: "waiting", hold_minutes: HOLD_MINUTES };
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const rows = await query(
      `
        SELECT e.waitlist_id, e.business_id, e.preferred_pc_id, e.preferred_category,
          DATE_FORMAT(e.booking_date, '%Y-%m-%d') AS booking_date, e.start_hour, e.end_hour, e.status, e.created_at,
          bus.business_name,
          o.offer_id, o.expires_at AS offer_expires_at,
          op.pc_id AS offered_pc_id, pc.category AS offered_category, pc.specs AS offered_specs,
          pc.price_per_hour AS offered_price_per_hour
        FROM station_waitlist_entries e
        LEFT JOIN businesses bus ON bus.business_id = e.business_id
        LEFT JOIN station_waitlist_offers o ON o.waitlist_id = e.waitlist_id AND o.status = 'offered'
        LEFT JOIN station_waitlist_openings op ON op.opening_id = o.opening_id
        LEFT JOIN pc ON pc.pc_id = op.pc_id
        WHERE e.user_id = ? AND e.status IN ('waiting', 'offered')
        ORDER BY e.created_at DESC, e.waitlist_id DESC
      `,
      [userIdFrom(req)]
    );
    res.json({ data: rows.map((row) => ({ ...row, offer_id: row.offer_id == null ? null : Number(row.offer_id), hold_minutes: HOLD_MINUTES })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  const waitlistId = Number(req.params.id);
  try {
    await withTransaction(async (connection) => {
      const [offerLookup] = await connection.query(
        `SELECT opening_id, offer_id FROM station_waitlist_offers
         WHERE waitlist_id = ? AND status = 'offered' LIMIT 1`,
        [waitlistId]
      );
      if (offerLookup[0]) {
        await connection.query("SELECT opening_id FROM station_waitlist_openings WHERE opening_id = ? LIMIT 1 FOR UPDATE", [offerLookup[0].opening_id]);
      }
      const [rows] = await connection.query(
        `SELECT waitlist_id, status FROM station_waitlist_entries WHERE waitlist_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
        [waitlistId, userIdFrom(req)]
      );
      const entry = rows[0];
      if (!entry) { const error = new Error("Waitlist request not found."); error.statusCode = 404; throw error; }
      if (!['waiting', 'offered'].includes(entry.status)) return;
      const [offers] = await connection.query(
        `SELECT offer_id, opening_id FROM station_waitlist_offers WHERE waitlist_id = ? AND status = 'offered' LIMIT 1 FOR UPDATE`,
        [waitlistId]
      );
      await connection.query("UPDATE station_waitlist_entries SET status = 'cancelled' WHERE waitlist_id = ?", [waitlistId]);
      if (offers[0]) {
        await connection.query("UPDATE station_waitlist_offers SET status = 'cancelled' WHERE offer_id = ?", [offers[0].offer_id]);
        await connection.query("UPDATE station_waitlist_openings SET status = 'open', expires_at = NULL WHERE opening_id = ?", [offers[0].opening_id]);
        await promoteOpening(connection, offers[0].opening_id);
      }
    });
    res.json({ status: "cancelled" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/offers/:id", auth, async (req, res) => {
  try {
    const rows = await query(
      `
        SELECT o.offer_id, o.status AS offer_status, o.expires_at, (o.expires_at > NOW()) AS offer_live,
          e.user_id, e.status AS entry_status, op.opening_id, op.pc_id,
          op.business_id, DATE_FORMAT(op.booking_date, '%Y-%m-%d') AS booking_date, op.start_hour, op.end_hour,
          pc.category, pc.specs, pc.price_per_hour, pc.status AS pc_status
        FROM station_waitlist_offers o
        JOIN station_waitlist_entries e ON e.waitlist_id = o.waitlist_id
        JOIN station_waitlist_openings op ON op.opening_id = o.opening_id
        JOIN pc ON pc.pc_id = op.pc_id
        WHERE o.offer_id = ? AND e.user_id = ? LIMIT 1
      `,
      [Number(req.params.id), userIdFrom(req)]
    );
    const offer = rows[0];
    if (!offer) return res.status(404).json({ error: "Waitlist offer not found." });
    if (offer.offer_status !== "offered" || offer.entry_status !== "offered" || Number(offer.offer_live || 0) !== 1) {
      return res.status(410).json({ error: "This waitlist offer has expired. Refresh your waitlist to check for another opening." });
    }
    res.json({
      offer_id: Number(offer.offer_id),
      expires_at: offer.expires_at,
      hold_minutes: HOLD_MINUTES,
      booking_date: String(offer.booking_date).slice(0, 10),
      start_hour: Number(offer.start_hour),
      end_hour: Number(offer.end_hour),
      pc: { pc_id: Number(offer.pc_id), business_id: Number(offer.business_id), category: offer.category, specs: offer.specs, price_per_hour: offer.price_per_hour, status: offer.pc_status },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
