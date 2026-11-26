const { createCheckoutToken } = require("./paymentCheckoutToken");
const razorpay = require("./razorpay");
const { query } = require("./db");

const CHECKOUT_TTL_MS = 20 * 60 * 1000;

function getCheckoutExpiry() {
  return new Date(Date.now() + CHECKOUT_TTL_MS);
}

function buildCheckoutUrl(req, attemptId, expiresAt) {
  const configuredBase = String(process.env.PAYMENT_CHECKOUT_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const baseUrl = configuredBase || `${req.protocol}://${req.get("host")}`;
  const url = new URL(`/api/payment/checkout/${attemptId}`, baseUrl);
  // The fragment stays out of HTTP request logs and Referer headers.
  url.hash = `token=${encodeURIComponent(createCheckoutToken(attemptId, expiresAt))}`;
  return url.toString();
}

async function createProviderOrder({ req, attempt }) {
  const expiresAt = attempt.checkout_expires_at
    ? new Date(attempt.checkout_expires_at)
    : getCheckoutExpiry();
  const order = await razorpay.createOrder({
    amountPaise: Number(attempt.amount_paise),
    currency: attempt.currency,
    receipt: String(attempt.attempt_id).replace(/-/g, "").slice(0, 40),
    notes: {
      gamegrub_attempt_id: attempt.attempt_id,
      gamegrub_booking_id: String(attempt.booking_id),
    },
  });

  await query(
    `
      UPDATE payment_attempts
      SET provider_order_id = ?, status = 'pending'
      WHERE attempt_id = ? AND status = 'creating_order'
    `,
    [order.id, attempt.attempt_id]
  );

  return {
    attempt_id: attempt.attempt_id,
    provider_order_id: order.id,
    amount_paise: order.amount,
    currency: order.currency,
    status: "pending",
    checkout_url: buildCheckoutUrl(req, attempt.attempt_id, expiresAt),
    expires_at: expiresAt.toISOString(),
  };
}

function createExistingCheckoutLink({ req, attempt }) {
  const expiresAt = new Date(attempt.checkout_expires_at);
  return {
    attempt_id: attempt.attempt_id,
    provider_order_id: attempt.provider_order_id,
    amount_paise: Number(attempt.amount_paise),
    currency: attempt.currency,
    status: attempt.status,
    checkout_url: buildCheckoutUrl(req, attempt.attempt_id, expiresAt),
    expires_at: expiresAt.toISOString(),
  };
}

module.exports = {
  CHECKOUT_TTL_MS,
  buildCheckoutUrl,
  createExistingCheckoutLink,
  createProviderOrder,
  getCheckoutExpiry,
};
