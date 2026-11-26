const express = require("express");
const { randomBytes, randomUUID } = require("node:crypto");
const auth = require("../middleware/auth");
const { paymentAttemptLimiter } = require("../middleware/requestThrottle");
const razorpay = require("../utils/razorpay");
const { verifyCheckoutToken } = require("../utils/paymentCheckoutToken");
const { recordPaymentTransaction } = require("../utils/paymentLedger");
const { applyRefundOutcome, createRefundRequest } = require("../utils/paymentRefunds");
const { createCustomerNotification } = require("../utils/customerNotifications");
const { createOpeningsFromCancelledBooking } = require("../utils/stationWaitlist");
const { recordPaymentFailure } = require("../utils/operationalMetrics");

const {
  calculateBreakdown,
  getSessionClock,
  roundCurrency,
  summarizeSlotUsage,
} = require("../utils/billing");
const { query, withTransaction } = require("../utils/db");
const { ensureUserOwnsBooking } = require("../utils/userAccess");
const {
  createExistingCheckoutLink,
  createProviderOrder,
  getCheckoutExpiry,
} = require("../utils/paymentCheckout");

const router = express.Router();

const PAYMENT_METHODS = [
  {
    code: "cash",
    label: "Cash",
    description: "Take payment at the counter during checkout.",
  },
  {
    code: "razorpay",
    label: "Online payment",
    description: "Pay securely with UPI, cards, or supported wallets.",
  },
];

function getCheckoutPublicKey() {
  return razorpay.getConfiguration().keyId;
}

function escapeHtmlJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function newRequestNonce() {
  return randomBytes(16).toString("base64");
}

