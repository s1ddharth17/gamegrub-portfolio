const { roundCurrency } = require("./billing");

const PAYMENT_CHANNELS = new Set([
  "razorpay",
  "cash",
  "upi",
  "card",
  "wallet",
  "manual",
]);

function normalizePaymentChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PAYMENT_CHANNELS.has(normalized) ? normalized : "manual";
}

async function recordPaymentTransaction(connection, transaction) {
  const amount = roundCurrency(transaction.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return;
  }

  await connection.query(
    `
      INSERT INTO payment_transactions (
        business_id, payment_id, booking_id, kind, channel, amount, reference,
        source_type, source_id, admin_id, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE transaction_id = LAST_INSERT_ID(transaction_id)
    `,
    [
      Number(transaction.businessId),
      Number(transaction.paymentId),
      Number(transaction.bookingId),
      String(transaction.kind),
      normalizePaymentChannel(transaction.channel),
      amount,
      String(transaction.reference || "").trim().slice(0, 120) || null,
      String(transaction.sourceType),
      String(transaction.sourceId),
      transaction.adminId ? Number(transaction.adminId) : null,
      String(transaction.note || "").trim().slice(0, 500) || null,
    ]
  );
}

module.exports = {
  normalizePaymentChannel,
  recordPaymentTransaction,
};
