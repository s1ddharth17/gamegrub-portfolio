const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRefundRequest,
  applyRefundOutcome,
} = require("../utils/paymentRefunds");

function refundConnection({ capturedAmount = 100, refundedAmount = 0 } = {}) {
  const refunds = [];
  const ledger = [];
  const loyalty = { points: 0 };
  const payment = { captured_amount: capturedAmount, refunded_amount: refundedAmount };
  return {
    refunds,
    ledger,
    loyalty,
    payment,
    async query(sql, params = []) {
      if (/FROM payment_refunds WHERE user_id = \? AND request_key/.test(sql)) {
        const row = refunds.find((refund) => refund.user_id === Number(params[0]) && refund.request_key === params[1]);
        return [[row ? {
          refund_id: row.refund_id,
          refund_number: row.refund_number,
          requested_amount: row.requested_amount,
          status: row.status,
          outcome_message: row.outcome_message,
        } : undefined].filter(Boolean)];
      }
      if (/SELECT COALESCE\(SUM\(requested_amount\), 0\) AS reserved_amount/.test(sql)) {
        const reserved = refunds
          .filter((refund) => refund.payment_id === Number(params[0]) && ["requested", "processing", "processed"].includes(refund.status))
          .reduce((sum, refund) => sum + refund.requested_amount, 0);
        return [[{ reserved_amount: reserved }]];
      }
      if (/FROM payment_attempts pa/.test(sql)) return [[]];
      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) {
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO payment_refunds/.test(sql)) {
        refunds.push({
          refund_id: params[0],
          refund_number: params[1],
          business_id: Number(params[2]),
          payment_id: Number(params[3]),
          booking_id: Number(params[4]),
          order_id: params[5] == null ? null : Number(params[5]),
          user_id: Number(params[6]),
          request_key: params[8],
          requested_amount: Number(params[12]),
          loyalty_points_to_restore: Number(params[13]),
          status: "requested",
          reason: params[14],
          outcome_message: params[15],
        });
        return [{ affectedRows: 1 }];
      }
      if (/SELECT captured_amount, refunded_amount FROM payments/.test(sql)) return [[payment]];
      if (/UPDATE payment_refunds\s+SET status = 'processed'/.test(sql)) {
        const row = refunds.find((refund) => refund.refund_id === params.at(-1));
        if (row) row.status = "processed";
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE payments SET refunded_amount =/.test(sql)) {
        payment.refunded_amount = Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO payment_transactions/.test(sql)) {
        ledger.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE users SET loyalty_points = loyalty_points \+/.test(sql)) {
        loyalty.points += Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO loyalty_transactions/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected refund query: ${sql}`);
    },
  };
}

const payment = {
  payment_id: 901,
  booking_id: 501,
  business_id: 3,
  captured_amount: 100,
  refunded_amount: 0,
  payment_method: "cash",
  payment_reference: "counter-1",
};

test("refund requests are idempotent and reserve the captured balance", async () => {
  const connection = refundConnection();
  const first = await createRefundRequest(connection, {
    payment,
    userId: 11,
    amount: 60,
    requestKey: "booking-cancel-1",
  });
  const retry = await createRefundRequest(connection, {
    payment,
    userId: 11,
    amount: 60,
    requestKey: "booking-cancel-1",
  });

  assert.equal(first.refund_id, retry.refund_id);
  assert.equal(connection.refunds.length, 1);
  await assert.rejects(
    createRefundRequest(connection, {
      payment,
      userId: 11,
      amount: 50,
      requestKey: "booking-cancel-2",
    }),
    (error) => error.statusCode === 409 && /remaining refundable balance of 40.00/.test(error.message)
  );
});

test("processing a refund updates the ledger and restores loyalty once", async () => {
  const connection = refundConnection();
  const request = await createRefundRequest(connection, {
    payment,
    userId: 11,
    amount: 25,
    requestKey: "refund-once",
    loyaltyPointsToRestore: 8,
  });
  const refund = {
    ...connection.refunds[0],
    refund_number: request.refund_number,
  };

  assert.equal(await applyRefundOutcome(connection, refund, {
    status: "processed",
    externalReference: "bank-transfer-123",
    adminId: 7,
  }), true);
  assert.equal(await applyRefundOutcome(connection, { ...refund, status: "processed" }, {
    status: "processed",
  }), false);
  assert.equal(connection.payment.refunded_amount, 25);
  assert.equal(connection.ledger.length, 1);
  assert.equal(connection.loyalty.points, 8);
});
