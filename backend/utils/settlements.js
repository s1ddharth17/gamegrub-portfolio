const { roundCurrency } = require("./billing");
const { query, withTransaction } = require("./db");
const { normalizeBusinessId } = require("./businesses");

const PAYOUT_STATUS_PENDING = "pending";
const PAYOUT_STATUS_PROCESSING = "processing";
const PAYOUT_STATUS_PAID = "paid";
const PAYOUT_STATUS_ON_HOLD = "on_hold";
const PAYOUT_STATUSES = new Set([
  PAYOUT_STATUS_PENDING,
  PAYOUT_STATUS_PROCESSING,
  PAYOUT_STATUS_PAID,
  PAYOUT_STATUS_ON_HOLD,
]);

const PAYOUT_NOTES_MAX_LENGTH = 400;
const PAYOUT_REFERENCE_MAX_LENGTH = 120;

function selectRows(executor, sql, params = []) {
  if (executor && typeof executor.query === "function") {
    return executor.query(sql, params).then((result) =>
      Array.isArray(result?.[0]) ? result[0] : result
    );
  }

  return query(sql, params);
}

function normalizePayoutStatus(value, fallback = PAYOUT_STATUS_PENDING) {
  const normalized = String(value || "").trim().toLowerCase();
  return PAYOUT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizePayoutNotes(value, fallback = "") {
  return String(value || fallback)
    .trim()
    .slice(0, PAYOUT_NOTES_MAX_LENGTH);
}

function normalizePayoutReference(value, fallback = "") {
  return String(value || fallback)
    .trim()
    .slice(0, PAYOUT_REFERENCE_MAX_LENGTH);
}

function toDateKey(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function computePayoutTotals(sourceRows = []) {
  return sourceRows.reduce(
    (totals, row) => ({
      bill_count: totals.bill_count + 1,
      customer_total_amount: totals.customer_total_amount + Number(row.customer_final_amount || 0),
      convenience_fee_amount: totals.convenience_fee_amount + Number(row.convenience_fee || 0),
      platform_commission_amount:
        totals.platform_commission_amount + Number(row.platform_commission || 0),
      seller_net_amount: totals.seller_net_amount + Number(row.seller_net_amount || 0),
      gross_service_amount: totals.gross_service_amount + Number(row.final_amount || 0),
    }),
    {
      bill_count: 0,
      customer_total_amount: 0,
      convenience_fee_amount: 0,
      platform_commission_amount: 0,
      seller_net_amount: 0,
      gross_service_amount: 0,
    }
  );
}

function serializePayout(row) {
  if (!row) {
    return null;
  }

  return {
    payout_id: Number(row.payout_id || 0),
    business_id: normalizeBusinessId(row.business_id, 0),
    status: normalizePayoutStatus(row.status),
    period_start: row.period_start || null,
    period_end: row.period_end || null,
    bill_count: Number(row.bill_count || 0),
    gross_service_amount: roundCurrency(row.gross_service_amount || 0),
    customer_total_amount: roundCurrency(row.customer_total_amount || 0),
    convenience_fee_amount: roundCurrency(row.convenience_fee_amount || 0),
    platform_commission_amount: roundCurrency(row.platform_commission_amount || 0),
    platform_take_amount: roundCurrency(
      Number(row.platform_take_amount || 0) ||
        Number(row.convenience_fee_amount || 0) + Number(row.platform_commission_amount || 0)
    ),
    seller_net_amount: roundCurrency(row.seller_net_amount || 0),
    payout_reference: row.payout_reference || "",
    notes: row.notes || "",
    requested_by_admin_id: row.requested_by_admin_id ? Number(row.requested_by_admin_id) : null,
    requested_by_name: row.requested_by_name || "",
    paid_by_admin_id: row.paid_by_admin_id ? Number(row.paid_by_admin_id) : null,
    paid_by_name: row.paid_by_name || "",
    requested_at: row.requested_at || null,
    processing_at: row.processing_at || null,
    paid_at: row.paid_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function getSettlementSummary({ businessId }) {
  const normalizedBusinessId = normalizeBusinessId(businessId, 0);

  if (!normalizedBusinessId) {
    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  const [lifetimeRows, unsettledRows, payoutRows] = await Promise.all([
    query(
      `
        SELECT
          COUNT(*) AS settled_bill_count,
          COALESCE(SUM(final_amount), 0) AS gross_service_amount,
          COALESCE(SUM(customer_final_amount), 0) AS customer_total_amount,
          COALESCE(SUM(convenience_fee), 0) AS convenience_fee_amount,
          COALESCE(SUM(platform_commission), 0) AS platform_commission_amount,
          COALESCE(SUM(seller_net_amount), 0) AS seller_net_amount,
          MIN(DATE(created_at)) AS first_bill_at,
          MAX(created_at) AS latest_bill_at
        FROM bills
        WHERE business_id = ?
      `,
      [normalizedBusinessId]
    ),
    query(
      `
        SELECT
          COUNT(*) AS unsettled_bill_count,
          COALESCE(SUM(seller_net_amount), 0) AS unsettled_seller_net_amount,
          COALESCE(SUM(platform_commission), 0) AS unsettled_platform_commission_amount,
          COALESCE(SUM(convenience_fee), 0) AS unsettled_convenience_fee_amount,
          MIN(DATE(created_at)) AS earliest_unsettled_at,
          MAX(created_at) AS latest_unsettled_at
        FROM bills
        WHERE business_id = ?
        AND payout_id IS NULL
      `,
      [normalizedBusinessId]
    ),
    query(
      `
        SELECT
          status,
          COUNT(*) AS payout_count,
          COALESCE(SUM(seller_net_amount), 0) AS seller_net_amount,
          MAX(paid_at) AS latest_paid_at
        FROM business_payouts
        WHERE business_id = ?
        GROUP BY status
      `,
      [normalizedBusinessId]
    ),
  ]);

  const lifetime = lifetimeRows[0] || {};
  const unsettled = unsettledRows[0] || {};
  const payoutBuckets = {
    pending_payout_count: 0,
    pending_payout_amount: 0,
    processing_payout_count: 0,
    processing_payout_amount: 0,
    on_hold_payout_count: 0,
    on_hold_payout_amount: 0,
    paid_payout_count: 0,
    paid_payout_amount: 0,
    latest_paid_at: null,
  };

  for (const row of payoutRows) {
    const status = normalizePayoutStatus(row.status);
    const amount = Number(row.seller_net_amount || 0);
    const count = Number(row.payout_count || 0);

    if (status === PAYOUT_STATUS_PENDING) {
      payoutBuckets.pending_payout_count += count;
      payoutBuckets.pending_payout_amount += amount;
    } else if (status === PAYOUT_STATUS_PROCESSING) {
      payoutBuckets.processing_payout_count += count;
      payoutBuckets.processing_payout_amount += amount;
    } else if (status === PAYOUT_STATUS_ON_HOLD) {
      payoutBuckets.on_hold_payout_count += count;
      payoutBuckets.on_hold_payout_amount += amount;
    } else if (status === PAYOUT_STATUS_PAID) {
      payoutBuckets.paid_payout_count += count;
      payoutBuckets.paid_payout_amount += amount;
      payoutBuckets.latest_paid_at = row.latest_paid_at || payoutBuckets.latest_paid_at;
    }
  }

  const platformCommissionAmount = Number(lifetime.platform_commission_amount || 0);
  const convenienceFeeAmount = Number(lifetime.convenience_fee_amount || 0);

  return {
    business_id: normalizedBusinessId,
    settled_bill_count: Number(lifetime.settled_bill_count || 0),
    gross_service_amount: roundCurrency(lifetime.gross_service_amount || 0),
    customer_total_amount: roundCurrency(lifetime.customer_total_amount || 0),
    convenience_fee_amount: roundCurrency(convenienceFeeAmount),
    platform_commission_amount: roundCurrency(platformCommissionAmount),
    platform_take_amount: roundCurrency(platformCommissionAmount + convenienceFeeAmount),
    seller_net_amount: roundCurrency(lifetime.seller_net_amount || 0),
    unsettled_bill_count: Number(unsettled.unsettled_bill_count || 0),
    unsettled_seller_net_amount: roundCurrency(unsettled.unsettled_seller_net_amount || 0),
    unsettled_platform_commission_amount: roundCurrency(
      unsettled.unsettled_platform_commission_amount || 0
    ),
    unsettled_convenience_fee_amount: roundCurrency(
      unsettled.unsettled_convenience_fee_amount || 0
    ),
    earliest_unsettled_at: unsettled.earliest_unsettled_at || null,
    latest_unsettled_at: unsettled.latest_unsettled_at || null,
    pending_payout_count: payoutBuckets.pending_payout_count,
    pending_payout_amount: roundCurrency(payoutBuckets.pending_payout_amount),
    processing_payout_count: payoutBuckets.processing_payout_count,
    processing_payout_amount: roundCurrency(payoutBuckets.processing_payout_amount),
    on_hold_payout_count: payoutBuckets.on_hold_payout_count,
    on_hold_payout_amount: roundCurrency(payoutBuckets.on_hold_payout_amount),
    paid_payout_count: payoutBuckets.paid_payout_count,
    paid_payout_amount: roundCurrency(payoutBuckets.paid_payout_amount),
    latest_paid_at: payoutBuckets.latest_paid_at,
    first_bill_at: lifetime.first_bill_at || null,
    latest_bill_at: lifetime.latest_bill_at || null,
  };
}

async function listBusinessPayouts({ businessId, limit = 12 }) {
  const normalizedBusinessId = normalizeBusinessId(businessId, 0);

  if (!normalizedBusinessId) {
    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  const rows = await query(
    `
      SELECT
        bp.*,
        requester.name AS requested_by_name,
        paid_by.name AS paid_by_name,
        (COALESCE(bp.platform_commission_amount, 0) + COALESCE(bp.convenience_fee_amount, 0))
          AS platform_take_amount
      FROM business_payouts bp
      LEFT JOIN admin requester ON requester.id = bp.requested_by_admin_id
      LEFT JOIN admin paid_by ON paid_by.id = bp.paid_by_admin_id
      WHERE bp.business_id = ?
      ORDER BY bp.requested_at DESC, bp.payout_id DESC
      LIMIT ?
    `,
    [normalizedBusinessId, safeLimit]
  );

  return rows.map(serializePayout);
}

async function getBusinessPayoutById({ payoutId }, executor = null) {
  const normalizedPayoutId = Number(payoutId || 0);

  if (!normalizedPayoutId) {
    const error = new Error("payout_id required");
    error.statusCode = 400;
    throw error;
  }

  const rows = await selectRows(
    executor,
    `
      SELECT
        bp.*,
        requester.name AS requested_by_name,
        paid_by.name AS paid_by_name,
        (COALESCE(bp.platform_commission_amount, 0) + COALESCE(bp.convenience_fee_amount, 0))
          AS platform_take_amount
      FROM business_payouts bp
      LEFT JOIN admin requester ON requester.id = bp.requested_by_admin_id
      LEFT JOIN admin paid_by ON paid_by.id = bp.paid_by_admin_id
      WHERE bp.payout_id = ?
      LIMIT 1
    `,
    [normalizedPayoutId]
  );

  return rows[0] ? serializePayout(rows[0]) : null;
}

async function createBusinessPayoutRequest({
  businessId,
  requestedByAdminId,
  cutoffDate = null,
  notes = "",
}) {
  const normalizedBusinessId = normalizeBusinessId(businessId, 0);
  const normalizedRequesterId = Number(requestedByAdminId || 0) || null;
  const normalizedCutoffDate = toDateKey(cutoffDate) || toDateKey(new Date());
  const normalizedNotes = normalizePayoutNotes(notes);

  if (!normalizedBusinessId) {
    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(async (connection) => {
    const [settingsRows] = await connection.query(
      `SELECT minimum_payout_amount
       FROM business_payout_settings
       WHERE business_id = ?
       LIMIT 1`,
      [normalizedBusinessId]
    );
    const minimumPayoutAmount = Number(settingsRows[0]?.minimum_payout_amount || 0);

    const billRows = await selectRows(
      connection,
      `
        SELECT
          bill_id,
          final_amount,
          customer_final_amount,
          convenience_fee,
          platform_commission,
          seller_net_amount,
          created_at
        FROM bills
        WHERE business_id = ?
        AND payout_id IS NULL
        AND DATE(created_at) <= ?
        ORDER BY created_at ASC, bill_id ASC
      `,
      [normalizedBusinessId, normalizedCutoffDate]
    );

    if (!billRows.length) {
      const error = new Error("No unsettled bills are ready for payout.");
      error.statusCode = 400;
      throw error;
    }

    const totals = computePayoutTotals(billRows);
    if (totals.seller_net_amount < minimumPayoutAmount) {
      const error = new Error(
        `Payout requests require at least ${minimumPayoutAmount.toFixed(2)} in seller proceeds.`
      );
      error.statusCode = 400;
      throw error;
    }
    const firstBillDate = toDateKey(billRows[0].created_at) || normalizedCutoffDate;
    const lastBillDate =
      toDateKey(billRows[billRows.length - 1].created_at) || normalizedCutoffDate;

    const [insertResult] = await connection.query(
      `
        INSERT INTO business_payouts (
          business_id,
          status,
          period_start,
          period_end,
          bill_count,
          gross_service_amount,
          customer_total_amount,
          convenience_fee_amount,
          platform_commission_amount,
          seller_net_amount,
          requested_by_admin_id,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedBusinessId,
        PAYOUT_STATUS_PENDING,
        firstBillDate,
        lastBillDate,
        totals.bill_count,
        roundCurrency(totals.gross_service_amount),
        roundCurrency(totals.customer_total_amount),
        roundCurrency(totals.convenience_fee_amount),
        roundCurrency(totals.platform_commission_amount),
        roundCurrency(totals.seller_net_amount),
        normalizedRequesterId,
        normalizedNotes,
      ]
    );

    const payoutId = Number(insertResult.insertId || 0);
    const billIds = billRows.map((row) => Number(row.bill_id || 0)).filter(Boolean);

    await connection.query("UPDATE bills SET payout_id = ? WHERE bill_id IN (?)", [
      payoutId,
      billIds,
    ]);

    return getBusinessPayoutById({ payoutId }, connection);
  });
}

async function updateBusinessPayoutStatus({
  payoutId,
  status,
  paidByAdminId = null,
  payoutReference = "",
  notes = "",
}) {
  const normalizedStatus = normalizePayoutStatus(status, "");
  const normalizedReference = normalizePayoutReference(payoutReference);
  const normalizedNotes = normalizePayoutNotes(notes);
  const normalizedPaidByAdminId = Number(paidByAdminId || 0) || null;

  if (!normalizedStatus) {
    const error = new Error("Valid payout status required.");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(async (connection) => {
    const currentPayout = await getBusinessPayoutById({ payoutId }, connection);

    if (!currentPayout) {
      const error = new Error("Payout not found.");
      error.statusCode = 404;
      throw error;
    }

    await connection.query(
      `
        UPDATE business_payouts
        SET
          status = ?,
          payout_reference = CASE
            WHEN ? <> '' THEN ?
            ELSE payout_reference
          END,
          notes = CASE
            WHEN ? <> '' THEN ?
            ELSE notes
          END,
          processing_at = CASE
            WHEN ? = '${PAYOUT_STATUS_PROCESSING}' AND processing_at IS NULL THEN NOW()
            WHEN ? <> '${PAYOUT_STATUS_PROCESSING}' THEN processing_at
            ELSE processing_at
          END,
          paid_at = CASE
            WHEN ? = '${PAYOUT_STATUS_PAID}' THEN NOW()
            WHEN ? <> '${PAYOUT_STATUS_PAID}' THEN NULL
            ELSE paid_at
          END,
          paid_by_admin_id = CASE
            WHEN ? = '${PAYOUT_STATUS_PAID}' THEN ?
            WHEN ? <> '${PAYOUT_STATUS_PAID}' THEN NULL
            ELSE paid_by_admin_id
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE payout_id = ?
      `,
      [
        normalizedStatus,
        normalizedReference,
        normalizedReference,
        normalizedNotes,
        normalizedNotes,
        normalizedStatus,
        normalizedStatus,
        normalizedStatus,
        normalizedStatus,
        normalizedStatus,
        normalizedPaidByAdminId,
        normalizedStatus,
        Number(payoutId || 0),
      ]
    );

    return getBusinessPayoutById({ payoutId }, connection);
  });
}

module.exports = {
  PAYOUT_STATUS_ON_HOLD,
  PAYOUT_STATUS_PAID,
  PAYOUT_STATUS_PENDING,
  PAYOUT_STATUS_PROCESSING,
  computePayoutTotals,
  createBusinessPayoutRequest,
  getBusinessPayoutById,
  getSettlementSummary,
  listBusinessPayouts,
  normalizePayoutNotes,
  normalizePayoutReference,
  normalizePayoutStatus,
  serializePayout,
  toDateKey,
  updateBusinessPayoutStatus,
};
