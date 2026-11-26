const auth = require("../middleware/auth");
const { paymentAttemptLimiter } = require("../middleware/requestThrottle");
const { roundCurrency } = require("../utils/billing");
const { withTransaction } = require("../utils/db");
const { ensureUserOwnsBooking } = require("../utils/userAccess");

const EDITABLE_ORDER_STATUS = "active";
const ALLOWED_PAYMENT_METHODS = new Set(["cash", "upi", "card", "wallet"]);

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePaymentMethod(value) {
  const normalized = normalizeStatus(value);
  return ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : "";
}

function normalizePaymentReference(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeCheckoutItems(items = []) {
  const quantitiesByMenu = new Map();
  for (const rawItem of Array.isArray(items) ? items : []) {
    const menuId = Number(rawItem?.menu_id ?? rawItem?.menuId);
    const qty = Number(rawItem?.qty ?? rawItem?.quantity);
    if (!Number.isInteger(menuId) || !Number.isInteger(qty) || qty <= 0) continue;
    quantitiesByMenu.set(menuId, (quantitiesByMenu.get(menuId) || 0) + qty);
  }
  return [...quantitiesByMenu.entries()].map(([menuId, qty]) => ({ menuId, qty }));
}

function appendPaymentNote(existingNotes, paymentMethod, paymentReference) {
  const entry = `Paid via ${paymentMethod.toUpperCase()}${
    paymentReference ? ` (${paymentReference})` : ""
  }`;
  const current = typeof existingNotes === "string" ? existingNotes.trim() : "";
  return current ? `${current} | ${entry}` : entry;
}

function appendOrderNote(existingNotes, entry) {
  const current = typeof existingNotes === "string" ? existingNotes.trim() : "";
  if (!current) return entry;
  if (current.includes(entry)) return current;
  return `${current} | ${entry}`;
}

function hasSessionStarted(booking) {
  if (!booking?.start_time) return false;
  const startTime = new Date(booking.start_time);
  return !Number.isNaN(startTime.getTime()) && startTime <= new Date();
}

async function ensureBookingReadyForOrders(connection, bookingId) {
  const [rows] = await connection.query(
    `SELECT booking_id, business_id, user_id, status, start_time
     FROM booking WHERE booking_id = ? LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }
  const booking = rows[0];
  const status = normalizeStatus(booking.status);
  const started = hasSessionStarted(booking);
  if (!(status === "running" || (status === "confirmed" && started))) {
    const error = new Error("Food ordering starts once the session is live");
    error.statusCode = 400;
    throw error;
  }
  return booking;
}

function registerOrderCheckoutRoutes(router) {
  router.post("/checkout", auth, paymentAttemptLimiter, async (req, res) => {
    const {
      booking_id: bookingId,
      items,
      payment_method: rawPaymentMethod,
      payment_reference: rawPaymentReference,
      defer_payment: rawDeferPayment,
      customer_notes: rawCustomerNotes,
    } = req.body;
    const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
    const paymentReference = normalizePaymentReference(rawPaymentReference);
    const normalizedItems = normalizeCheckoutItems(items);
    const deferPayment = normalizeBoolean(rawDeferPayment);
    const customerNotes = typeof rawCustomerNotes === "string"
      ? rawCustomerNotes.trim().slice(0, 500)
      : "";

    if (!bookingId) return res.status(400).json({ error: "booking_id required" });
    if (!deferPayment) {
      return res.status(409).json({
        error: "Customer order charges are collected on the verified session checkout.",
      });
    }
    if (!normalizedItems.length) {
      return res.status(400).json({ error: "Select at least one item to order" });
    }

    try {
      const response = await withTransaction(async (connection) => {
        await ensureUserOwnsBooking(connection, Number(req.user?.id || 0), bookingId);
        const booking = await ensureBookingReadyForOrders(connection, bookingId);
        const businessId = Number(booking.business_id || 1);
        const [paymentRows] = await connection.query(
          `SELECT payment_id, status FROM payments WHERE booking_id = ? LIMIT 1`,
          [bookingId]
        );
        if (!paymentRows.length) {
          const error = new Error("Booking payment record not found");
          error.statusCode = 404;
          throw error;
        }
        if (normalizeStatus(paymentRows[0].status) === "cancelled") {
          const error = new Error("Cancelled bookings cannot place food orders");
          error.statusCode = 400;
          throw error;
        }

        const [existingOrders] = await connection.query(
          `SELECT order_id, notes, customer_notes FROM orders
           WHERE booking_id = ? AND status = ? ORDER BY order_id DESC LIMIT 1`,
          [bookingId, EDITABLE_ORDER_STATUS]
        );
        let orderId = Number(existingOrders[0]?.order_id || 0);
        let currentNotes = existingOrders[0]?.notes || "";
        if (!orderId) {
          const [insertResult] = await connection.query(
            `INSERT INTO orders (
               business_id, booking_id, total_amount, status, notes, accepted_at, customer_notes
             ) VALUES (?, ?, 0, ?, '', UTC_TIMESTAMP(), ?)`,
            [businessId, bookingId, EDITABLE_ORDER_STATUS, customerNotes || null]
          );
          orderId = Number(insertResult.insertId || 0);
        }

        let chargedAmount = 0;
        for (const item of normalizedItems) {
          const [menuRows] = await connection.query(
            `SELECT amount, is_available, name FROM menu
             WHERE id = ? AND business_id = ? LIMIT 1`,
            [item.menuId, businessId]
          );
          if (!menuRows.length || Number(menuRows[0].is_available) === 0) {
            const itemName = menuRows[0]?.name;
            const error = new Error(
              itemName ? `${itemName} is unavailable. Remove it before checkout.`
                : "One or more menu items are unavailable. Refresh the menu before checkout."
            );
            error.statusCode = 400;
            throw error;
          }

          const price = roundCurrency(menuRows[0].amount || 0);
          const [existingRows] = await connection.query(
            `SELECT item_id, qty, total FROM order_items
             WHERE order_id = ? AND menu_id = ? ORDER BY item_id DESC LIMIT 1`,
            [orderId, item.menuId]
          );
          const existingItem = existingRows[0] || null;
          const currentQty = Number(existingItem?.qty || 0);
          const nextQty = currentQty + item.qty;
          const previousTotal = roundCurrency(existingItem?.total || 0);
          const nextTotal = roundCurrency(price * nextQty);
          const delta = roundCurrency(nextTotal - previousTotal);
          if (existingItem) {
            await connection.query(
              "UPDATE order_items SET qty = ?, price = ?, total = ? WHERE item_id = ?",
              [nextQty, price, nextTotal, existingItem.item_id]
            );
          } else {
            await connection.query(
              "INSERT INTO order_items (order_id, menu_id, qty, price, total) VALUES (?, ?, ?, ?, ?)",
              [orderId, item.menuId, item.qty, price, roundCurrency(price * item.qty)]
            );
          }
          chargedAmount = roundCurrency(chargedAmount + delta);
        }

        if (chargedAmount <= 0) {
          const error = new Error("Nothing new was added to the order");
          error.statusCode = 400;
          throw error;
        }
        currentNotes = deferPayment
          ? appendOrderNote(currentNotes, "Pay at session checkout")
          : appendPaymentNote(currentNotes, paymentMethod, paymentReference);
        await connection.query(
          `UPDATE orders
           SET total_amount = GREATEST(0, total_amount + ?), notes = ?,
             customer_notes = CASE WHEN ? <> '' THEN ? ELSE customer_notes END,
             accepted_at = COALESCE(accepted_at, UTC_TIMESTAMP())
           WHERE order_id = ?`,
          [chargedAmount, currentNotes, customerNotes, customerNotes, orderId]
        );
        await connection.query(
          `INSERT INTO order_status_history (
             order_id, previous_status, status, changed_by_admin_id, eta_at, changed_at
           ) SELECT ?, NULL, 'accepted', NULL, NULL,
             COALESCE(accepted_at, created_at, UTC_TIMESTAMP())
           FROM orders WHERE order_id = ? AND NOT EXISTS (
             SELECT 1 FROM order_status_history WHERE order_id = ?
           )`,
          [orderId, orderId, orderId]
        );
        await connection.query(
          `UPDATE payments SET amount = amount + ?,
             status = CASE WHEN status IN ('paid', 'advance_paid', 'partially_paid')
               THEN status ELSE 'pending' END,
             gateway_status = CASE WHEN status IN ('paid', 'advance_paid', 'partially_paid')
               THEN gateway_status ELSE 'awaiting_settlement' END
           WHERE payment_id = ?`,
          [chargedAmount, paymentRows[0].payment_id]
        );
        return {
          order_id: orderId,
          charged_amount: roundCurrency(chargedAmount),
          payment_deferred: deferPayment,
          payment_method: deferPayment ? null : paymentMethod,
          payment_reference: deferPayment ? null : paymentReference,
        };
      });

      return res.json({
        message: deferPayment
          ? "Order sent to the kitchen. Payment will be collected at session checkout"
          : "Payment captured and order sent to the kitchen",
        ...response,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
}

module.exports = { registerOrderCheckoutRoutes };
