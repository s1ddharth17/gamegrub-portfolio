const { randomUUID } = require("node:crypto");
const { roundCurrency } = require("./billing");
const { recordPaymentTransaction } = require("./paymentLedger");
const { createCustomerNotification } = require("./customerNotifications");

const RESERVED_REFUND_STATUSES = ["requested", "processing", "processed"];

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function createRefundRequest(connection, {
  payment,
  userId,
  orderId = null,
  amount,
  reason = "",
  requestKey = randomUUID(),
  loyaltyPointsToRestore = 0,
}) {
  const key = String(requestKey || "").trim();
  if (!key || key.length > 100) {
    throw httpError("A valid refund request key is required.", 400);
  }

  const [priorRows] = await connection.query(
    `SELECT refund_id, refund_number, requested_amount, status, outcome_message
     FROM payment_refunds WHERE user_id = ? AND request_key = ? LIMIT 1`,
    [Number(userId), key]
  );
  if (priorRows[0]) return priorRows[0];

  const requestedAmount = roundCurrency(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw httpError("Refund amount must be greater than zero.", 400);
  }

  const [reservedRows] = await connection.query(
    `SELECT COALESCE(SUM(requested_amount), 0) AS reserved_amount
     FROM payment_refunds
     WHERE payment_id = ? AND status IN (?, ?, ?)`,
    [payment.payment_id, ...RESERVED_REFUND_STATUSES]
  );
  const refundableAmount = roundCurrency(
    Number(payment.captured_amount || 0) - Math.max(
      Number(reservedRows[0]?.reserved_amount || 0),
      Number(payment.refunded_amount || 0)
    )
  );
  if (requestedAmount > refundableAmount) {
    throw httpError(`Refund amount exceeds the remaining refundable balance of ${refundableAmount.toFixed(2)}.`, 409);
  }

  const [providerRows] = await connection.query(
    `
      SELECT pa.provider_payment_id, pa.amount_paise / 100 AS captured_amount,
        COALESCE(SUM(r.requested_amount), 0) AS reserved_amount
      FROM payment_attempts pa
      LEFT JOIN payment_refunds r
        ON r.provider_payment_id = pa.provider_payment_id
        AND r.status IN (?, ?, ?)
      WHERE pa.payment_id = ?
        AND pa.status = 'captured'
        AND pa.provider_payment_id IS NOT NULL
      GROUP BY pa.attempt_id, pa.provider_payment_id, pa.amount_paise
      ORDER BY pa.updated_at DESC
    `,
    [...RESERVED_REFUND_STATUSES, payment.payment_id]
  );
  const providerCapture = providerRows.find(
    (row) => Number(row.captured_amount) - Number(row.reserved_amount) >= requestedAmount
  );
  const legacyProviderPaymentId =
    String(payment.payment_reference || "").match(/^pay_[A-Za-z0-9]+$/)?.[0] || null;
  const providerPaymentId = providerCapture?.provider_payment_id ||
    (String(payment.payment_method || "").toLowerCase() === "razorpay" ? legacyProviderPaymentId : null);
  if (String(payment.payment_method || "").toLowerCase() === "razorpay" && !providerPaymentId) {
    throw httpError("The captured Razorpay payment cannot be matched to a provider payment ID.", 409);
  }
  const refundMethod = providerPaymentId ? "razorpay" : "manual";
  const refundId = randomUUID();
  const refundNumber = `GG-REF-${refundId.replace(/-/g, "").slice(0, 16).toUpperCase()}`;

  await connection.query(
    `
      INSERT INTO payment_refunds (
        refund_id, refund_number, business_id, payment_id, booking_id, order_id,
        user_id, requested_by_user_id, request_key, provider_payment_id,
        refund_method, currency, requested_amount, loyalty_points_to_restore,
        status, reason, outcome_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)
    `,
    [
      refundId,
      refundNumber,
      Number(payment.business_id),
      Number(payment.payment_id),
      Number(payment.booking_id),
      orderId ? Number(orderId) : null,
      Number(userId),
      Number(userId),
      key,
      providerPaymentId,
      refundMethod,
      String(payment.currency || "INR").toUpperCase(),
      requestedAmount,
      Math.max(0, Math.floor(Number(loyaltyPointsToRestore || 0))),
      String(reason || "").trim().slice(0, 500) || null,
      "Refund request received. The café team will review the request.",
    ]
  );

  await createCustomerNotification(connection, {
    userId,
    category: "refunds",
    eventType: "refund_requested",
    title: "Refund request received",
    message: "The café team will review your refund request. You can check its status from your booking.",
    deepLink: orderId
      ? `/orders/${Number(orderId)}?booking_id=${Number(payment.booking_id)}`
      : `/booking/${Number(payment.booking_id)}`,
    entityType: "refund",
    entityId: refundId,
    idempotencyKey: `refund:${refundId}:requested`,
  });

  return {
    refund_id: refundId,
    refund_number: refundNumber,
    requested_amount: requestedAmount,
    status: "requested",
    outcome_message: "Refund request received. The café team will review the request.",
  };
}

function refundOutcome(status, failureDescription = "") {
  switch (String(status || "").toLowerCase()) {
    case "processing":
      return "Refund sent to the payment provider and is processing.";
    case "processed":
      return "Refund completed. The credit will appear through the original payment method.";
    case "partially_refunded":
      return "Partial refund completed.";
    case "rejected":
      return String(failureDescription || "The café team declined this refund request.").slice(0, 500);
    case "failed":
      return String(failureDescription || "The refund could not be completed. The café team has been notified.").slice(0, 500);
    default:
      return "Refund request received. The café team will review the request.";
  }
}

