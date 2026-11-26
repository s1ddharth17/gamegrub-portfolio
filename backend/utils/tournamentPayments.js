const { roundCurrency, toValidDate } = require("./billing");
const {
  normalizeBooleanFlag,
  TOURNAMENT_REFUND_POLICY_FULL,
  TOURNAMENT_REFUND_POLICY_NONE,
  TOURNAMENT_REFUND_POLICY_PARTIAL,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  normalizePositiveInteger,
  normalizeTournamentRefundPolicy,
} = require("./tournaments");

const ALLOWED_TOURNAMENT_PAYMENT_METHODS = new Set(["cash", "upi", "card", "wallet"]);

const TOURNAMENT_PAYMENT_STATUS_NOT_DUE = "not_due";
const TOURNAMENT_PAYMENT_STATUS_PENDING = "pending";
const TOURNAMENT_PAYMENT_STATUS_PAID = "paid";
const TOURNAMENT_PAYMENT_STATUS_WAIVED = "waived";
const TOURNAMENT_PAYMENT_STATUS_REFUNDED = "refunded";
const TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED = "partially_refunded";

const TOURNAMENT_PAYMENT_STATUSES = new Set([
  TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
  TOURNAMENT_PAYMENT_STATUS_PENDING,
  TOURNAMENT_PAYMENT_STATUS_PAID,
  TOURNAMENT_PAYMENT_STATUS_WAIVED,
  TOURNAMENT_PAYMENT_STATUS_REFUNDED,
  TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
]);

const TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE = "not_applicable";
const TOURNAMENT_REFUND_STATUS_REQUESTED = "requested";
const TOURNAMENT_REFUND_STATUS_PROCESSING = "processing";
const TOURNAMENT_REFUND_STATUS_REFUNDED = "refunded";
const TOURNAMENT_REFUND_STATUS_REJECTED = "rejected";

const TOURNAMENT_REFUND_STATUSES = new Set([
  TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
  TOURNAMENT_REFUND_STATUS_REQUESTED,
  TOURNAMENT_REFUND_STATUS_PROCESSING,
  TOURNAMENT_REFUND_STATUS_REFUNDED,
  TOURNAMENT_REFUND_STATUS_REJECTED,
]);

function normalizeTournamentPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ALLOWED_TOURNAMENT_PAYMENT_METHODS.has(normalized) ? normalized : "";
}

function normalizeTournamentPaymentReference(value) {
  const normalized = String(value || "").trim();
  return normalized.slice(0, 191);
}

