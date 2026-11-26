const express = require("express");
const { randomUUID } = require("node:crypto");

const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const { paymentAttemptLimiter } = require("../middleware/requestThrottle");
const {
  calculateBreakdown,
  getSessionClock,
  roundCurrency,
  summarizeSlotUsage,
  toNumber,
} = require("../utils/billing");
const { query, withTransaction } = require("../utils/db");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const { ensureSameUser, ensureUserOwnsBooking } = require("../utils/userAccess");
const { createProviderOrder, createExistingCheckoutLink, getCheckoutExpiry } = require("../utils/paymentCheckout");
const razorpay = require("../utils/razorpay");
const { recordPaymentTransaction } = require("../utils/paymentLedger");
const { createRefundRequest } = require("../utils/paymentRefunds");
const { createCustomerNotification } = require("../utils/customerNotifications");
const { claimOffer, createOpeningsFromCancelledBooking, markOfferClaimed } = require("../utils/stationWaitlist");
const { awardSettledVisit } = require("../utils/loyaltyProgram");
const { registerBookingReadRoutes } = require("./bookingReadRoutes");

const router = express.Router();

const OPEN_HOUR = 9;
const CLOSE_HOUR = 23;
const OPEN_ORDER_STATUSES = ["active", "preparing", "completed", "delivered"];
const ALLOWED_PAYMENT_METHODS = new Set(["cash", "razorpay"]);

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

function normalizeSlots(slots = []) {
  const uniqueSlots = [...new Set((slots || []).map((slot) => Number(slot)).filter(Number.isInteger))];
  uniqueSlots.sort((left, right) => left - right);
  return uniqueSlots;
}

function normalizePaymentMethod(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : "";
}

function normalizePaymentReference(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  return false;
}

function buildFeeBreakdownOptions(source = {}) {
  return {
    commissionRate: source.commission_rate || 0,
    convenienceFeeFlat: source.convenience_fee_flat || 0,
    convenienceFeeRate: source.convenience_fee_rate || 0,
  };
}

async function findUserBookingConflict(
  connection,
  { userId, bookingDate, slotHours = [], excludeBookingId = null }
) {
  const normalizedSlotHours = normalizeSlots(slotHours);

  if (!userId || !bookingDate || !normalizedSlotHours.length) {
    return null;
  }

  const params = [userId, bookingDate, normalizedSlotHours];
  let excludeClause = "";

  if (excludeBookingId) {
    excludeClause = "AND b.booking_id <> ?";
    params.push(excludeBookingId);
  }

  const [rows] = await connection.query(
    `
      SELECT
        b.booking_id,
        b.pc_id,
        b.status,
        MIN(bs.hour) AS start_hour,
        MAX(bs.hour) AS end_hour
      FROM booking b
      JOIN booking_slots bs ON bs.booking_id = b.booking_id
      WHERE b.user_id = ?
      AND b.booking_date = ?
      AND b.status NOT IN ('cancelled', 'closed', 'completed')
      AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
      AND bs.hour IN (?)
      ${excludeClause}
      GROUP BY b.booking_id, b.pc_id, b.status
      ORDER BY
        CASE
          WHEN b.status = 'running' THEN 1
          WHEN b.status = 'session_over' THEN 2
          WHEN b.status = 'confirmed' THEN 3
          ELSE 4
        END,
        b.booking_id DESC
      LIMIT 1
    `,
    params
  );

  return rows[0] || null;
}

function buildUserBookingConflictMessage(conflict) {
  if (!conflict) {
    return "You already have another booking during this time";
  }

  const timeRange = formatTimeRange(conflict.start_hour, conflict.end_hour);
  const rangeSuffix = timeRange ? ` (${timeRange})` : "";

  return `You already have booking #${conflict.booking_id} on PC ${conflict.pc_id}${rangeSuffix}. Finish, cancel, or choose a different time before booking another PC in the same slot.`;
}

async function getFoodTotal(connection, bookingId, statuses = OPEN_ORDER_STATUSES) {
  const placeholders = statuses.map(() => "?").join(",");
  const [rows] = await connection.query(
    `
      SELECT COALESCE(SUM(oi.total), 0) AS food_total
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.order_id
      WHERE o.booking_id = ?
      AND o.status IN (${placeholders})
    `,
    [bookingId, ...statuses]
  );

  return roundCurrency(rows[0]?.food_total || 0);
}

async function getBookingSettlementSnapshot(connection, bookingId) {
  const [rows] = await connection.query(
    `
      SELECT
        b.booking_id,
        b.business_id,
        b.user_id,
        b.pc_id,
        b.booking_date,
        b.status,
        b.start_time,
        b.actual_end_time,
        b.total_amount,
        pc.price_per_hour,
        COALESCE(bus.commission_rate, 0) AS commission_rate,
        COALESCE(bus.convenience_fee_flat, 0) AS convenience_fee_flat,
        COALESCE(bus.convenience_fee_rate, 0) AS convenience_fee_rate,
        u.loyalty_points,
        COALESCE(p.captured_amount, 0) AS captured_amount,
        COALESCE(p.loyalty_amount, 0) AS loyalty_amount,
        COALESCE(p.status, 'pending') AS payment_status
      FROM booking b
      JOIN pc ON b.pc_id = pc.pc_id
      LEFT JOIN businesses bus ON bus.business_id = b.business_id
      JOIN users u ON b.user_id = u.uid
      LEFT JOIN payments p ON p.booking_id = b.booking_id
      WHERE b.booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  return rows[0] || null;
}

async function getBookingSlotHours(connection, bookingId) {
  const [rows] = await connection.query(
    `
      SELECT hour
      FROM booking_slots
      WHERE booking_id = ?
      ORDER BY hour ASC
    `,
    [bookingId]
  );

  return rows.map((row) => Number(row.hour)).filter(Number.isInteger);
}

async function recordLoyaltyActivity(connection, payload) {
  await connection.query(
    `
      INSERT INTO loyalty_transactions (
        user_id,
        booking_id,
        points,
        transaction_type,
        note
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      payload.userId,
      payload.bookingId || null,
      payload.points,
      payload.transactionType,
      payload.note || null,
    ]
  );
}

