const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
  TOURNAMENT_PAYMENT_STATUS_PAID,
  TOURNAMENT_PAYMENT_STATUS_PENDING,
  TOURNAMENT_PAYMENT_STATUS_WAIVED,
  TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
  buildTournamentPaymentSnapshot,
  computeTournamentRefundQuote,
  normalizeTournamentPaymentMethod,
  normalizeTournamentPaymentStatus,
  normalizeTournamentRefundStatus,
} = require("../utils/tournamentPayments");

test("tournament payment normalizers fall back safely", () => {
  assert.equal(normalizeTournamentPaymentMethod("UPI"), "upi");
  assert.equal(normalizeTournamentPaymentMethod("mystery"), "");
  assert.equal(normalizeTournamentPaymentStatus("PAID"), "paid");
  assert.equal(normalizeTournamentPaymentStatus("mystery"), "pending");
  assert.equal(normalizeTournamentRefundStatus("REQUESTED"), "requested");
  assert.equal(normalizeTournamentRefundStatus("mystery"), "not_applicable");
});

test("computeTournamentRefundQuote honors refund policy windows", () => {
  const tournament = {
    status: "published",
    start_at: "2026-05-10T18:00:00.000Z",
    refund_policy: "partial_before_cutoff",
    refund_cutoff_hours: 24,
    refund_percentage: 50,
  };

  const eligibleQuote = computeTournamentRefundQuote({
    tournament,
    payment: {
      payment_status: TOURNAMENT_PAYMENT_STATUS_PAID,
      amount_paid: 400,
      refund_processed_amount: 0,
    },
    referenceTime: new Date("2026-05-08T12:00:00.000Z"),
  });

  assert.equal(eligibleQuote.eligible, true);
  assert.equal(eligibleQuote.refundableAmount, 200);

  const expiredQuote = computeTournamentRefundQuote({
    tournament,
    payment: {
      payment_status: TOURNAMENT_PAYMENT_STATUS_PAID,
      amount_paid: 400,
      refund_processed_amount: 0,
    },
    referenceTime: new Date("2026-05-10T12:30:00.000Z"),
  });

  assert.equal(expiredQuote.eligible, false);
  assert.equal(expiredQuote.refundableAmount, 0);
});

test("buildTournamentPaymentSnapshot derives default paid and waitlist states", () => {
  const waitlistSnapshot = buildTournamentPaymentSnapshot({
    tournament: {
      entry_fee: 299,
      status: "published",
      start_at: "2026-05-10T18:00:00.000Z",
      refund_policy: "no_refunds",
      refund_cutoff_hours: 24,
      refund_percentage: 100,
    },
    registration: {
      status: "waitlisted",
    },
  });

  assert.equal(waitlistSnapshot.payment_status, TOURNAMENT_PAYMENT_STATUS_NOT_DUE);
  assert.equal(waitlistSnapshot.outstanding_amount, 0);
  assert.equal(waitlistSnapshot.refund_status, TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE);

  const paidSnapshot = buildTournamentPaymentSnapshot({
    tournament: {
      entry_fee: 500,
      status: "published",
      start_at: "2026-05-10T18:00:00.000Z",
      refund_policy: "full_before_cutoff",
      refund_cutoff_hours: 24,
      refund_percentage: 100,
    },
    registration: {
      status: "registered",
    },
    payment: {
      payment_status: "paid",
      amount_due: 500,
      amount_paid: 500,
    },
    referenceTime: new Date("2026-05-08T12:00:00.000Z"),
  });

  assert.equal(paidSnapshot.payment_status, TOURNAMENT_PAYMENT_STATUS_PAID);
  assert.equal(paidSnapshot.outstanding_amount, 0);
  assert.equal(paidSnapshot.refund_eligible, true);
  assert.equal(paidSnapshot.refundable_amount, 500);

  const waivedSnapshot = buildTournamentPaymentSnapshot({
    tournament: {
      entry_fee: 0,
      status: "published",
      refund_policy: "no_refunds",
    },
    registration: {
      status: "registered",
    },
  });

  assert.equal(waivedSnapshot.payment_status, TOURNAMENT_PAYMENT_STATUS_WAIVED);
  assert.equal(waivedSnapshot.outstanding_amount, 0);

  const pendingSnapshot = buildTournamentPaymentSnapshot({
    tournament: {
      entry_fee: 250,
      status: "published",
      refund_policy: "no_refunds",
    },
    registration: {
      status: "registered",
    },
  });

  assert.equal(pendingSnapshot.payment_status, TOURNAMENT_PAYMENT_STATUS_PENDING);
  assert.equal(pendingSnapshot.outstanding_amount, 250);
});

test("buildTournamentPaymentSnapshot includes premium access fees in the registration due amount", () => {
  const snapshot = buildTournamentPaymentSnapshot({
    tournament: {
      entry_fee: 250,
      is_premium: 1,
      premium_entry_fee: 99,
      premium_label: "VIP pass",
      status: "published",
      refund_policy: "no_refunds",
    },
    registration: {
      status: "registered",
      premium_access: true,
    },
  });

  assert.equal(snapshot.premium_access, true);
  assert.equal(snapshot.premium_access_fee, 99);
  assert.equal(snapshot.premium_access_label, "VIP pass");
  assert.equal(snapshot.amount_due, 349);
  assert.equal(snapshot.outstanding_amount, 349);
});