function normalizeTournamentPaymentStatus(
  value,
  fallback = TOURNAMENT_PAYMENT_STATUS_PENDING
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_PAYMENT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentRefundStatus(
  value,
  fallback = TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_REFUND_STATUSES.has(normalized) ? normalized : fallback;
}

function buildTournamentRegistrationCharge({
  tournament = {},
  registration = {},
  payment = null,
  premiumAccess = undefined,
}) {
  const paymentPremiumAccess = normalizeBooleanFlag(payment?.premium_access, false);
  const tournamentPremiumEnabled =
    normalizeBooleanFlag(tournament?.is_premium, false) ||
    paymentPremiumAccess ||
    roundCurrency(payment?.premium_access_fee ?? 0) > 0;
  const requestedPremiumAccess =
    premiumAccess === undefined
      ? normalizeBooleanFlag(
          payment?.premium_access ?? registration?.premium_access,
          paymentPremiumAccess
        )
      : normalizeBooleanFlag(premiumAccess, false);
  const premiumEntryFee = roundCurrency(
    tournamentPremiumEnabled
      ? tournament?.premium_entry_fee ?? payment?.premium_access_fee ?? 0
      : 0
  );
  const premiumAccessFee =
    tournamentPremiumEnabled && requestedPremiumAccess && premiumEntryFee > 0
      ? premiumEntryFee
      : 0;
  const premiumAccessLabel =
    premiumAccessFee > 0
      ? String(
          tournament?.premium_label ||
            payment?.premium_access_label ||
            "Premium access"
        )
          .trim()
          .slice(0, 64)
      : "";
  const baseEntryFee = roundCurrency(
    tournament?.entry_fee ??
      registration?.entry_fee ??
      Math.max(0, roundCurrency(payment?.amount_due ?? 0) - roundCurrency(payment?.premium_access_fee ?? 0))
  );

  return {
    entry_fee: baseEntryFee,
    premium_access: premiumAccessFee > 0,
    premium_access_fee: premiumAccessFee,
    premium_access_label: premiumAccessLabel,
    amount_due: roundCurrency(baseEntryFee + premiumAccessFee),
  };
}

function computeTournamentRefundQuote({
  tournament,
  payment,
  referenceTime = new Date(),
}) {
  const paymentStatus = normalizeTournamentPaymentStatus(payment?.payment_status);
  const paidAmount = roundCurrency(payment?.amount_paid || 0);
  const processedRefundAmount = roundCurrency(payment?.refund_processed_amount || 0);
  const refundableBase = roundCurrency(Math.max(0, paidAmount - processedRefundAmount));

  if (
    ![
      TOURNAMENT_PAYMENT_STATUS_PAID,
      TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
    ].includes(paymentStatus) ||
    refundableBase <= 0
  ) {
    return {
      eligible: false,
      refundableAmount: 0,
      reason: "no_captured_payment",
    };
  }

  const tournamentStatus = String(tournament?.status || "").trim().toLowerCase();
  if (tournamentStatus === "cancelled") {
    return {
      eligible: true,
      refundableAmount: refundableBase,
      reason: "tournament_cancelled",
    };
  }

  const refundPolicy = normalizeTournamentRefundPolicy(
    tournament?.refund_policy,
    TOURNAMENT_REFUND_POLICY_NONE
  );

  if (refundPolicy === TOURNAMENT_REFUND_POLICY_NONE) {
    return {
      eligible: false,
      refundableAmount: 0,
      reason: "policy_disabled",
    };
  }

  const startAt = toValidDate(tournament?.start_at);
  const cutoffHours = normalizePositiveInteger(tournament?.refund_cutoff_hours, 24);
  const comparisonTime = toValidDate(referenceTime) || new Date();

  if (startAt) {
    const cutoffTime = new Date(startAt.getTime() - cutoffHours * 60 * 60 * 1000);
    if (comparisonTime > cutoffTime) {
      return {
        eligible: false,
        refundableAmount: 0,
        reason: "past_cutoff",
      };
    }
  }

  if (refundPolicy === TOURNAMENT_REFUND_POLICY_PARTIAL) {
    const refundPercentage = Math.min(
      100,
      Math.max(0, normalizePositiveInteger(tournament?.refund_percentage, 100))
    );

    return {
      eligible: refundPercentage > 0,
      refundableAmount: roundCurrency((refundableBase * refundPercentage) / 100),
      reason: "partial_policy",
    };
  }

  return {
    eligible: true,
    refundableAmount: refundableBase,
    reason: "full_policy",
  };
}

function buildTournamentPaymentSnapshot({
  tournament = {},
  registration = {},
  payment = null,
  referenceTime = new Date(),
}) {
  const registrationStatus = String(
    registration?.status || registration?.registration_status || ""
  )
    .trim()
    .toLowerCase();
  const charge = buildTournamentRegistrationCharge({
    tournament,
    registration,
    payment,
  });
  const fallbackPaymentStatus =
    charge.amount_due <= 0
      ? TOURNAMENT_PAYMENT_STATUS_WAIVED
      : registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
        ? TOURNAMENT_PAYMENT_STATUS_NOT_DUE
        : TOURNAMENT_PAYMENT_STATUS_PENDING;
  const paymentStatus = normalizeTournamentPaymentStatus(
    payment?.payment_status ?? registration?.payment_status,
    fallbackPaymentStatus
  );
  const amountDue = roundCurrency(payment?.amount_due ?? charge.amount_due);
  const amountPaid = roundCurrency(payment?.amount_paid ?? 0);
  const refundRequestedAmount = roundCurrency(payment?.refund_requested_amount ?? 0);
  const refundProcessedAmount = roundCurrency(payment?.refund_processed_amount ?? 0);
  const refundStatus = normalizeTournamentRefundStatus(payment?.refund_status);
  const refundQuote = computeTournamentRefundQuote({
    tournament,
    payment: {
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      refund_processed_amount: refundProcessedAmount,
    },
    referenceTime,
  });

  let outstandingAmount = roundCurrency(Math.max(0, amountDue - amountPaid));
  if (
    [
      TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
      TOURNAMENT_PAYMENT_STATUS_PAID,
      TOURNAMENT_PAYMENT_STATUS_WAIVED,
      TOURNAMENT_PAYMENT_STATUS_REFUNDED,
      TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
    ].includes(paymentStatus)
  ) {
    outstandingAmount = 0;
  }

  return {
    payment_status: paymentStatus,
    payment_method: normalizeTournamentPaymentMethod(payment?.payment_method),
    payment_reference: normalizeTournamentPaymentReference(payment?.payment_reference),
    payment_notes: String(payment?.payment_notes || "").trim(),
    premium_access: charge.premium_access,
    premium_access_fee: charge.premium_access_fee,
    premium_access_label: charge.premium_access_label,
    amount_due: amountDue,
    amount_paid: amountPaid,
    outstanding_amount: outstandingAmount,
    paid_at: payment?.paid_at || null,
    refund_status: refundStatus,
    refund_requested_amount: refundRequestedAmount,
    refund_processed_amount: refundProcessedAmount,
    refund_requested_at: payment?.refund_requested_at || null,
    refund_processed_at: payment?.refund_processed_at || null,
    refund_notes: String(payment?.refund_notes || "").trim(),
    refund_eligible: refundQuote.eligible,
    refundable_amount: refundQuote.refundableAmount,
  };
}

module.exports = {
  ALLOWED_TOURNAMENT_PAYMENT_METHODS,
  TOURNAMENT_PAYMENT_STATUSES,
  TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
  TOURNAMENT_PAYMENT_STATUS_PAID,
  TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
  TOURNAMENT_PAYMENT_STATUS_PENDING,
  TOURNAMENT_PAYMENT_STATUS_REFUNDED,
  TOURNAMENT_PAYMENT_STATUS_WAIVED,
  TOURNAMENT_REFUND_STATUSES,
  TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
  TOURNAMENT_REFUND_STATUS_PROCESSING,
  TOURNAMENT_REFUND_STATUS_REFUNDED,
  TOURNAMENT_REFUND_STATUS_REJECTED,
  TOURNAMENT_REFUND_STATUS_REQUESTED,
  buildTournamentRegistrationCharge,
  buildTournamentPaymentSnapshot,
  computeTournamentRefundQuote,
  normalizeTournamentPaymentMethod,
  normalizeTournamentPaymentReference,
  normalizeTournamentPaymentStatus,
  normalizeTournamentRefundStatus,
};