function checkoutPage({ keyId, attempt }) {
  const nonce = newRequestNonce();
  const config = escapeHtmlJson({
    key: keyId,
    order_id: attempt.provider_order_id,
    amount: Number(attempt.amount_paise),
    currency: attempt.currency,
  });
  return {
    nonce,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GameGrub secure checkout</title>
<style>body{font:16px system-ui,sans-serif;background:#0c141a;color:#f2f6f8;display:grid;min-height:100vh;place-items:center;margin:0}.card{max-width:420px;padding:28px;border:1px solid #30404a;border-radius:20px;background:#15212a;text-align:center}button{border:0;border-radius:12px;padding:14px 20px;background:#32d2a0;color:#0c141a;font-weight:700;font-size:16px;cursor:pointer}p{color:#b5c2c9;line-height:1.5}</style></head>
<body><main class="card"><h1>Secure payment</h1><p id="message">Your booking amount is fixed by GameGrub. Continue to Razorpay to pay securely.</p><button id="pay" type="button">Continue to payment</button></main>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script nonce="${nonce}">
const cfg=${config}; const token=new URLSearchParams(location.hash.slice(1)).get('token'); const message=document.getElementById('message'); const button=document.getElementById('pay');
async function send(path, body){try{return await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token})})}catch(_){return null}}
button.addEventListener('click',()=>{button.disabled=true;let paymentResponseReceived=false;const checkout=new Razorpay({key:cfg.key,order_id:cfg.order_id,amount:cfg.amount,currency:cfg.currency,name:'GameGrub',description:'GameGrub booking payment',handler:async response=>{paymentResponseReceived=true;message.textContent='Verifying payment with Razorpay…';const result=await send('/api/payment/checkout/verify',{order_id:response.razorpay_order_id,payment_id:response.razorpay_payment_id,signature:response.razorpay_signature});if(result&&result.ok){message.textContent='Payment verified. You can return to GameGrub.'}else{message.textContent='Payment is not confirmed yet. Return to GameGrub and check its status.'}button.textContent='Payment status updated'},modal:{ondismiss:async()=>{if(!paymentResponseReceived){await send('/api/payment/checkout/cancel',{});message.textContent='Checkout was cancelled. Return to GameGrub for the latest booking status.';button.disabled=true}}}});checkout.on('payment.failed',async event=>{await send('/api/payment/checkout/fail',{payment_id:event.error?.metadata?.payment_id,code:event.error?.code,description:event.error?.description});message.textContent='Payment failed. Return to GameGrub for the latest booking status.';button.disabled=true});checkout.open()});
</script></body></html>`,
  };
}

async function markAttemptCaptured(attemptId, payment) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT pa.*, b.status AS booking_status, b.payment_expires_at,
          b.business_id AS business_id
        FROM payment_attempts pa
        JOIN booking b ON b.booking_id = pa.booking_id
        WHERE pa.attempt_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [attemptId]
    );
    const attempt = rows[0];
    if (!attempt) {
      const error = new Error("Payment attempt not found.");
      error.statusCode = 404;
      throw error;
    }

    if (
      String(payment.order_id || "") !== String(attempt.provider_order_id || "") ||
      Number(payment.amount) !== Number(attempt.amount_paise) ||
      String(payment.currency || "").toUpperCase() !== String(attempt.currency).toUpperCase() ||
      String(payment.status || "").toLowerCase() !== "captured"
    ) {
      const error = new Error("Razorpay payment details do not match this order.");
      error.statusCode = 400;
      throw error;
    }

    if (attempt.status === "captured" && attempt.provider_payment_id === payment.id) {
      return { status: "captured", duplicate: true };
    }

    const expired = attempt.checkout_expires_at &&
      new Date(attempt.checkout_expires_at).getTime() <= Date.now();
    const invalidBookingState =
      (attempt.purpose === "booking_advance" &&
        (attempt.booking_status !== "pending_payment" || expired || attempt.payment_expires_at && new Date(attempt.payment_expires_at).getTime() <= Date.now())) ||
      (attempt.purpose === "session_settlement" &&
        !["running", "session_over"].includes(attempt.booking_status));

    if (invalidBookingState || ["cancelled", "failed", "expired"].includes(attempt.status)) {
      await connection.query(
        `UPDATE payment_attempts SET provider_payment_id = ?, status = 'captured_review' WHERE attempt_id = ?`,
        [payment.id, attemptId]
      );
      return { status: "captured_review", duplicate: false };
    }

    await connection.query(
      `
        UPDATE payment_attempts
        SET provider_payment_id = ?, status = 'captured', failure_code = NULL, failure_description = NULL
        WHERE attempt_id = ?
      `,
      [payment.id, attemptId]
    );

    const amount = Number(attempt.amount_paise) / 100;
    if (attempt.purpose === "booking_advance") {
      await connection.query(
        `
          UPDATE payments
          SET captured_amount = COALESCE(captured_amount, 0) + ?,
              status = 'advance_paid', payment_method = 'razorpay', payment_reference = ?,
              gateway_status = 'captured', paid_at = NOW()
          WHERE payment_id = ?
        `,
        [amount, payment.id, attempt.payment_id]
      );
      await connection.query(
        `UPDATE booking SET status = 'confirmed', payment_expires_at = NULL WHERE booking_id = ? AND status = 'pending_payment'`,
        [attempt.booking_id]
      );
    } else {
      await connection.query(
        `
          UPDATE payments
          SET captured_amount = COALESCE(captured_amount, 0) + ?,
              status = 'partially_paid', payment_method = 'razorpay', payment_reference = ?,
              gateway_status = 'captured', paid_at = NOW()
          WHERE payment_id = ?
        `,
        [amount, payment.id, attempt.payment_id]
      );
    }

    await recordPaymentTransaction(connection, {
      businessId: attempt.business_id,
      paymentId: attempt.payment_id,
      bookingId: attempt.booking_id,
      kind: "capture",
      channel: "razorpay",
      amount,
      reference: payment.id,
      sourceType: "payment_attempt",
      sourceId: attemptId,
      note: `Razorpay capture for ${attempt.purpose}.`,
    });

    await createCustomerNotification(connection, {
      userId: attempt.user_id,
      category: "payments",
      eventType: "payment_received",
      title: "Payment received",
      message: attempt.purpose === "booking_advance"
        ? "Your payment was verified and your booking is confirmed."
        : "Your session payment was verified. Open your booking for the updated bill.",
      deepLink: `/booking/${Number(attempt.booking_id)}`,
      entityType: "booking",
      entityId: attempt.booking_id,
      idempotencyKey: `payment-attempt:${attemptId}:captured`,
    });

    return { status: "captured", duplicate: false };
  });
}

async function markAttemptFailed(
  attemptId,
  { code = null, description = null, status = "failed", requestId = null } = {}
) {
  let failedAttempt = null;
  const marked = await withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT * FROM payment_attempts WHERE attempt_id = ? LIMIT 1 FOR UPDATE`,
      [attemptId]
    );
    const attempt = rows[0];
    if (!attempt || attempt.status === "captured") {
      return false;
    }

    const [updated] = await connection.query(
      `
        UPDATE payment_attempts
        SET status = ?, failure_code = ?, failure_description = ?
        WHERE attempt_id = ? AND status IN ('creating_order', 'pending')
      `,
      [status, String(code || "").slice(0, 100) || null, String(description || "").slice(0, 500) || null, attemptId]
    );
    if (!updated.affectedRows) {
      return false;
    }

    if (attempt.purpose === "booking_advance") {
      const [paymentRows] = await connection.query(
        `SELECT loyalty_amount FROM payments WHERE payment_id = ? LIMIT 1`,
        [attempt.payment_id]
      );
      const loyaltyRefund = Math.floor(Number(paymentRows[0]?.loyalty_amount || 0));
      if (loyaltyRefund > 0) {
        await connection.query(
          `UPDATE users SET loyalty_points = loyalty_points + ? WHERE uid = ?`,
          [loyaltyRefund, attempt.user_id]
        );
        await connection.query(
          `
            INSERT INTO loyalty_transactions (user_id, booking_id, points, transaction_type, note)
            VALUES (?, ?, ?, 'refund', ?)
          `,
          [attempt.user_id, attempt.booking_id, loyaltyRefund, `Refunded failed booking payment #${attempt.booking_id}`]
        );
      }
      await connection.query(
        `UPDATE booking SET status = 'cancelled', payment_expires_at = NULL WHERE booking_id = ? AND status = 'pending_payment'`,
        [attempt.booking_id]
      );
      await createOpeningsFromCancelledBooking(connection, attempt.booking_id);
      await connection.query("DELETE FROM booking_slots WHERE booking_id = ?", [attempt.booking_id]);
      await connection.query(
        `UPDATE payments SET status = ?, gateway_status = ? WHERE payment_id = ? AND status = 'pending'`,
        [status === "cancelled" ? "cancelled" : "failed", status, attempt.payment_id]
      );
    }
    if (status === "failed" || status === "expired") {
      await createCustomerNotification(connection, {
        userId: attempt.user_id,
        category: "payments",
        eventType: "payment_failed",
        title: "Payment was not completed",
        message: "Your payment could not be verified. Open the booking to review its status or try again.",
        deepLink: `/booking/${Number(attempt.booking_id)}`,
        entityType: "booking",
        entityId: attempt.booking_id,
        idempotencyKey: `payment-attempt:${attemptId}:failed`,
      });
      failedAttempt = {
        attemptId: attempt.attempt_id,
        bookingId: attempt.booking_id,
        paymentId: attempt.payment_id,
      };
    }
    return true;
  });

  if (marked && failedAttempt) {
    recordPaymentFailure({
      requestId,
      attemptId: failedAttempt.attemptId,
      bookingId: failedAttempt.bookingId,
      paymentId: failedAttempt.paymentId,
      failureCode: code,
      status,
    });
  }
  return marked;
}

