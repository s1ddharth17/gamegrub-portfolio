const { roundCurrency } = require("../utils/billing");
const { query } = require("../utils/db");
const { ensureSameUser, ensureUserOwnsBooking } = require("../utils/userAccess");
const { createBookingCheckInCode, getVisitState } = require("../utils/bookingCheckIn");
const auth = require("../middleware/auth");

function getAuthenticatedUserId(req) {
  return Number(req.user?.id || 0);
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTimeRange(startHour, endHour) {
  if (startHour === null || startHour === undefined || endHour === null || endHour === undefined) {
    return null;
  }
  return `${startHour}:00 - ${endHour + 1}:00`;
}

function registerBookingReadRoutes(router) {
  router.get("/user/:id", auth, async (req, res) => {
    try {
      ensureSameUser(req.params.id, getAuthenticatedUserId(req));
      const rows = await query(
        `
          SELECT
            b.booking_id,
            MAX(b.business_id) AS business_id,
            MAX(bus.name) AS business_name,
            b.pc_id,
            MAX(pc.category) AS pc_category,
            b.booking_date,
            b.status,
            b.total_amount,
            b.start_time,
            b.actual_end_time,
            b.checked_in_at,
            COUNT(bs.hour) AS total_hours,
            MIN(bs.hour) AS start_hour,
            MAX(bs.hour) AS end_hour,
            MAX(p.final_amount) AS final_amount,
            MAX(p.status) AS payment_status,
            MAX(bi.bill_id) AS bill_id,
            (SELECT r.refund_number FROM payment_refunds r WHERE r.booking_id = b.booking_id ORDER BY r.requested_at DESC LIMIT 1) AS refund_number,
            (SELECT r.status FROM payment_refunds r WHERE r.booking_id = b.booking_id ORDER BY r.requested_at DESC LIMIT 1) AS refund_status,
            (SELECT COALESCE(r.outcome_message, r.failure_description) FROM payment_refunds r WHERE r.booking_id = b.booking_id ORDER BY r.requested_at DESC LIMIT 1) AS refund_message
          FROM booking b
          LEFT JOIN booking_slots bs ON bs.booking_id = b.booking_id
          LEFT JOIN pc ON pc.pc_id = b.pc_id
          LEFT JOIN businesses bus ON bus.business_id = b.business_id
          LEFT JOIN payments p ON p.booking_id = b.booking_id
          LEFT JOIN bills bi ON bi.booking_id = b.booking_id
          WHERE b.user_id = ?
          GROUP BY
            b.booking_id,
            b.pc_id,
            b.booking_date,
            b.status,
            b.total_amount,
            b.start_time,
            b.actual_end_time,
            b.checked_in_at
          ORDER BY b.booking_id DESC
        `,
        [req.params.id]
      );

      return res.json(rows.map((row) => ({
        ...row,
        total_amount: roundCurrency(row.total_amount || 0),
        final_amount: roundCurrency(row.final_amount || 0),
        time_range: formatTimeRange(row.start_hour, row.end_hour),
        visit_state: getVisitState({
          status: row.status,
          checkedInAt: row.checked_in_at,
          paymentStatus: row.payment_status,
        }),
      })));
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/check-in-code/:id", auth, async (req, res) => {
    const bookingId = Number(req.params.id);
    const userId = getAuthenticatedUserId(req);
    try {
      await ensureUserOwnsBooking(null, userId, bookingId);
      const rows = await query(
        `SELECT booking_id, user_id, status, checked_in_at
         FROM booking WHERE booking_id = ? AND user_id = ? LIMIT 1`,
        [bookingId, userId]
      );
      const booking = rows[0];
      if (!booking) return res.status(404).json({ error: "Booking not found." });
      const visitState = getVisitState({
        status: booking.status,
        checkedInAt: booking.checked_in_at,
      });
      if (!["confirmed", "running", "checked_in"].includes(visitState)) {
        return res.status(409).json({ error: "This booking is not open for check-in." });
      }
      if (booking.checked_in_at) {
        return res.json({ already_checked_in: true, code: null, visit_state: "checked_in" });
      }
      return res.json({
        already_checked_in: false,
        code: createBookingCheckInCode({ bookingId, userId }),
        visit_state: visitState,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/user-bookings", auth, async (req, res) => {
    try {
      if (req.query.user_id) {
        ensureSameUser(req.query.user_id, getAuthenticatedUserId(req));
      }
      const userId = getAuthenticatedUserId(req);
      const rows = await query(
        `
          SELECT
            b.booking_id,
            b.pc_id,
            MAX(pc.category) AS pc_category,
            b.booking_date,
            b.status,
            COUNT(bs.hour) AS total_hours,
            MIN(bs.hour) AS start_hour,
            MAX(bs.hour) AS end_hour
          FROM booking b
          LEFT JOIN booking_slots bs ON bs.booking_id = b.booking_id
          LEFT JOIN pc ON pc.pc_id = b.pc_id
          WHERE b.user_id = ?
          GROUP BY b.booking_id, b.pc_id, b.booking_date, b.status
          ORDER BY b.booking_date DESC, start_hour ASC
        `,
        [userId]
      );
      return res.json({
        data: rows.map((row) => ({
          ...row,
          time_range: formatTimeRange(row.start_hour, row.end_hour),
        })),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/current-session", auth, async (req, res) => {
    if (req.query.user_id) {
      try {
        ensureSameUser(req.query.user_id, getAuthenticatedUserId(req));
      } catch (error) {
        return res.status(error.statusCode || 403).json({ error: error.message });
      }
    }
    const userId = getAuthenticatedUserId(req);
    const now = new Date();
    const today = formatDate(now);
    const currentHour = now.getHours();

    try {
      const rows = await query(
        `
          SELECT
            b.booking_id,
            b.pc_id,
            b.status,
            MIN(bs.hour) AS start_hour,
            MAX(bs.hour) + 1 AS end_hour
          FROM booking b
          JOIN booking_slots bs ON bs.booking_id = b.booking_id
          WHERE b.user_id = ?
          AND b.booking_date = ?
          AND b.status IN ('confirmed', 'running', 'session_over')
          GROUP BY b.booking_id, b.pc_id, b.status
        `,
        [userId, today]
      );
      const session = rows.find(
        (row) => currentHour >= Number(row.start_hour) && currentHour < Number(row.end_hour)
      );
      if (!session) return res.json({ active: false });
      return res.json({ active: true, session });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerBookingReadRoutes };
