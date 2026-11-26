const { createHmac, timingSafeEqual } = require("node:crypto");

const DEFAULT_API_BASE_URL = "https://api.razorpay.com/v1";

function getConfiguration() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
    webhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
    apiBaseUrl: String(process.env.RAZORPAY_API_BASE_URL || DEFAULT_API_BASE_URL)
      .trim()
      .replace(/\/+$/, ""),
    currency: String(process.env.PAYMENT_CURRENCY || "INR").trim().toUpperCase(),
  };
}

function isConfigured() {
  const { keyId, keySecret } = getConfiguration();
  return Boolean(keyId && keySecret);
}

function isOnlineReady() {
  const { keyId, keySecret, webhookSecret } = getConfiguration();
  const production = [process.env.NODE_ENV, process.env.APP_ENV]
    .map((value) => String(value || "").trim().toLowerCase())
    .includes("production");
  const publicCheckoutUrl = String(process.env.PAYMENT_CHECKOUT_PUBLIC_URL || "").trim();
  return Boolean(
    keyId &&
      keySecret &&
      webhookSecret &&
      (!production || /^https:\/\//i.test(publicCheckoutUrl))
  );
}

function createProviderError(message, statusCode = 502, providerCode = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.providerCode = providerCode;
  return error;
}

function buildAuthorizationHeader(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function readProviderResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const providerMessage = String(payload?.error?.description || "").trim();
    const error = createProviderError(
      providerMessage || "Razorpay could not process the payment request.",
      502,
      payload?.error?.code || null
    );
    error.providerStatus = response.status;
    throw error;
  }

  return payload;
}

async function createOrder({ amountPaise, currency, receipt, notes = {} }) {
  const { keyId, keySecret, apiBaseUrl, currency: configuredCurrency } = getConfiguration();

  if (!keyId || !keySecret) {
    throw createProviderError(
      "Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      503
    );
  }

  const amount = Number(amountPaise);
  const resolvedCurrency = String(currency || configuredCurrency).trim().toUpperCase();

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createProviderError("Payment amount is invalid.", 400);
  }

  if (resolvedCurrency !== configuredCurrency) {
    throw createProviderError("Payment currency does not match the configured currency.", 400);
  }

  const response = await fetch(`${apiBaseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationHeader(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: resolvedCurrency,
      receipt: String(receipt || "").slice(0, 40),
      notes,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const order = await readProviderResponse(response);

  if (
    !String(order.id || "").startsWith("order_") ||
    Number(order.amount) !== amount ||
    String(order.currency || "").toUpperCase() !== resolvedCurrency ||
    String(order.status || "").toLowerCase() !== "created"
  ) {
    throw createProviderError("Razorpay returned an invalid order response.");
  }

  return {
    id: String(order.id),
    amount: Number(order.amount),
    currency: String(order.currency).toUpperCase(),
    status: String(order.status).toLowerCase(),
  };
}

async function fetchPayment(paymentId) {
  const { keyId, keySecret, apiBaseUrl } = getConfiguration();

  if (!keyId || !keySecret) {
    throw createProviderError("Online payments are not configured.", 503);
  }

  const normalizedPaymentId = String(paymentId || "").trim();
  if (!/^pay_[A-Za-z0-9]+$/.test(normalizedPaymentId)) {
    throw createProviderError("Payment reference is invalid.", 400);
  }

  const response = await fetch(
    `${apiBaseUrl}/payments/${encodeURIComponent(normalizedPaymentId)}`,
    {
      headers: {
        Authorization: buildAuthorizationHeader(keyId, keySecret),
      },
      signal: AbortSignal.timeout(12000),
    }
  );

  return readProviderResponse(response);
}

async function createRefund({ paymentId, amountPaise, idempotencyKey, receipt, notes = {} }) {
  const { keyId, keySecret, apiBaseUrl, currency } = getConfiguration();
  if (!keyId || !keySecret) {
    throw createProviderError("Online refunds are not configured.", 503);
  }
  const normalizedPaymentId = String(paymentId || "").trim();
  const amount = Number(amountPaise);
  const normalizedKey = String(idempotencyKey || "").trim();
  if (!/^pay_[A-Za-z0-9]+$/.test(normalizedPaymentId)) {
    throw createProviderError("Refund payment reference is invalid.", 400);
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createProviderError("Refund amount is invalid.", 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(normalizedKey)) {
    throw createProviderError("Refund idempotency key is invalid.", 400);
  }

  const response = await fetch(
    `${apiBaseUrl}/payments/${encodeURIComponent(normalizedPaymentId)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: buildAuthorizationHeader(keyId, keySecret),
        "Content-Type": "application/json",
        "X-Refund-Idempotency": normalizedKey,
      },
      body: JSON.stringify({ amount, receipt: String(receipt || "").slice(0, 40), notes }),
      signal: AbortSignal.timeout(12000),
    }
  );
  const refund = await readProviderResponse(response);
  if (
    !String(refund.id || "").startsWith("rfnd_") ||
    String(refund.payment_id || "") !== normalizedPaymentId ||
    Number(refund.amount) !== amount ||
    String(refund.currency || "").toUpperCase() !== currency
  ) {
    throw createProviderError("Razorpay returned an invalid refund response.");
  }
  return {
    id: String(refund.id),
    paymentId: normalizedPaymentId,
    amountPaise: Number(refund.amount),
    currency: String(refund.currency).toUpperCase(),
    status: String(refund.status || "pending").toLowerCase(),
  };
}

function safeSignatureEquals(expected, received) {
  const left = Buffer.from(String(expected || "").toLowerCase(), "hex");
  const rightText = String(received || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(rightText)) {
    return false;
  }

  const right = Buffer.from(rightText, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const { keySecret } = getConfiguration();
  if (!keySecret) {
    throw createProviderError("Online payments are not configured.", 503);
  }

  const normalizedOrderId = String(orderId || "").trim();
  const normalizedPaymentId = String(paymentId || "").trim();
  if (
    !/^order_[A-Za-z0-9]+$/.test(normalizedOrderId) ||
    !/^pay_[A-Za-z0-9]+$/.test(normalizedPaymentId)
  ) {
    return false;
  }

  const expected = createHmac("sha256", keySecret)
    .update(`${normalizedOrderId}|${normalizedPaymentId}`)
    .digest("hex");
  return safeSignatureEquals(expected, signature);
}

function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = getConfiguration();
  if (!webhookSecret) {
    throw createProviderError("Payment webhook is not configured.", 503);
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || "")))
    .digest("hex");
  return safeSignatureEquals(expected, signature);
}

module.exports = {
  createOrder,
  createRefund,
  fetchPayment,
  getConfiguration,
  isConfigured,
  isOnlineReady,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