async function applyRefundOutcome(connection, refund, {
  status,
  providerRefundId = null,
  failureDescription = "",
  externalReference = null,
  adminId = null,
} = {}) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (refund.status === "processed") return false;
  if (normalizedStatus === "processed") {
    const [paymentRows] = await connection.query(
      `SELECT captured_amount, refunded_amount FROM payments WHERE payment_id = ? LIMIT 1 FOR UPDATE`,
      [refund.payment_id]
    );
    const payment = paymentRows[0];
    if (!payment) throw httpError("Payment record for this refund no longer exists.", 404);
    const processedAmount = roundCurrency(refund.requested_amount);
    const nextRefunded = roundCurrency(Number(payment.refunded_amount || 0) + processedAmount);
    const nextPaymentStatus = nextRefunded >= Number(payment.captured_amount || 0)
      ? "refunded"
      : "partially_refunded";

    await connection.query(
      `
        UPDATE payment_refunds
        SET status = 'processed', processed_amount = ?, provider_refund_id = COALESCE(?, provider_refund_id),
          processed_by_admin_id = COALESCE(?, processed_by_admin_id), admin_note = COALESCE(?, admin_note),
          processed_at = NOW(), outcome_message = ?, failure_description = NULL
        WHERE refund_id = ? AND status <> 'processed'
      `,
      [
        processedAmount,
        providerRefundId,
        adminId,
        externalReference ? `Refund reference: ${externalReference}`.slice(0, 500) : null,
        refundOutcome("processed"),
        refund.refund_id,
      ]
    );
    await connection.query(
      `UPDATE payments SET refunded_amount = ?, status = ?, gateway_status = ? WHERE payment_id = ?`,
      [nextRefunded, nextPaymentStatus, nextPaymentStatus, refund.payment_id]
    );
    await recordPaymentTransaction(connection, {
      businessId: refund.business_id,
      paymentId: refund.payment_id,
      bookingId: refund.booking_id,
      kind: "refund",
      channel: refund.refund_method,
      amount: processedAmount,
      reference: providerRefundId || externalReference,
      sourceType: "refund",
      sourceId: refund.refund_id,
      adminId,
      note: refund.reason || "Refund completed.",
    });
    const loyaltyRestore = Math.max(0, Math.floor(Number(refund.loyalty_points_to_restore || 0)));
    if (loyaltyRestore > 0) {
      await connection.query(
        `UPDATE users SET loyalty_points = loyalty_points + ? WHERE uid = ?`,
        [loyaltyRestore, refund.user_id]
      );
      await connection.query(
        `INSERT INTO loyalty_transactions (user_id, booking_id, points, transaction_type, note)
         VALUES (?, ?, ?, 'refund', ?)`,
        [refund.user_id, refund.booking_id, loyaltyRestore, `Loyalty returned for refund ${refund.refund_number}.`]
      );
    }
    await notifyRefundOutcome(connection, refund, "processed", refundOutcome("processed"));
    return true;
  }

  if (["failed", "rejected"].includes(normalizedStatus)) {
    const message = String(failureDescription || "").trim().slice(0, 500);
    await connection.query(
      `
        UPDATE payment_refunds
        SET status = ?, provider_refund_id = COALESCE(?, provider_refund_id),
          processed_by_admin_id = COALESCE(?, processed_by_admin_id), failure_description = ?,
          outcome_message = ?, admin_note = COALESCE(?, admin_note), processed_at = ?
        WHERE refund_id = ? AND status <> 'processed'
      `,
      [
        normalizedStatus,
        providerRefundId,
        adminId,
        message || null,
        refundOutcome(normalizedStatus, message),
        externalReference ? String(externalReference).slice(0, 500) : null,
        normalizedStatus === "rejected" ? new Date() : null,
        refund.refund_id,
      ]
    );
    await notifyRefundOutcome(
      connection,
      refund,
      normalizedStatus,
      refundOutcome(normalizedStatus, message)
    );
    return true;
  }

  await connection.query(
    `
      UPDATE payment_refunds
      SET status = 'processing', provider_refund_id = COALESCE(?, provider_refund_id),
        processed_by_admin_id = COALESCE(?, processed_by_admin_id), outcome_message = ?,
        failure_description = NULL
      WHERE refund_id = ? AND status <> 'processed'
    `,
    [providerRefundId, adminId, refundOutcome("processing"), refund.refund_id]
  );
  await notifyRefundOutcome(connection, refund, "processing", refundOutcome("processing"));
  return true;
}

async function notifyRefundOutcome(connection, refund, status, message) {
  const deepLink = refund.order_id
    ? `/orders/${Number(refund.order_id)}?booking_id=${Number(refund.booking_id)}`
    : `/booking/${Number(refund.booking_id)}`;
  await createCustomerNotification(connection, {
    userId: refund.user_id,
    category: "refunds",
    eventType: `refund_${status}`,
    title: status === "processed"
      ? "Refund completed"
      : status === "processing"
        ? "Refund is processing"
        : status === "rejected"
          ? "Refund request declined"
          : "Refund could not be completed",
    message: String(message || "Refund status updated.").slice(0, 1000),
    deepLink,
    entityType: "refund",
    entityId: refund.refund_id,
    idempotencyKey: `refund:${refund.refund_id}:${status}`,
  });
}

module.exports = {
  createRefundRequest,
  applyRefundOutcome,
  refundOutcome,
};
