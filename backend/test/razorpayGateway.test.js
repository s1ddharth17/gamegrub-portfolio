const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

function setEnv(t, values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function makeCapturedPayment() {
  return {
    id: "pay_test123",
    order_id: "order_test123",
    amount: 12500,
    currency: "INR",
    status: "captured",
  };
}

function loadFreshPaymentRouter() {
  const modulePath = require.resolve("../routes/payment");
  delete require.cache[modulePath];
  return require(modulePath);
}

test("Razorpay orders are created server-side in currency subunits with Basic auth", async (t) => {
  setEnv(t, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "server-only-secret",
    RAZORPAY_API_BASE_URL: "https://api.test/v1/",
    PAYMENT_CURRENCY: "INR",
  });
  let request;
  t.mock.method(global, "fetch", async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "order_test123",
          amount: 12500,
          currency: "INR",
          status: "created",
        };
      },
    };
  });

  const razorpay = require("../utils/razorpay");
  const order = await razorpay.createOrder({
    amountPaise: 12500,
    currency: "INR",
    receipt: "booking-501",
    notes: { booking_id: "501" },
  });

  assert.equal(request.url, "https://api.test/v1/orders");
  assert.equal(
    request.options.headers.Authorization,
    `Basic ${Buffer.from("rzp_test_key:server-only-secret").toString("base64")}`
  );
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: 12500,
    currency: "INR",
    receipt: "booking-501",
    notes: { booking_id: "501" },
  });
  assert.equal(order.id, "order_test123");
});

test("Razorpay refunds use a stable idempotency key and validate the provider response", async (t) => {
  setEnv(t, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "server-only-secret",
    RAZORPAY_API_BASE_URL: "https://api.test/v1/",
    PAYMENT_CURRENCY: "INR",
  });
  let request;
  t.mock.method(global, "fetch", async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "rfnd_test123",
          payment_id: "pay_test123",
          amount: 2500,
          currency: "INR",
          status: "pending",
        };
      },
    };
  });

  const razorpay = require("../utils/razorpay");
  const refund = await razorpay.createRefund({
    paymentId: "pay_test123",
    amountPaise: 2500,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    receipt: "GG-REF-123",
    notes: { gamegrub_refund_id: "123e4567-e89b-42d3-a456-426614174000" },
  });

  assert.equal(request.url, "https://api.test/v1/payments/pay_test123/refund");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["X-Refund-Idempotency"], "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: 2500,
    receipt: "GG-REF-123",
    notes: { gamegrub_refund_id: "123e4567-e89b-42d3-a456-426614174000" },
  });
  assert.deepEqual(refund, {
    id: "rfnd_test123",
    paymentId: "pay_test123",
    amountPaise: 2500,
    currency: "INR",
    status: "pending",
  });
});

test("checkout and webhook HMAC verification rejects forged signatures", (t) => {
  setEnv(t, {
    RAZORPAY_KEY_SECRET: "payment-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
  });
  const razorpay = require("../utils/razorpay");
  const signature = createHmac("sha256", "payment-secret")
    .update("order_test123|pay_test123")
    .digest("hex");
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = createHmac("sha256", "webhook-secret")
    .update(rawBody)
    .digest("hex");

  assert.equal(
    razorpay.verifyPaymentSignature({
      orderId: "order_test123",
      paymentId: "pay_test123",
      signature,
    }),
    true
  );
  assert.equal(
    razorpay.verifyPaymentSignature({
      orderId: "order_test123",
      paymentId: "pay_test123",
      signature: "0".repeat(64),
    }),
    false
  );
  assert.equal(razorpay.verifyWebhookSignature(rawBody, webhookSignature), true);
  assert.equal(razorpay.verifyWebhookSignature(Buffer.from("altered"), webhookSignature), false);
});

test("short-lived checkout tokens bind to one attempt and reject expiry or tampering", (t) => {
  setEnv(t, { JWT_SECRET: "checkout-token-signing-secret" });
  const { createCheckoutToken, verifyCheckoutToken } = require("../utils/paymentCheckoutToken");
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const token = createCheckoutToken(attemptId, new Date(Date.now() + 60_000));

  assert.equal(verifyCheckoutToken(token).attempt_id, attemptId);
  assert.equal(verifyCheckoutToken(`${token}x`), null);
  assert.equal(
    verifyCheckoutToken(createCheckoutToken(attemptId, new Date(Date.now() - 1_000))),
    null
  );
});

test("captured callback and webhook replay update the booking once", async (t) => {
  const db = require("../utils/db");
  let attemptStatus = "pending";
  let providerPaymentId = null;
  let paymentUpdates = 0;
  let customerNotifications = 0;
  const attempt = {
    attempt_id: "123e4567-e89b-42d3-a456-426614174000",
    booking_id: 501,
    payment_id: 901,
    business_id: 3,
    user_id: 11,
    purpose: "booking_advance",
    amount_paise: 12500,
    currency: "INR",
    provider_order_id: "order_test123",
    status: "pending",
    checkout_expires_at: new Date(Date.now() + 60_000),
    payment_expires_at: new Date(Date.now() + 60_000),
    booking_status: "pending_payment",
  };
  const connection = {
    async query(sql, params = []) {
      if (/SELECT pa\.\*, b\.status/.test(sql)) {
        return [[{ ...attempt, status: attemptStatus, provider_payment_id: providerPaymentId }]];
      }
      if (/UPDATE payment_attempts/.test(sql)) {
        attemptStatus = "captured";
        providerPaymentId = params[0];
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO payment_transactions/.test(sql)) {
        return [{ affectedRows: 1, insertId: 1001 }];
      }
      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) {
        customerNotifications += 1;
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE payments/.test(sql)) {
        paymentUpdates += 1;
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE booking/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected payment query: ${sql}`);
    },
  };
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  const paymentRouter = loadFreshPaymentRouter();

  const first = await paymentRouter.markAttemptCaptured(attempt.attempt_id, makeCapturedPayment());
  const second = await paymentRouter.markAttemptCaptured(attempt.attempt_id, makeCapturedPayment());

  assert.deepEqual(first, { status: "captured", duplicate: false });
  assert.deepEqual(second, { status: "captured", duplicate: true });
  assert.equal(paymentUpdates, 1);
  assert.equal(customerNotifications, 1);
});

test("payment amount mismatch is rejected before payment state changes", async (t) => {
  const db = require("../utils/db");
  let writes = 0;
  const connection = {
    async query(sql) {
      if (/SELECT pa\.\*, b\.status/.test(sql)) {
        return [[{
          attempt_id: "123e4567-e89b-42d3-a456-426614174000",
          booking_id: 501,
          amount_paise: 12500,
          currency: "INR",
          provider_order_id: "order_test123",
          status: "pending",
          checkout_expires_at: new Date(Date.now() + 60_000),
          payment_expires_at: new Date(Date.now() + 60_000),
          booking_status: "pending_payment",
          purpose: "booking_advance",
        }]];
      }
      writes += 1;
      return [{ affectedRows: 1 }];
    },
  };
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  const paymentRouter = loadFreshPaymentRouter();

  await assert.rejects(
    paymentRouter.markAttemptCaptured(
      "123e4567-e89b-42d3-a456-426614174000",
      { ...makeCapturedPayment(), amount: 1 }
    ),
    /do not match this order/
  );
  assert.equal(writes, 0);
});

test("failed and cancelled advances restore loyalty only once", async (t) => {
  const db = require("../utils/db");
  let attemptStatus = "pending";
  let refunds = 0;
  const attempt = {
    attempt_id: "123e4567-e89b-42d3-a456-426614174000",
    booking_id: 501,
    payment_id: 901,
    user_id: 11,
    purpose: "booking_advance",
    status: "pending",
  };
  const connection = {
    async query(sql, params = []) {
      if (/SELECT \* FROM payment_attempts/.test(sql)) {
        return [[{ ...attempt, status: attemptStatus }]];
      }
      if (/UPDATE payment_attempts/.test(sql)) {
        if (attemptStatus !== "pending") return [{ affectedRows: 0 }];
        attemptStatus = params[0];
        return [{ affectedRows: 1 }];
      }
      if (/SELECT loyalty_amount FROM payments/.test(sql)) return [[{ loyalty_amount: 25 }]];
      if (/UPDATE users SET loyalty_points/.test(sql) || /INSERT INTO loyalty_transactions/.test(sql)) {
        refunds += 1;
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE booking/.test(sql) || /DELETE FROM booking_slots/.test(sql) || /UPDATE payments/.test(sql)) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected payment query: ${sql}`);
    },
  };
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  const paymentRouter = loadFreshPaymentRouter();

  assert.equal(await paymentRouter.markAttemptFailed(attempt.attempt_id, { status: "cancelled" }), true);
  assert.equal(await paymentRouter.markAttemptFailed(attempt.attempt_id, { status: "failed" }), false);
  assert.equal(refunds, 2);
  assert.equal(attemptStatus, "cancelled");
});