async function buildLiveBreakdown(bookingId) {
  return withTransaction(async (connection) => {
    const booking = await getBookingSettlementSnapshot(connection, bookingId);

    if (!booking || !booking.start_time) {
      const error = new Error("Session not available for billing.");
      error.statusCode = 404;
      throw error;
    }

    const slotHours = await getBookingSlotHours(connection, bookingId);

    if (!slotHours.length) {
      const error = new Error("Booked slots not found.");
      error.statusCode = 404;
      throw error;
    }

    const sessionClock = getSessionClock({
      bookingDate: booking.booking_date,
      slotHours,
      startTime: booking.start_time,
      endTime:
        booking.status === "session_over" || booking.status === "closed"
          ? booking.actual_end_time
          : null,
      fallbackEndTime: new Date(),
    });
    const billingEnd = sessionClock.effectiveEndTime || new Date();
    const slotUsage = summarizeSlotUsage({
      bookingDate: booking.booking_date,
      slotHours,
      referenceTime: billingEnd,
    });
    const foodTotal = await getFoodTotal(connection, bookingId);

    return {
      ...calculateBreakdown({
        minutes: sessionClock.minutes,
        slotCount: slotUsage.billableSlots,
        pricePerHour: booking.price_per_hour,
        foodTotal,
        loyaltyPoints: booking.loyalty_points,
        loyaltyApplied: booking.loyalty_amount,
        capturedAmount: booking.captured_amount,
        useLoyalty: true,
        ...buildFeeBreakdownOptions(booking),
      }),
      bookedSlots: slotUsage.totalBookedSlots,
      billableSlots: slotUsage.billableSlots,
      futureSlots: slotUsage.futureSlots,
    };
  });
}

async function extendBookingById(connection, bookingId) {
  await connection.query("SELECT booking_id FROM booking WHERE booking_id = ? LIMIT 1 FOR UPDATE", [bookingId]);
  const [[slotData]] = await connection.query(
    `
      SELECT
        bs.hour AS last_hour,
        b.business_id,
        bs.pc_id,
        bs.booking_date,
        b.status,
        b.user_id
      FROM booking_slots bs
      JOIN booking b ON b.booking_id = bs.booking_id
      WHERE bs.booking_id = ?
      ORDER BY bs.hour DESC
      LIMIT 1
    `,
    [bookingId]
  );

  if (!slotData || slotData.last_hour === null) {
    const error = new Error("No slots found");
    error.statusCode = 400;
    throw error;
  }

  const bookingStatus = String(slotData.status || "").toLowerCase();
  if (!["confirmed", "running", "session_over"].includes(bookingStatus)) {
    const error = new Error("This booking can no longer be extended");
    error.statusCode = 400;
    throw error;
  }

  const nextHour = Number(slotData.last_hour) + 1;

  if (nextHour >= CLOSE_HOUR) {
    const error = new Error("Cafe closing time reached");
    error.statusCode = 400;
    throw error;
  }

  await connection.query("SELECT pc_id FROM pc WHERE pc_id = ? LIMIT 1 FOR UPDATE", [slotData.pc_id]);

  const [existing] = await connection.query(
    `
      SELECT bs.id
      FROM booking_slots bs
      JOIN booking b ON b.booking_id = bs.booking_id
      WHERE bs.pc_id = ?
      AND bs.booking_date = ?
      AND bs.hour = ?
      AND b.status NOT IN ('cancelled', 'closed', 'completed')
      AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
      LIMIT 1
    `,
    [slotData.pc_id, slotData.booking_date, nextHour]
  );

  if (existing.length) {
    const error = new Error("The next slot is already booked");
    error.statusCode = 400;
    throw error;
  }

  const [heldOpenings] = await connection.query(
    `SELECT opening_id FROM station_waitlist_openings
     WHERE pc_id = ? AND booking_date = ? AND start_hour <= ? AND end_hour > ?
       AND status IN ('open', 'offered') LIMIT 1 FOR UPDATE`,
    [slotData.pc_id, slotData.booking_date, nextHour, nextHour]
  );
  if (heldOpenings.length) {
    const error = new Error("The next slot is being held for a waitlist customer.");
    error.statusCode = 409;
    throw error;
  }

  const overlappingUserBooking = await findUserBookingConflict(connection, {
    userId: slotData.user_id,
    bookingDate: slotData.booking_date,
    slotHours: [nextHour],
    excludeBookingId: bookingId,
  });

  if (overlappingUserBooking) {
    const error = new Error(buildUserBookingConflictMessage(overlappingUserBooking));
    error.statusCode = 400;
    throw error;
  }

  await connection.query(
    `
      INSERT INTO booking_slots (booking_id, business_id, pc_id, booking_date, hour)
      VALUES (?, ?, ?, ?, ?)
    `,
    [bookingId, Number(slotData.business_id || 1), slotData.pc_id, slotData.booking_date, nextHour]
  );

  const [[pc]] = await connection.query(
    "SELECT price_per_hour FROM pc WHERE pc_id = ? LIMIT 1",
    [slotData.pc_id]
  );

  const hourlyRate = roundCurrency(pc?.price_per_hour || 0);

  await connection.query("UPDATE booking SET total_amount = total_amount + ? WHERE booking_id = ?", [
    hourlyRate,
    bookingId,
  ]);

  await connection.query(
    `
      UPDATE payments
      SET
        amount = amount + ?,
        status = CASE
          WHEN status IN ('paid', 'advance_paid', 'partially_paid') THEN status
          ELSE 'pending'
        END,
        gateway_status = CASE
          WHEN status IN ('paid', 'advance_paid', 'partially_paid') THEN gateway_status
          ELSE 'awaiting_settlement'
        END,
        payment_notes = CASE
          WHEN payment_notes IS NULL OR payment_notes = ''
            THEN 'Session extended. Additional charge deferred to session checkout.'
          ELSE CONCAT(
            payment_notes,
            ' | Session extended. Additional charge deferred to session checkout.'
          )
        END
      WHERE booking_id = ?
    `,
    [hourlyRate, bookingId]
  );

  return {
    added_slot: nextHour,
    added_amount: hourlyRate,
    payment_deferred: true,
  };
}

