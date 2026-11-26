const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PAYOUT_STATUS_ON_HOLD,
  PAYOUT_STATUS_PAID,
  PAYOUT_STATUS_PENDING,
  computePayoutTotals,
  normalizePayoutStatus,
  serializePayout,
  toDateKey,
} = require("../utils/settlements");

test("normalizePayoutStatus accepts known statuses only", () => {
  assert.equal(normalizePayoutStatus("PAID"), PAYOUT_STATUS_PAID);
  assert.equal(normalizePayoutStatus("hold", PAYOUT_STATUS_ON_HOLD), PAYOUT_STATUS_ON_HOLD);
});

test("toDateKey normalizes dates consistently", () => {
  assert.equal(toDateKey("2026-06-07T12:45:00Z"), "2026-06-07");
  assert.equal(toDateKey(new Date("2026-06-08T00:00:00Z")), "2026-06-08");
});

test("computePayoutTotals aggregates seller and platform amounts", () => {
  const totals = computePayoutTotals([
    {
      final_amount: 500,
      customer_final_amount: 540,
      convenience_fee: 40,
      platform_commission: 50,
      seller_net_amount: 450,
    },
    {
      final_amount: 300,
      customer_final_amount: 330,
      convenience_fee: 30,
      platform_commission: 36,
      seller_net_amount: 264,
    },
  ]);

  assert.equal(totals.bill_count, 2);
  assert.equal(totals.gross_service_amount, 800);
  assert.equal(totals.customer_total_amount, 870);
  assert.equal(totals.convenience_fee_amount, 70);
  assert.equal(totals.platform_commission_amount, 86);
  assert.equal(totals.seller_net_amount, 714);
});

test("serializePayout exposes rounded business payout values", () => {
  const payout = serializePayout({
    payout_id: "12",
    business_id: "5",
    status: "pending",
    bill_count: "4",
    gross_service_amount: "1200.256",
    customer_total_amount: "1310.25",
    convenience_fee_amount: "60.5",
    platform_commission_amount: "120.5",
    seller_net_amount: "1079.25",
    requested_by_admin_id: "9",
  });

  assert.equal(payout.payout_id, 12);
  assert.equal(payout.business_id, 5);
  assert.equal(payout.status, PAYOUT_STATUS_PENDING);
  assert.equal(payout.bill_count, 4);
  assert.equal(payout.gross_service_amount, 1200.26);
  assert.equal(payout.platform_take_amount, 181);
  assert.equal(payout.requested_by_admin_id, 9);
});