function buildFeeBreakdownOptions(source = {}) {
  return {
    commissionRate: source.commission_rate || 0,
    convenienceFeeFlat: source.convenience_fee_flat || 0,
    convenienceFeeRate: source.convenience_fee_rate || 0,
  };
}

async function getPaymentSummary(bookingId) {
  const rows = await query(
    `
      SELECT
        b.booking_id,
        b.booking_date,
        b.status AS booking_status,
        b.start_time,
        b.actual_end_time,
        b.user_id,
        pc.price_per_hour,
        COALESCE(bus.commission_rate, 0) AS commission_rate,
        COALESCE(bus.convenience_fee_flat, 0) AS convenience_fee_flat,
        COALESCE(bus.convenience_fee_rate, 0) AS convenience_fee_rate,
        u.name AS user_name,
        u.loyalty_points,
        COALESCE(p.payment_id, 0) AS payment_id,
        COALESCE(p.receipt_number, '') AS receipt_number,
        COALESCE(p.amount, 0) AS amount,
        COALESCE(p.final_amount, 0) AS final_amount,
        COALESCE(p.customer_final_amount, p.final_amount, 0) AS customer_final_amount,
        COALESCE(p.captured_amount, 0) AS captured_amount,
        COALESCE(p.loyalty_amount, 0) AS loyalty_amount,
        COALESCE(p.convenience_fee, 0) AS convenience_fee,
        COALESCE(p.commission_rate, 0) AS payment_commission_rate,
        COALESCE(p.platform_commission, 0) AS platform_commission,
        COALESCE(p.seller_net_amount, 0) AS seller_net_amount,
        COALESCE(p.status, 'pending') AS payment_status,
        COALESCE(p.payment_method, 'unassigned') AS payment_method,
        COALESCE(p.payment_reference, '') AS payment_reference,
        COALESCE(p.gateway_status, 'awaiting_settlement') AS gateway_status,
        p.paid_at
      FROM booking b
      JOIN pc ON b.pc_id = pc.pc_id
      LEFT JOIN businesses bus ON bus.business_id = b.business_id
      JOIN users u ON u.uid = b.user_id
      LEFT JOIN payments p ON p.booking_id = b.booking_id
      WHERE b.booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  const booking = rows[0];

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  const foodRows = await query(
    `
      SELECT COALESCE(SUM(oi.total), 0) AS food_total
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.order_id
      WHERE o.booking_id = ?
      AND o.status IN ('active', 'preparing', 'completed', 'delivered', 'closed')
    `,
    [bookingId]
  );

  const slotRows = await query(
    `
      SELECT hour
      FROM booking_slots
      WHERE booking_id = ?
      ORDER BY hour ASC
    `,
    [bookingId]
  );

  const capturedAmount = roundCurrency(booking.captured_amount || 0);

  const slotHours = slotRows.map((row) => Number(row.hour)).filter(Number.isInteger);
  const sessionClock = getSessionClock({
    bookingDate: booking.booking_date,
    slotHours,
    startTime: booking.start_time,
    endTime:
      booking.booking_status === "closed" || booking.booking_status === "session_over"
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
  const breakdown = calculateBreakdown({
    minutes: sessionClock.minutes,
    slotCount: slotUsage.billableSlots,
    pricePerHour: booking.price_per_hour,
    foodTotal: foodRows[0]?.food_total || 0,
    loyaltyPoints: booking.loyalty_points,
    loyaltyApplied: booking.loyalty_amount,
    capturedAmount,
    useLoyalty: true,
    ...buildFeeBreakdownOptions(booking),
  });

  return {
    booking_id: Number(booking.booking_id || 0),
    booking_status: booking.booking_status,
    user_id: Number(booking.user_id || 0),
    user_name: booking.user_name,
    loyalty_points: Number(booking.loyalty_points || 0),
    payment: {
      payment_id: Number(booking.payment_id || 0),
      receipt_number: booking.receipt_number,
      amount: roundCurrency(booking.amount || 0),
      final_amount: roundCurrency(booking.final_amount || 0),
      customer_final_amount: roundCurrency(booking.customer_final_amount || 0),
      captured_amount: capturedAmount,
      loyalty_amount: roundCurrency(booking.loyalty_amount || 0),
      convenience_fee: roundCurrency(booking.convenience_fee || 0),
      commission_rate: roundCurrency(booking.payment_commission_rate || 0),
      platform_commission: roundCurrency(booking.platform_commission || 0),
      seller_net_amount: roundCurrency(booking.seller_net_amount || 0),
      status: booking.payment_status,
      payment_method: booking.payment_method,
      payment_reference: booking.payment_reference,
      gateway_status: booking.gateway_status,
      paid_at: booking.paid_at,
    },
    live_breakdown: {
      session_minutes: breakdown.minutes,
      booked_slots: slotUsage.totalBookedSlots,
      billable_slots: slotUsage.billableSlots,
      future_slots: slotUsage.futureSlots,
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
      earned_loyalty_preview: breakdown.earnedLoyalty,
      commission_rate: breakdown.commissionRate,
      platform_commission: breakdown.platformCommission,
      seller_net_amount: breakdown.sellerNetAmount,
    },
  };
}

router.get("/methods", (req, res) => {
  res.json(razorpay.isOnlineReady() ? PAYMENT_METHODS : PAYMENT_METHODS.filter((method) => method.code === "cash"));
});

router.get("/booking/:booking_id", auth, async (req, res) => {
  try {
    await ensureUserOwnsBooking(null, Number(req.user?.id || 0), Number(req.params.booking_id));
    res.json(await getPaymentSummary(req.params.booking_id));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/intents", auth, paymentAttemptLimiter, async (req, res) => {
  const bookingId = Number(req.body?.booking_id || 0);
  const idempotencyKey = String(req.headers?.["idempotency-key"] || "").trim();
  const useLoyalty = [true, 1, "1", "true", "yes", "on"].includes(req.body?.use_loyalty);
  if (!bookingId || !idempotencyKey || idempotencyKey.length > 100) {
    return res.status(400).json({ error: "booking_id and a valid Idempotency-Key are required." });
  }
  if (!razorpay.isOnlineReady()) {
    return res.status(503).json({ error: "Online payments are not configured with Razorpay keys and a webhook secret." });
  }

  try {
    await ensureUserOwnsBooking(null, Number(req.user?.id || 0), bookingId);
    const summary = await getPaymentSummary(bookingId);
    if (summary.booking_status !== "session_over") {
      return res.status(409).json({ error: "Session payment is available after the session ends." });
    }
    const due = useLoyalty
      ? summary.live_breakdown.amount_due
      : summary.live_breakdown.open_balance_before_loyalty;
    const amountPaise = Math.round(Number(due) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return res.status(400).json({ error: "There is no outstanding online payment for this booking." });
    }

    const priorRows = await query(
      `SELECT * FROM payment_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
      [Number(req.user?.id || 0), idempotencyKey]
    );
    if (priorRows[0]) {
      if (priorRows[0].status === "pending" && priorRows[0].provider_order_id) {
        return res.json(createExistingCheckoutLink({ req, attempt: priorRows[0] }));
      }
      return res.status(409).json({ error: "This payment request has already been processed." });
    }

    const attempt = {
      attempt_id: require("node:crypto").randomUUID(),
      user_id: Number(req.user?.id || 0),
      booking_id: bookingId,
      payment_id: summary.payment.payment_id,
      purpose: "session_settlement",
      idempotency_key: idempotencyKey,
      amount_paise: amountPaise,
      currency: razorpay.getConfiguration().currency,
      checkout_expires_at: getCheckoutExpiry(),
    };
    if (!attempt.payment_id) {
      return res.status(409).json({ error: "Payment record is not available for this booking." });
    }

    await query(
      `
        INSERT INTO payment_attempts (
          attempt_id, user_id, booking_id, payment_id, purpose, idempotency_key,
          amount_paise, currency, provider, status, checkout_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'razorpay', 'creating_order', ?)
      `,
      [attempt.attempt_id, attempt.user_id, attempt.booking_id, attempt.payment_id,
        attempt.purpose, attempt.idempotency_key, attempt.amount_paise, attempt.currency,
        attempt.checkout_expires_at]
    );

    try {
      const checkout = await createProviderOrder({ req, attempt });
      return res.status(201).json({ ...checkout, booking_id: bookingId });
    } catch (error) {
      await markAttemptFailed(attempt.attempt_id, {
        code: error.providerCode || "order_creation_failed",
        description: "Razorpay could not create the payment order.",
        requestId: req.requestId,
      }).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      try {
        const attempts = await query(
          `SELECT * FROM payment_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
          [Number(req.user?.id || 0), idempotencyKey]
        );
        const attempt = attempts[0];
        if (attempt?.status === "pending" && attempt.provider_order_id &&
            new Date(attempt.checkout_expires_at).getTime() > Date.now()) {
          return res.json(createExistingCheckoutLink({ req, attempt }));
        }
        return res.status(409).json({ error: "This payment request is already being processed." });
      } catch (_) {
        // Preserve the original error if the concurrent attempt cannot be read.
      }
    }
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/attempts/:attempt_id", auth, async (req, res) => {
  try {
    let rows = await query(
      `
        SELECT pa.attempt_id, pa.booking_id, pa.purpose, pa.amount_paise,
          pa.currency, pa.status, pa.failure_code, pa.failure_description,
          pa.provider_payment_id, pa.checkout_expires_at
        FROM payment_attempts pa
        WHERE pa.attempt_id = ? AND pa.user_id = ?
        LIMIT 1
      `,
      [req.params.attempt_id, Number(req.user?.id || 0)]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Payment attempt not found." });
    }
    if (
      rows[0].status === "pending" &&
      new Date(rows[0].checkout_expires_at).getTime() <= Date.now()
    ) {
      await markAttemptFailed(rows[0].attempt_id, {
        status: "expired",
        description: "The checkout window expired.",
        requestId: req.requestId,
      });
      rows = await query(
        `
          SELECT pa.attempt_id, pa.booking_id, pa.purpose, pa.amount_paise,
            pa.currency, pa.status, pa.failure_code, pa.failure_description,
            pa.provider_payment_id, pa.checkout_expires_at
          FROM payment_attempts pa
          WHERE pa.attempt_id = ? AND pa.user_id = ?
          LIMIT 1
        `,
        [req.params.attempt_id, Number(req.user?.id || 0)]
      );
    }
    res.json({ ...rows[0], amount_paise: Number(rows[0].amount_paise) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/refunds/request", auth, paymentAttemptLimiter, async (req, res) => {
  const userId = Number(req.user?.id || 0);
  const bookingId = Number(req.body?.booking_id || 0);
  const orderId = req.body?.order_id ? Number(req.body.order_id) : null;
  const requestKey = String(req.headers?.["idempotency-key"] || "").trim();
  if (!bookingId || !requestKey || requestKey.length > 100) {
    return res.status(400).json({ error: "booking_id and a valid Idempotency-Key are required." });
  }

  try {
    const refund = await withTransaction(async (connection) => {
      await ensureUserOwnsBooking(connection, userId, bookingId);
      const [paymentRows] = await connection.query(
        `
          SELECT b.booking_id, b.business_id, b.status AS booking_status,
            p.payment_id, p.captured_amount, p.refunded_amount, p.loyalty_amount,
            p.payment_method, p.payment_reference
          FROM booking b JOIN payments p ON p.booking_id = b.booking_id
          WHERE b.booking_id = ? LIMIT 1 FOR UPDATE
        `,
        [bookingId]
      );
      const payment = paymentRows[0];
      if (!payment || Number(payment.captured_amount || 0) <= 0) {
        const error = new Error("There is no captured payment available to refund.");
        error.statusCode = 409;
        throw error;
      }

      let order = null;
      if (orderId) {
        const [orderRows] = await connection.query(
          `SELECT order_id, status, total_amount FROM orders WHERE order_id = ? AND booking_id = ? LIMIT 1 FOR UPDATE`,
          [orderId, bookingId]
        );
        order = orderRows[0];
        if (!order || order.status !== "closed") {
          const error = new Error("Only a completed order on a settled bill can be refunded.");
          error.statusCode = 409;
          throw error;
        }
      } else if (payment.booking_status !== "cancelled") {
        const error = new Error("Booking refunds are available after an eligible booking cancellation.");
        error.statusCode = 409;
        throw error;
      }

      const available = Number(payment.captured_amount || 0) - Number(payment.refunded_amount || 0);
      const amount = req.body?.amount == null ? available : Number(req.body.amount);
      if (order && amount > Number(order.total_amount || 0)) {
        const error = new Error("The requested refund cannot exceed this order's total.");
        error.statusCode = 400;
        throw error;
      }
      const loyaltyRestore = !order && available > 0
        ? Math.floor(Number(payment.loyalty_amount || 0) * Math.min(amount, available) / Math.max(Number(payment.captured_amount || 0), 0.01))
        : 0;

      return createRefundRequest(connection, {
        payment: { ...payment, currency: razorpay.getConfiguration().currency },
        userId,
        orderId,
        amount,
        reason: req.body?.reason,
        requestKey,
        loyaltyPointsToRestore: loyaltyRestore,
      });
    });
    res.status(201).json({
      message: refund.outcome_message || "Refund request received.",
      refund,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/refunds", auth, async (req, res) => {
  const userId = Number(req.user?.id || 0);
  const bookingId = Number(req.query?.booking_id || 0);
  if (!bookingId) return res.status(400).json({ error: "booking_id is required." });
  try {
    await ensureUserOwnsBooking(null, userId, bookingId);
    const rows = await query(
      `
        SELECT refund_id, refund_number, booking_id, order_id, requested_amount,
          processed_amount, status, reason, outcome_message, failure_description,
          requested_at, processed_at
        FROM payment_refunds
        WHERE booking_id = ? AND user_id = ?
        ORDER BY requested_at DESC
      `,
      [bookingId, userId]
    );
    res.json(rows.map((row) => ({
      ...row,
      requested_amount: roundCurrency(row.requested_amount),
      processed_amount: roundCurrency(row.processed_amount),
    })));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/checkout/:attempt_id", async (req, res) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(String(req.params.attempt_id || ""))) {
      return res.status(404).send("Checkout not found.");
    }
    const rows = await query(
      `SELECT attempt_id, provider_order_id, amount_paise, currency, status, checkout_expires_at FROM payment_attempts WHERE attempt_id = ? LIMIT 1`,
      [req.params.attempt_id]
    );
    const attempt = rows[0];
    if (!attempt || attempt.status !== "pending") {
      return res.status(410).send("This checkout has expired or is no longer pending. Return to GameGrub to check payment status.");
    }
    if (new Date(attempt.checkout_expires_at).getTime() <= Date.now()) {
      await markAttemptFailed(attempt.attempt_id, {
        status: "expired",
        description: "The checkout window expired.",
        requestId: req.requestId,
      });
      return res.status(410).send("This checkout has expired. Return to GameGrub to check payment status.");
    }
    const page = checkoutPage({ keyId: getCheckoutPublicKey(), attempt });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'nonce-${page.nonce}' https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com; frame-src https://api.razorpay.com https://*.razorpay.com; img-src 'self' data: https:; style-src 'unsafe-inline'; form-action https://api.razorpay.com; base-uri 'none'; frame-ancestors 'none'`);
    res.send(page.html);
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message);
  }
});