async function settleBookingById(
  connection,
  {
    bookingId,
    overrideAmount = null,
    useLoyalty = false,
    paymentMethod = "cash",
    paymentReference = null,
    notes = null,
    customerInitiated = false,
  }
) {
  const booking = await getBookingSettlementSnapshot(connection, bookingId);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  if (booking.status === "closed") {
    const error = new Error("Already settled");
    error.statusCode = 400;
    throw error;
  }

  if (booking.status !== "session_over") {
    const error = new Error("Session can be settled only after it ends");
    error.statusCode = 400;
    throw error;
  }

  const latestBooking = booking;
  const slotHours = await getBookingSlotHours(connection, bookingId);

  if (!slotHours.length) {
    const error = new Error("Booked slots not found");
    error.statusCode = 404;
    throw error;
  }

  const sessionClock = getSessionClock({
    bookingDate: latestBooking.booking_date,
    slotHours,
    startTime: latestBooking.start_time,
    endTime: latestBooking.actual_end_time,
    fallbackEndTime: new Date(),
  });
  const billingEnd = sessionClock.effectiveEndTime || new Date();
  const slotUsage = summarizeSlotUsage({
    bookingDate: latestBooking.booking_date,
    slotHours,
    referenceTime: billingEnd,
  });

  if (!slotUsage.billableSlots) {
    const error = new Error("No started booking slot is available for settlement");
    error.statusCode = 400;
    throw error;
  }

  const foodTotal = await getFoodTotal(connection, bookingId);

  const breakdown = calculateBreakdown({
    minutes: sessionClock.minutes,
    slotCount: slotUsage.billableSlots,
    pricePerHour: latestBooking.price_per_hour,
    foodTotal,
    loyaltyPoints: latestBooking.loyalty_points,
    loyaltyApplied: latestBooking.loyalty_amount,
    capturedAmount: latestBooking.captured_amount,
    overrideAmount,
    useLoyalty: Boolean(useLoyalty),
    ...buildFeeBreakdownOptions(latestBooking),
  });

  if (customerInitiated && breakdown.amountDue > 0) {
    const error = new Error(
      "Payment has not been captured. Complete the verified online checkout or ask staff to record a counter payment."
    );
    error.statusCode = 409;
    throw error;
  }

  await connection.query(
    `
      UPDATE users
      SET loyalty_points = GREATEST(0, loyalty_points - ?) + ?
      WHERE uid = ?
    `,
    [breakdown.loyaltyUsed, breakdown.earnedLoyalty, latestBooking.user_id]
  );

  if (breakdown.loyaltyUsed > 0) {
    await recordLoyaltyActivity(connection, {
      userId: latestBooking.user_id,
      bookingId,
      points: -Math.floor(breakdown.loyaltyUsed),
      transactionType: "redeemed",
      note: `Redeemed against booking #${bookingId}`,
    });
  }

  if (breakdown.earnedLoyalty > 0) {
    await recordLoyaltyActivity(connection, {
      userId: latestBooking.user_id,
      bookingId,
      points: breakdown.earnedLoyalty,
      transactionType: "earned",
      note: `Earned from booking #${bookingId}`,
    });
  }

  await connection.query(
    `
      UPDATE orders
      SET status = 'closed'
      WHERE booking_id = ?
      AND status IN ('active', 'preparing', 'completed', 'delivered')
    `,
    [bookingId]
  );

  const [existingPayment] = await connection.query(
    `
      SELECT
        payment_id,
        final_amount,
        customer_final_amount,
        payment_method,
        payment_reference
      FROM payments
      WHERE booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  if (slotUsage.futureSlotHours.length) {
    await connection.query(
      `
        DELETE FROM booking_slots
        WHERE booking_id = ?
        AND hour IN (?)
      `,
      [bookingId, slotUsage.futureSlotHours]
    );
  }

  const remainingBalance = breakdown.amountDue;
  const resolvedPaymentMethod =
    remainingBalance > 0 ? paymentMethod : existingPayment[0]?.payment_method || paymentMethod;
  const resolvedPaymentReference =
    remainingBalance > 0
      ? paymentReference
      : existingPayment[0]?.payment_reference || paymentReference;

  let paymentId = existingPayment[0]?.payment_id || null;
  if (existingPayment.length) {
    await connection.query(
      `
        UPDATE payments
        SET
          amount = ?,
          final_amount = ?,
          customer_final_amount = ?,
          captured_amount = ?,
          status = 'paid',
          payment_method = ?,
          payment_reference = ?,
          gateway_status = 'captured',
          discount_amount = ?,
          loyalty_amount = ?,
          convenience_fee = ?,
          commission_rate = ?,
          platform_commission = ?,
          seller_net_amount = ?,
          payment_notes = ?,
          paid_at = NOW()
        WHERE booking_id = ?
      `,
      [
        breakdown.subtotal,
        breakdown.finalAmount,
        breakdown.customerFinalAmount,
        breakdown.customerFinalAmount,
        resolvedPaymentMethod,
        resolvedPaymentReference,
        breakdown.totalLoyaltyUsed,
        breakdown.totalLoyaltyUsed,
        breakdown.convenienceFee,
        breakdown.commissionRate,
        breakdown.platformCommission,
        breakdown.sellerNetAmount,
        notes,
        bookingId,
      ]
    );
  } else {
    const [paymentInsert] = await connection.query(
      `
        INSERT INTO payments (
          business_id,
          booking_id,
          amount,
          final_amount,
          customer_final_amount,
          captured_amount,
          status,
          payment_method,
          payment_reference,
          gateway_status,
          discount_amount,
          loyalty_amount,
          convenience_fee,
          commission_rate,
          platform_commission,
          seller_net_amount,
          payment_notes,
          paid_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?, 'captured', ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        Number(latestBooking.business_id || 1),
        bookingId,
        breakdown.subtotal,
        breakdown.finalAmount,
        breakdown.customerFinalAmount,
        breakdown.customerFinalAmount,
        paymentMethod,
        paymentReference,
        breakdown.totalLoyaltyUsed,
        breakdown.totalLoyaltyUsed,
        breakdown.convenienceFee,
        breakdown.commissionRate,
        breakdown.platformCommission,
        breakdown.sellerNetAmount,
        notes,
      ]
    );
    paymentId = paymentInsert.insertId;
    if (paymentId) {
      await connection.query(
        `UPDATE payments SET receipt_number = CONCAT('GG-PAY-', LPAD(payment_id, 10, '0')) WHERE payment_id = ? AND (receipt_number IS NULL OR receipt_number = '')`,
        [paymentId]
      );
    }
  }

  if (remainingBalance > 0 && paymentId) {
    await recordPaymentTransaction(connection, {
      businessId: latestBooking.business_id,
      paymentId,
      bookingId,
      kind: "capture",
      channel: resolvedPaymentMethod,
      amount: remainingBalance,
      reference: resolvedPaymentReference,
      sourceType: "booking_settlement",
      sourceId: String(bookingId),
      note: "Counter payment recorded while settling the booking.",
    });
  }

  await connection.query(
    `
      UPDATE booking
      SET
        status = 'closed',
        actual_end_time = COALESCE(actual_end_time, NOW()),
        total_amount = ?
      WHERE booking_id = ?
    `,
    [breakdown.gamingCost, bookingId]
  );

  await connection.query("UPDATE pc SET status = 'active' WHERE pc_id = ?", [latestBooking.pc_id]);

  const [billInsert] = await connection.query(
    `
      INSERT INTO bills (
        business_id,
        booking_id,
        user_id,
        pc_id,
        gaming_cost,
        food_cost,
        subtotal,
        convenience_fee,
        loyalty_used,
        final_amount,
        customer_final_amount,
        commission_rate,
        platform_commission,
        seller_net_amount,
        earned_loyalty
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      Number(latestBooking.business_id || 1),
      bookingId,
      latestBooking.user_id,
      latestBooking.pc_id,
      breakdown.gamingCost,
      breakdown.foodCost,
      breakdown.subtotal,
      breakdown.convenienceFee,
      breakdown.totalLoyaltyUsed,
      breakdown.finalAmount,
      breakdown.customerFinalAmount,
      breakdown.commissionRate,
      breakdown.platformCommission,
      breakdown.sellerNetAmount,
      breakdown.earnedLoyalty,
    ]
  );
  if (billInsert.insertId) {
    await connection.query(
      `UPDATE bills SET receipt_number = CONCAT('GG-BILL-', LPAD(bill_id, 10, '0')) WHERE bill_id = ? AND (receipt_number IS NULL OR receipt_number = '')`,
      [billInsert.insertId]
    );
  }

  await createCustomerNotification(connection, {
    userId: latestBooking.user_id,
    category: "payments",
    eventType: "bill_settled",
    title: "Your bill is ready",
    message: "Your session bill is finalized. Open it to review the receipt and payment details.",
    deepLink: billInsert.insertId
      ? `/bills/${Number(billInsert.insertId)}`
      : `/booking/${Number(bookingId)}`,
    entityType: "bill",
    entityId: billInsert.insertId || bookingId,
    idempotencyKey: `booking:${Number(bookingId)}:bill-settled`,
  });

  await awardSettledVisit(connection, {
    userId: Number(latestBooking.user_id),
    bookingId: Number(bookingId),
    visitDate: latestBooking.booking_date,
    eligibleAmount: breakdown.subtotal,
  });

  return {
    ...breakdown,
    bookedSlots: slotUsage.totalBookedSlots,
    billableSlots: slotUsage.billableSlots,
    releasedSlots: slotUsage.futureSlots,
  };
}

// FETCH BOOKINGS FOR ADMIN
router.get(
  "/admin/all",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BOOKINGS_READ),
  async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const rows = await query(
      `
        SELECT
          b.booking_id,
          u.name,
          pc.specs,
          b.booking_date,
          b.status,
          b.total_amount,
          MIN(COALESCE(p.paid_at, p.created_at)) AS booked_at,
          MIN(bs.hour) AS start_hour,
          MAX(bs.hour) AS end_hour,
          COUNT(bs.hour) AS total_hours
        FROM booking b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        LEFT JOIN booking_slots bs ON bs.booking_id = b.booking_id
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        WHERE b.business_id = ?
        GROUP BY
          b.booking_id,
          u.name,
          pc.specs,
          b.booking_date,
          b.status,
          b.total_amount
        ORDER BY b.booking_id DESC
      `,
      [businessId]
    );

    res.json(
      rows.map((row) => ({
        ...row,
        total_amount: roundCurrency(row.total_amount || 0),
        time_range: formatTimeRange(row.start_hour, row.end_hour),
      }))
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// CREATE BOOKING
router.post("/create", auth, paymentAttemptLimiter, async (req, res) => {
  const {
    user_id: rawUserId,
    pc_id: pcId,
    booking_date: bookingDate,
    slots,
    payment_method: rawPaymentMethod,
    payment_reference: rawPaymentReference,
    use_loyalty: rawUseLoyalty,
    waitlist_offer_id: rawWaitlistOfferId,
  } = req.body;
  const userId = getAuthenticatedUserId(req);
  const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
  const paymentReference = normalizePaymentReference(rawPaymentReference);
  const useLoyalty = normalizeBoolean(rawUseLoyalty);
  const idempotencyKey = String(req.headers?.["idempotency-key"] || "").trim();

  if (rawUserId) {
    try {
      ensureSameUser(rawUserId, userId);
    } catch (error) {
      return res.status(error.statusCode || 403).json({ error: error.message });
    }
  }

  if (!userId) {
    return res.status(400).json({ error: "User id required" });
  }

  if (!pcId) {
    return res.status(400).json({ error: "PC id required" });
  }

  const uniqueSlots = normalizeSlots(slots);

  if (!uniqueSlots.length) {
    return res.status(400).json({ error: "No slots selected" });
  }

  const selectedDate = new Date(`${bookingDate}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) {
    return res.status(400).json({ error: "Invalid booking date" });
  }

  const today = formatDate(new Date());
  if (bookingDate < today) {
    return res.status(400).json({ error: "Past dates cannot be booked" });
  }

  for (const hour of uniqueSlots) {
    if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) {
      return res.status(400).json({ error: "Invalid cafe timing" });
    }
  }

  if (!paymentMethod) {
    return res.status(400).json({ error: "Payment method required" });
  }

  if (paymentMethod === "razorpay" && (!idempotencyKey || idempotencyKey.length > 100)) {
    return res.status(400).json({ error: "A valid Idempotency-Key is required for online payment." });
  }
  if (paymentMethod === "razorpay" && !razorpay.isOnlineReady()) {
    return res.status(503).json({ error: "Online payments are not configured with Razorpay keys and a webhook secret." });
  }

  try {
    const response = await withTransaction(async (connection) => {
      if (paymentMethod === "razorpay") {
        const [existingAttempts] = await connection.query(
          `
            SELECT attempt_id, booking_id, payment_id, amount_paise, currency,
              provider_order_id, status, checkout_expires_at
            FROM payment_attempts
            WHERE user_id = ? AND idempotency_key = ?
            LIMIT 1
            FOR UPDATE
          `,
          [userId, idempotencyKey]
        );
        if (existingAttempts[0]) {
          return { existing_attempt: existingAttempts[0] };
        }
      }

      const [[pc]] = await connection.query(
        `
          SELECT
            pc.pc_id,
            pc.business_id,
            pc.price_per_hour,
            pc.status,
            COALESCE(bus.commission_rate, 0) AS commission_rate,
            COALESCE(bus.convenience_fee_flat, 0) AS convenience_fee_flat,
            COALESCE(bus.convenience_fee_rate, 0) AS convenience_fee_rate
          FROM pc
          LEFT JOIN businesses bus ON bus.business_id = pc.business_id
          WHERE pc.pc_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [pcId]
      );

      const [[user]] = await connection.query(
        "SELECT uid, loyalty_points FROM users WHERE uid = ? LIMIT 1",
        [userId]
      );

      if (!pc) {
        const error = new Error("PC not found");
        error.statusCode = 404;
        throw error;
      }

      if (String(pc.status || "").toLowerCase() === "inactive") {
        const error = new Error("This PC is disabled by admin and cannot be booked right now");
        error.statusCode = 400;
        throw error;
      }

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const waitlistClaim = rawWaitlistOfferId
        ? await claimOffer(connection, {
            offerId: Number(rawWaitlistOfferId),
            userId,
            pcId,
            bookingDate,
            slots: uniqueSlots,
          })
        : null;

      const overlappingUserBooking = await findUserBookingConflict(connection, {
        userId,
        bookingDate,
        slotHours: uniqueSlots,
      });

      if (overlappingUserBooking) {
        const error = new Error(buildUserBookingConflictMessage(overlappingUserBooking));
        error.statusCode = 400;
        throw error;
      }

      const [conflicts] = await connection.query(
        `
          SELECT bs.hour
          FROM booking_slots bs
          JOIN booking b ON b.booking_id = bs.booking_id
          WHERE bs.pc_id = ?
          AND bs.booking_date = ?
          AND bs.hour IN (?)
          AND b.status NOT IN ('cancelled', 'closed', 'completed')
          AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
        `,
        [pcId, bookingDate, uniqueSlots]
      );

      if (conflicts.length) {
        const error = new Error("Slot already booked");
        error.statusCode = 400;
        throw error;
      }

      const [heldOpenings] = await connection.query(
        `SELECT opening_id FROM station_waitlist_openings
         WHERE pc_id = ? AND booking_date = ? AND start_hour < ? AND end_hour > ?
           AND status IN ('open', 'offered')
           AND (? IS NULL OR opening_id <> ?)
         LIMIT 1 FOR UPDATE`,
        [pcId, bookingDate, uniqueSlots[uniqueSlots.length - 1] + 1, uniqueSlots[0], waitlistClaim?.openingId ?? null, waitlistClaim?.openingId ?? null]
      );
      if (heldOpenings.length) {
        const error = new Error("These hours are being held for a waitlist customer. Please refresh availability.");
        error.statusCode = 409;
        throw error;
      }

      const totalAmount = roundCurrency(uniqueSlots.length * toNumber(pc.price_per_hour));
      const bookingBreakdown = calculateBreakdown({
        gamingCost: totalAmount,
        loyaltyPoints: user.loyalty_points,
        useLoyalty,
        ...buildFeeBreakdownOptions(pc),
      });
      const loyaltyUsed = bookingBreakdown.loyaltyUsed;
      const amountToCapture = bookingBreakdown.customerFinalAmount;
      const onlinePaymentRequired = paymentMethod === "razorpay" && amountToCapture > 0;
      const paymentExpiresAt = onlinePaymentRequired ? getCheckoutExpiry() : null;
      const attemptId = onlinePaymentRequired ? randomUUID() : null;
      const firstHour = uniqueSlots[0];
      const bookingStartTime = `${bookingDate} ${String(firstHour).padStart(2, "0")}:00:00`;

      const [insertResult] = await connection.query(
        `
          INSERT INTO booking (
            business_id,
            user_id,
            pc_id,
            booking_date,
            total_amount,
            status,
            start_time,
            payment_expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [Number(pc.business_id || 1), userId, pcId, bookingDate, totalAmount,
          onlinePaymentRequired ? "pending_payment" : "confirmed", bookingStartTime, paymentExpiresAt]
      );

      const bookingId = insertResult.insertId;
      const businessId = Number(pc.business_id || 1);
      const slotValues = uniqueSlots.map((hour) => [bookingId, businessId, pcId, bookingDate, hour]);

      await connection.query(
        "INSERT INTO booking_slots (booking_id, business_id, pc_id, booking_date, hour) VALUES ?",
        [slotValues]
      );

      const [paymentInsert] = await connection.query(
        `
          INSERT INTO payments (
            business_id,
            booking_id,
            amount,
            final_amount,
            customer_final_amount,
            captured_amount,
            status,
            payment_method,
            payment_reference,
            gateway_status,
            discount_amount,
            loyalty_amount,
            convenience_fee,
            commission_rate,
            platform_commission,
            seller_net_amount,
            payment_notes,
            paid_at
          )
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          businessId,
          bookingId,
          totalAmount,
          bookingBreakdown.finalAmount,
          bookingBreakdown.customerFinalAmount,
          onlinePaymentRequired || amountToCapture > 0 ? "pending" : "advance_paid",
          onlinePaymentRequired ? "razorpay" : paymentMethod,
          null,
          onlinePaymentRequired || amountToCapture > 0 ? "awaiting_settlement" : "loyalty_covered",
          loyaltyUsed,
          loyaltyUsed,
          bookingBreakdown.convenienceFee,
          bookingBreakdown.commissionRate,
          bookingBreakdown.platformCommission,
          bookingBreakdown.sellerNetAmount,
          amountToCapture > 0
            ? onlinePaymentRequired
              ? "Awaiting verified online advance payment"
              : "Advance is due at counter"
            : "Booking fully covered by loyalty points",
          amountToCapture > 0 ? null : new Date(),
        ]
      );
      await connection.query(
        `UPDATE payments SET receipt_number = CONCAT('GG-PAY-', LPAD(payment_id, 10, '0')) WHERE payment_id = ? AND (receipt_number IS NULL OR receipt_number = '')`,
        [paymentInsert.insertId]
      );

      if (onlinePaymentRequired) {
        await connection.query(
          `
            INSERT INTO payment_attempts (
              attempt_id, user_id, booking_id, payment_id, purpose, idempotency_key,
              amount_paise, currency, provider, status, checkout_expires_at
            ) VALUES (?, ?, ?, ?, 'booking_advance', ?, ?, ?, 'razorpay', 'creating_order', ?)
          `,
          [attemptId, userId, bookingId, paymentInsert.insertId, idempotencyKey,
            Math.round(amountToCapture * 100), razorpay.getConfiguration().currency,
            paymentExpiresAt]
        );
      }

      if (loyaltyUsed > 0) {
        await connection.query(
          `
            UPDATE users
            SET loyalty_points = GREATEST(0, loyalty_points - ?)
            WHERE uid = ?
          `,
          [Math.floor(loyaltyUsed), userId]
        );

        await recordLoyaltyActivity(connection, {
          userId,
          bookingId,
          points: -Math.floor(loyaltyUsed),
          transactionType: "redeemed",
          note: `Redeemed against booking #${bookingId}`,
        });
      }

      if (waitlistClaim) {
        await markOfferClaimed(connection, waitlistClaim, bookingId);
      }

      if (!onlinePaymentRequired) {
        await createCustomerNotification(connection, {
          userId,
          category: "booking_reminders",
          eventType: "booking_confirmed",
          title: "Booking confirmed",
          message: "Your gaming session is booked. Open your booking to review the details.",
          deepLink: `/booking/${Number(bookingId)}`,
          entityType: "booking",
          entityId: bookingId,
          idempotencyKey: `booking:${Number(bookingId)}:confirmed`,
        });
      }

      return {
        booking_id: bookingId,
        total_amount: totalAmount,
        amount_paid: amountToCapture,
        loyalty_used: loyaltyUsed,
        convenience_fee: bookingBreakdown.convenienceFee,
        customer_final_amount: bookingBreakdown.customerFinalAmount,
        remaining_loyalty: Math.max(0, Math.floor(toNumber(user.loyalty_points) - loyaltyUsed)),
        start_time: bookingStartTime,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        payment_status: onlinePaymentRequired || amountToCapture > 0 ? "pending" : "advance_paid",
        payment_expires_at: paymentExpiresAt,
        payment_attempt_id: attemptId,
        payment_id: paymentInsert.insertId,
        pending_payment: onlinePaymentRequired,
      };
    });

    if (response.existing_attempt) {
      const attempt = response.existing_attempt;
      if (attempt.status !== "pending" || !attempt.provider_order_id) {
        return res.status(409).json({ error: "This payment request is still being processed or is no longer available." });
      }
      return res.json({
        booking_id: Number(attempt.booking_id),
        amount_paid: Number(attempt.amount_paise) / 100,
        payment_status: "pending",
        pending_payment: true,
        ...createExistingCheckoutLink({ req, attempt }),
      });
    }

    if (response.pending_payment) {
      const attempt = {
        attempt_id: response.payment_attempt_id,
        booking_id: response.booking_id,
        amount_paise: Math.round(response.amount_paid * 100),
        currency: razorpay.getConfiguration().currency,
        checkout_expires_at: response.payment_expires_at,
      };
      try {
        const checkout = await createProviderOrder({ req, attempt });
        return res.status(201).json({
          message: "Payment is pending. Complete the secure checkout to confirm the booking.",
          ...response,
          ...checkout,
          payment_reference: null,
        });
      } catch (error) {
        await withTransaction(async (connection) => {
          const [[payment]] = await connection.query(
            `SELECT loyalty_amount FROM payments WHERE payment_id = ? LIMIT 1`,
            [response.payment_id]
          );
          await connection.query(
            `UPDATE payment_attempts SET status = 'failed', failure_code = 'order_creation_failed', failure_description = 'Razorpay could not create the order.' WHERE attempt_id = ? AND status = 'creating_order'`,
            [response.payment_attempt_id]
          );
          await connection.query(
            `UPDATE booking SET status = 'cancelled', payment_expires_at = NULL WHERE booking_id = ? AND status = 'pending_payment'`,
            [response.booking_id]
          );
          await createOpeningsFromCancelledBooking(connection, response.booking_id);
          await connection.query("DELETE FROM booking_slots WHERE booking_id = ?", [response.booking_id]);
          const loyaltyRefund = Math.floor(Number(payment?.loyalty_amount || 0));
          if (loyaltyRefund > 0) {
            await connection.query(
              `UPDATE users SET loyalty_points = loyalty_points + ? WHERE uid = ?`,
              [loyaltyRefund, userId]
            );
            await connection.query(
              `INSERT INTO loyalty_transactions (user_id, booking_id, points, transaction_type, note) VALUES (?, ?, ?, 'refund', ?)`,
              [userId, response.booking_id, loyaltyRefund, `Refunded booking #${response.booking_id} after checkout setup failed`]
            );
          }
          await connection.query(
            `UPDATE payments SET status = 'failed', gateway_status = 'order_creation_failed' WHERE payment_id = ? AND status = 'pending'`,
            [response.payment_id]
          );
        }).catch(() => {});
        return res.status(error.statusCode || 502).json({ error: "Could not start secure checkout. Please try booking again." });
      }
    }

    res.json({
      message: response.amount_paid > 0
        ? "Booking confirmed. Payment is due at the counter."
        : "Booking confirmed with loyalty points.",
      ...response,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY" && paymentMethod === "razorpay") {
      try {
        const [attempts] = await query(
          `SELECT attempt_id, booking_id, amount_paise, currency, provider_order_id, status, checkout_expires_at FROM payment_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
          [userId, idempotencyKey]
        );
        const attempt = attempts[0];
        if (attempt?.status === "pending" && attempt.provider_order_id &&
            new Date(attempt.checkout_expires_at).getTime() > Date.now()) {
          return res.json({
            booking_id: Number(attempt.booking_id),
            amount_paid: Number(attempt.amount_paise) / 100,
            payment_status: "pending",
            pending_payment: true,
            ...createExistingCheckoutLink({ req, attempt }),
          });
        }
        return res.status(409).json({ error: "This payment request is already being processed." });
      } catch (_) {
        // Return the original database error if the idempotency record cannot be read.
      }
    }
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// EXTEND SESSION
router.post("/extend", auth, paymentAttemptLimiter, async (req, res) => {
  const { booking_id: bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "booking_id required" });
  }

  try {
    const response = await withTransaction(async (connection) => {
      await ensureUserOwnsBooking(connection, getAuthenticatedUserId(req), bookingId);
      return extendBookingById(connection, bookingId);
    });

    res.json({
      message: "Session extended",
      ...response,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post(
  "/admin/extend",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
    const { booking_id: bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "booking_id required" });
    }

    try {
      const response = await withTransaction(async (connection) => {
        const booking = await getBookingSettlementSnapshot(connection, bookingId);

        if (!booking) {
          const error = new Error("Booking not found");
          error.statusCode = 404;
          throw error;
        }

        await requireAdminBusinessAccess(req.admin, Number(booking.business_id || 0));
        return extendBookingById(connection, bookingId);
      });

      res.json({
        message: "Session extended",
        ...response,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

// LIVE MINUTE BILL
router.get("/live-minute-bill/:id", auth, async (req, res) => {
  try {
    await ensureUserOwnsBooking(null, getAuthenticatedUserId(req), Number(req.params.id));
    const breakdown = await buildLiveBreakdown(Number(req.params.id));

    res.json({
      session_minutes: breakdown.minutes,
      booked_slots: breakdown.bookedSlots,
      billable_slots: breakdown.billableSlots,
      future_slots: breakdown.futureSlots,
      gaming_cost: breakdown.gamingCost,
      food_total: breakdown.foodCost,
      subtotal: breakdown.subtotal,
      convenience_fee: breakdown.convenienceFee,
      customer_subtotal: breakdown.customerSubtotal,
      captured_amount: breakdown.capturedAmount,
      open_balance_before_loyalty: breakdown.openBalance,
      loyalty_discount: breakdown.totalLoyaltyUsed,
      service_final_total: breakdown.finalAmount,
      final_total: breakdown.customerFinalAmount,
      amount_due: breakdown.amountDue,
      loyalty_points: breakdown.loyaltyPoints,
      earned_loyalty_preview: breakdown.earnedLoyalty,
      commission_rate: breakdown.commissionRate,
      platform_commission: breakdown.platformCommission,
      seller_net_amount: breakdown.sellerNetAmount,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// SETTLE BILL
router.post("/settle", auth, paymentAttemptLimiter, async (req, res) => {
  const {
    booking_id: bookingId,
    override_amount: overrideAmount,
    use_loyalty: useLoyalty = false,
    payment_method: paymentMethod = "cash",
    payment_reference: paymentReference = null,
    notes = null,
  } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "booking_id required" });
  }

  try {
    const settlement = await withTransaction(async (connection) => {
      await ensureUserOwnsBooking(connection, getAuthenticatedUserId(req), bookingId);
      return settleBookingById(connection, {
        bookingId,
        overrideAmount,
        useLoyalty,
        paymentMethod,
        paymentReference,
        notes,
        customerInitiated: true,
      });
    });

    res.json({
      subtotal: settlement.subtotal,
      convenience_fee: settlement.convenienceFee,
      customer_subtotal: settlement.customerSubtotal,
      service_final_amount: settlement.finalAmount,
      final_amount: settlement.customerFinalAmount,
      gaming_cost: settlement.gamingCost,
      food_total: settlement.foodCost,
      captured_amount: settlement.capturedAmount,
      open_balance_before_loyalty: settlement.openBalance,
      amount_due: settlement.amountDue,
      booked_slots: settlement.bookedSlots,
      billable_slots: settlement.billableSlots,
      released_slots: settlement.releasedSlots,
      loyalty_used: settlement.totalLoyaltyUsed,
      earned_loyalty: settlement.earnedLoyalty,
      commission_rate: settlement.commissionRate,
      platform_commission: settlement.platformCommission,
      seller_net_amount: settlement.sellerNetAmount,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post(
  "/admin/settle",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
  async (req, res) => {
    const {
      booking_id: bookingId,
      override_amount: overrideAmount,
      use_loyalty: useLoyalty = false,
      payment_method: paymentMethod = "cash",
      payment_reference: paymentReference = null,
      notes = null,
    } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "booking_id required" });
    }

    try {
      const settlement = await withTransaction(async (connection) => {
        const booking = await getBookingSettlementSnapshot(connection, bookingId);

        if (!booking) {
          const error = new Error("Booking not found");
          error.statusCode = 404;
          throw error;
        }

        await requireAdminBusinessAccess(req.admin, Number(booking.business_id || 0));
        return settleBookingById(connection, {
          bookingId,
          overrideAmount,
          useLoyalty,
          paymentMethod,
          paymentReference,
          notes,
        });
      });

      res.json({
        subtotal: settlement.subtotal,
        convenience_fee: settlement.convenienceFee,
        customer_subtotal: settlement.customerSubtotal,
        service_final_amount: settlement.finalAmount,
        final_amount: settlement.customerFinalAmount,
        gaming_cost: settlement.gamingCost,
        food_total: settlement.foodCost,
        captured_amount: settlement.capturedAmount,
        open_balance_before_loyalty: settlement.openBalance,
        amount_due: settlement.amountDue,
        booked_slots: settlement.bookedSlots,
        billable_slots: settlement.billableSlots,
        released_slots: settlement.releasedSlots,
        loyalty_used: settlement.totalLoyaltyUsed,
        earned_loyalty: settlement.earnedLoyalty,
        commission_rate: settlement.commissionRate,
        platform_commission: settlement.platformCommission,
        seller_net_amount: settlement.sellerNetAmount,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

// AVAILABLE SLOTS
router.get("/available-slots", auth, async (req, res) => {
  const { pc_id: pcId, date, user_id: rawUserId } = req.query;
  const userId = getAuthenticatedUserId(req);

  if (!pcId || !date) {
    return res.status(400).json({ error: "Missing params" });
  }

  try {
    if (rawUserId) {
      ensureSameUser(rawUserId, userId);
    }

    const pcRows = await query(
      `
        SELECT status
        FROM pc
        WHERE pc_id = ?
        LIMIT 1
      `,
      [pcId]
    );

    if (!pcRows.length) {
      return res.status(404).json({ error: "PC not found" });
    }

    if (String(pcRows[0].status || "").toLowerCase() === "inactive") {
      return res.status(400).json({
        error: "This PC is disabled by admin and cannot be booked right now",
      });
    }

    const rows = await query(
      `
        SELECT bs.hour
        FROM booking_slots bs
        JOIN booking b ON b.booking_id = bs.booking_id
        WHERE bs.pc_id = ?
        AND bs.booking_date = ?
        AND b.status NOT IN ('cancelled', 'closed', 'completed')
        AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
      `,
      [pcId, date]
    );

    const userRows =
      userId > 0
        ? await query(
            `
              SELECT DISTINCT bs.hour
              FROM booking b
              JOIN booking_slots bs ON bs.booking_id = b.booking_id
              WHERE b.user_id = ?
              AND b.booking_date = ?
              AND b.status NOT IN ('cancelled', 'closed', 'completed')
              AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
            `,
            [userId, date]
          )
        : [];

    const heldRows = await query(
      `SELECT DISTINCT op.start_hour, op.end_hour
       FROM station_waitlist_openings op
       WHERE op.pc_id = ? AND op.booking_date = ? AND op.status IN ('open', 'offered')`,
      [pcId, date]
    );

    const bookedHours = rows.map((row) => Number(row.hour));
    const userBookedHours = userRows.map((row) => Number(row.hour));
    const heldHours = heldRows.flatMap((row) => {
      const hours = [];
      for (let hour = Number(row.start_hour); hour < Number(row.end_hour); hour += 1) hours.push(hour);
      return hours;
    });
    const slots = [];

    for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
      slots.push({
        hour,
        available: !bookedHours.includes(hour) && !userBookedHours.includes(hour) && !heldHours.includes(hour),
        label: `${hour}:00 - ${hour + 1}:00`,
      });
    }

    res.json({ data: slots });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// CANCEL BOOKING
router.post("/cancel", auth, async (req, res) => {
  const { booking_id: bookingId, refund_amount: refundAmount } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "booking_id required" });
  }

  try {
    const refundRequest = await withTransaction(async (connection) => {
      const userId = getAuthenticatedUserId(req);
      await ensureUserOwnsBooking(connection, userId, bookingId);

      const [pendingAttempts] = await connection.query(
        `
          SELECT attempt_id
          FROM payment_attempts
          WHERE booking_id = ? AND status IN ('creating_order', 'pending')
          ORDER BY attempt_id ASC
          FOR UPDATE
        `,
        [bookingId]
      );

      const [[booking]] = await connection.query(
        "SELECT pc_id, user_id, status, start_time FROM booking WHERE booking_id = ? LIMIT 1 FOR UPDATE",
        [bookingId]
      );

      if (!booking) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }

      if (booking.status === "closed") {
        const error = new Error("Closed bookings cannot be cancelled");
        error.statusCode = 400;
        throw error;
      }

      if (booking.status === "cancelled") {
        const error = new Error("This booking is already cancelled.");
        error.statusCode = 409;
        throw error;
      }

      if (!["pending_payment", "confirmed"].includes(booking.status)) {
        const error = new Error("Only an upcoming booking can be cancelled here.");
        error.statusCode = 409;
        throw error;
      }

      const [paymentRows] = await connection.query(
        `SELECT payment_id, business_id, status, payment_method, payment_reference,
          captured_amount, refunded_amount, loyalty_amount
         FROM payments WHERE booking_id = ? LIMIT 1 FOR UPDATE`,
        [bookingId]
      );
      const payment = paymentRows[0] || null;
      let refundResult = null;

      if (["pending_payment", "confirmed"].includes(booking.status)) {
        if (pendingAttempts.length) {
          await connection.query(
            `UPDATE payment_attempts SET status = 'cancelled', failure_description = 'Booking cancelled by customer.' WHERE booking_id = ? AND status IN ('creating_order', 'pending')`,
            [bookingId]
          );
        }
        const capturedAmount = Number(payment?.captured_amount || 0);
        if (capturedAmount > 0) {
          if (booking.start_time && new Date(booking.start_time).getTime() <= Date.now()) {
            const error = new Error("Paid bookings can only be cancelled before the session starts. Contact the café team for help.");
            error.statusCode = 409;
            throw error;
          }
          const requestedAmount = refundAmount == null
            ? capturedAmount - Number(payment?.refunded_amount || 0)
            : Number(refundAmount);
          const loyaltyRestore = Math.floor(
            Number(payment?.loyalty_amount || 0) * requestedAmount / Math.max(capturedAmount, 0.01)
          );
          refundResult = await createRefundRequest(connection, {
            payment: { ...payment, booking_id: Number(bookingId), currency: razorpay.getConfiguration().currency },
            userId,
            amount: requestedAmount,
            reason: "Refund requested after booking cancellation.",
            requestKey: randomUUID(),
            loyaltyPointsToRestore: loyaltyRestore,
          });
          await connection.query(
            `UPDATE payments SET gateway_status = 'refund_requested' WHERE payment_id = ?`,
            [payment.payment_id]
          );
        } else {
          const loyaltyRefund = Math.floor(Number(payment?.loyalty_amount || 0));
          if (loyaltyRefund > 0) {
            await connection.query(
              `UPDATE users SET loyalty_points = loyalty_points + ? WHERE uid = ?`,
              [loyaltyRefund, booking.user_id]
            );
            await connection.query(
              `INSERT INTO loyalty_transactions (user_id, booking_id, points, transaction_type, note) VALUES (?, ?, ?, 'refund', ?)`,
              [booking.user_id, bookingId, loyaltyRefund, `Refunded cancelled booking #${bookingId}`]
            );
          }
        }
      }

      await createOpeningsFromCancelledBooking(connection, bookingId);
      await connection.query("DELETE FROM booking_slots WHERE booking_id = ?", [bookingId]);
      await connection.query("UPDATE booking SET status = 'cancelled', payment_expires_at = NULL WHERE booking_id = ?", [bookingId]);
      if (!payment || Number(payment.captured_amount || 0) <= 0) {
        await connection.query(
          `UPDATE payments SET status = 'cancelled', gateway_status = 'cancelled' WHERE booking_id = ?`,
          [bookingId]
        );
      }
      await connection.query("UPDATE pc SET status = 'active' WHERE pc_id = ?", [booking.pc_id]);
      return refundResult;
    });

    res.json({ success: true, refund_request: refundRequest, message: refundRequest?.outcome_message || "Booking cancelled." });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

registerBookingReadRoutes(router);

module.exports = router;