router.post("/checkout/verify", paymentAttemptLimiter, async (req, res) => {
  try {
    const claims = verifyCheckoutToken(req.body?.token);
    if (!claims) {
      return res.status(401).json({ error: "Checkout link is invalid or expired." });
    }
    const rows = await query(
      `SELECT attempt_id, provider_order_id, amount_paise, currency, status FROM payment_attempts WHERE attempt_id = ? LIMIT 1`,
      [claims.attempt_id]
    );
    const attempt = rows[0];
    if (!attempt || attempt.status === "cancelled" || attempt.status === "failed") {
      return res.status(409).json({ error: "This payment attempt is no longer pending." });
    }
    if (String(req.body?.order_id || "") !== String(attempt.provider_order_id || "")) {
      return res.status(400).json({ error: "Payment order does not match this checkout." });
    }
    const validSignature = razorpay.verifyPaymentSignature({
      orderId: attempt.provider_order_id,
      paymentId: req.body?.payment_id,
      signature: req.body?.signature,
    });
    if (!validSignature) {
      return res.status(400).json({ error: "Razorpay payment signature is invalid." });
    }

    const payment = await razorpay.fetchPayment(req.body?.payment_id);
    if (
      String(payment.id || "") !== String(req.body?.payment_id || "") ||
      String(payment.order_id || "") !== String(attempt.provider_order_id) ||
      Number(payment.amount) !== Number(attempt.amount_paise) ||
      String(payment.currency || "").toUpperCase() !== String(attempt.currency).toUpperCase()
    ) {
      return res.status(400).json({ error: "Razorpay payment details do not match this order." });
    }
    if (String(payment.status || "").toLowerCase() !== "captured") {
      return res.status(202).json({ status: "pending", message: "Razorpay has not captured this payment yet." });
    }
    const result = await markAttemptCaptured(claims.attempt_id, payment);
    res.json({ status: result.status, duplicate: result.duplicate, message: result.status === "captured" ? "Payment verified." : "Payment captured after the booking changed; support review is required." });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message });
  }
});

router.post("/checkout/cancel", paymentAttemptLimiter, async (req, res) => {
  try {
    const claims = verifyCheckoutToken(req.body?.token);
    if (!claims) {
      return res.status(401).json({ error: "Checkout link is invalid or expired." });
    }
    await markAttemptFailed(claims.attempt_id, {
      status: "cancelled",
      description: "Checkout was dismissed.",
      requestId: req.requestId,
    });
    res.json({ status: "cancelled" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/checkout/fail", paymentAttemptLimiter, async (req, res) => {
  try {
    const claims = verifyCheckoutToken(req.body?.token);
    if (!claims) {
      return res.status(401).json({ error: "Checkout link is invalid or expired." });
    }
    await markAttemptFailed(claims.attempt_id, {
      code: req.body?.code,
      description: req.body?.description,
      requestId: req.requestId,
    });
    res.json({ status: "failed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  try {
    if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    const refundEntity = event?.payload?.refund?.entity;
    if (["refund.processed", "refund.failed"].includes(String(event.event || "")) && refundEntity?.id) {
      await withTransaction(async (connection) => {
        const refundId = String(refundEntity.notes?.gamegrub_refund_id || "");
        const [refundRows] = await connection.query(
          `SELECT * FROM payment_refunds
           WHERE refund_id = ? OR provider_refund_id = ?
           LIMIT 1 FOR UPDATE`,
          [refundId, refundEntity.id]
        );
        if (!refundRows[0]) return;
        await applyRefundOutcome(connection, refundRows[0], {
          status: event.event === "refund.processed" ? "processed" : "failed",
          providerRefundId: refundEntity.id,
          failureDescription: refundEntity.error_description || refundEntity.notes?.failure_description || "",
        });
      });
      return res.json({ received: true });
    }
    const payment = event?.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id) {
      return res.json({ received: true, ignored: true });
    }
    const attempts = await query(
      `SELECT attempt_id FROM payment_attempts WHERE provider_order_id = ? LIMIT 1`,
      [payment.order_id]
    );
    const attempt = attempts[0];
    if (!attempt) {
      return res.json({ received: true, ignored: true });
    }
    if (event.event === "payment.captured") {
      const confirmed = await razorpay.fetchPayment(payment.id);
      if (String(confirmed.id || "") !== String(payment.id)) {
        return res.status(400).json({ error: "Razorpay payment reference did not match the webhook." });
      }
      await markAttemptCaptured(attempt.attempt_id, confirmed);
    } else if (event.event === "payment.failed") {
      await markAttemptFailed(attempt.attempt_id, {
        code: payment.error_code,
        description: payment.error_description,
        requestId: req.requestId,
      });
    }
    res.json({ received: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Kept as a hard failure for old clients: a client supplied reference is not proof of capture.
router.post("/success", auth, (req, res) => {
  res.status(410).json({ error: "Client-reported payment success is disabled. Use the verified checkout flow." });
});

module.exports = router;
module.exports.markAttemptCaptured = markAttemptCaptured;
module.exports.markAttemptFailed = markAttemptFailed;
