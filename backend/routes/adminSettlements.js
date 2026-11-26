const express = require("express");
const { randomUUID } = require("node:crypto");

const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const {
  createBusinessPayoutRequest,
  getBusinessPayoutById,
  getSettlementSummary,
  listBusinessPayouts,
  normalizePayoutStatus,
  updateBusinessPayoutStatus,
} = require("../utils/settlements");
const { query, withTransaction } = require("../utils/db");
const razorpay = require("../utils/razorpay");
const { roundCurrency } = require("../utils/billing");
const { applyRefundOutcome } = require("../utils/paymentRefunds");
const { recordPaymentTransaction, normalizePaymentChannel } = require("../utils/paymentLedger");

function parseLimit(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function registerAdminSettlementRoutes(router) {
  router.get(
    "/refunds",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
        const requestedStatus = String(req.query?.status || "open").trim().toLowerCase();
        const statusClause = requestedStatus === "all" ? "" : "AND r.status IN ('requested', 'processing', 'failed')";
        const rows = await query(
          `
            SELECT r.refund_id, r.refund_number, r.payment_id, r.booking_id, r.order_id,
              r.user_id, r.provider_payment_id, r.refund_method, r.requested_amount,
              r.processed_amount, r.status, r.reason, r.admin_note, r.outcome_message,
              r.failure_description, r.requested_at, r.processed_at,
              u.name AS user_name, u.mobile, p.payment_method, p.payment_reference,
              p.receipt_number AS payment_receipt_number, p.captured_amount,
              o.total_amount AS order_total
            FROM payment_refunds r
            JOIN users u ON u.uid = r.user_id
            JOIN payments p ON p.payment_id = r.payment_id
            LEFT JOIN orders o ON o.order_id = r.order_id
            WHERE r.business_id = ? ${statusClause}
            ORDER BY FIELD(r.status, 'requested', 'failed', 'processing', 'processed', 'rejected'), r.requested_at ASC
            LIMIT 100
          `,
          [businessId]
        );
        res.json(rows.map((row) => ({
          ...row,
          requested_amount: roundCurrency(row.requested_amount),
          processed_amount: roundCurrency(row.processed_amount),
          captured_amount: roundCurrency(row.captured_amount),
          order_total: row.order_total == null ? null : roundCurrency(row.order_total),
        })));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/refunds/:id/process",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      const action = String(req.body?.action || "process").trim().toLowerCase();
      const adminNote = String(req.body?.note || "").trim().slice(0, 500);
      try {
        const refundRows = await query(
          `SELECT * FROM payment_refunds WHERE refund_id = ? LIMIT 1`,
          [req.params.id]
        );
        const refund = refundRows[0];
        if (!refund) return res.status(404).json({ error: "Refund request not found." });
        await requireAdminBusinessAccess(req.admin, Number(refund.business_id || 0));

        if (action === "reject") {
          if (!adminNote) return res.status(400).json({ error: "A reason is required when declining a refund." });
          const updated = await withTransaction(async (connection) => {
            const [lockedRows] = await connection.query(
              `SELECT * FROM payment_refunds WHERE refund_id = ? LIMIT 1 FOR UPDATE`,
              [req.params.id]
            );
            const locked = lockedRows[0];
            if (!locked || locked.status === "processed") {
              const error = new Error("This refund can no longer be declined.");
              error.statusCode = 409;
              throw error;
            }
            await applyRefundOutcome(connection, locked, {
              status: "rejected",
              failureDescription: adminNote,
              adminId: req.admin?.id,
            });
            return { ...locked, status: "rejected", outcome_message: adminNote };
          });
          return res.json({ refund: updated, message: updated.outcome_message });
        }

        if (action !== "process") return res.status(400).json({ error: "action must be process or reject." });
        if (!["requested", "failed"].includes(refund.status)) {
          return res.status(409).json({ error: "This refund is already being processed or has a final outcome." });
        }

        if (refund.refund_method === "razorpay") {
          if (!refund.provider_payment_id) return res.status(409).json({ error: "Razorpay payment reference is missing." });
          await withTransaction(async (connection) => {
            await connection.query(
              `UPDATE payment_refunds SET status = 'processing', processed_by_admin_id = ?,
                admin_note = ?, outcome_message = 'Refund sent to the payment provider and is processing.',
                failure_description = NULL WHERE refund_id = ? AND status IN ('requested', 'failed')`,
              [req.admin?.id || null, adminNote || null, req.params.id]
            );
          });
          try {
            const providerRefund = await razorpay.createRefund({
              paymentId: refund.provider_payment_id,
              amountPaise: Math.round(Number(refund.requested_amount) * 100),
              idempotencyKey: refund.refund_id,
              receipt: refund.refund_number,
              notes: { gamegrub_refund_id: refund.refund_id },
            });
            const updated = await withTransaction(async (connection) => {
              const [lockedRows] = await connection.query(
                `SELECT * FROM payment_refunds WHERE refund_id = ? LIMIT 1 FOR UPDATE`,
                [req.params.id]
              );
              const locked = lockedRows[0];
              await applyRefundOutcome(connection, locked, {
                status: providerRefund.status,
                providerRefundId: providerRefund.id,
                adminId: req.admin?.id,
              });
              return { ...locked, status: providerRefund.status === "processed" ? "processed" : "processing",
                provider_refund_id: providerRefund.id };
            });
            return res.json({ refund: updated, message: updated.outcome_message || "Refund submitted to Razorpay." });
          } catch (providerError) {
            const message = String(providerError.message || "Razorpay could not process the refund.").slice(0, 500);
            await withTransaction(async (connection) => {
              const [lockedRows] = await connection.query(
                `SELECT * FROM payment_refunds WHERE refund_id = ? LIMIT 1 FOR UPDATE`,
                [req.params.id]
              );
              if (lockedRows[0]) {
                await applyRefundOutcome(connection, lockedRows[0], {
                  status: "failed",
                  failureDescription: message,
                  adminId: req.admin?.id,
                });
              }
            });
            return res.status(502).json({ error: message });
          }
        }

        const reference = String(req.body?.reference || "").trim().slice(0, 120);
        if (!adminNote || !reference) {
          return res.status(400).json({ error: "Add an audit note and transfer reference to record an offline refund." });
        }
        const updated = await withTransaction(async (connection) => {
          const [lockedRows] = await connection.query(
            `SELECT * FROM payment_refunds WHERE refund_id = ? LIMIT 1 FOR UPDATE`,
            [req.params.id]
          );
          const locked = lockedRows[0];
          if (!locked || !["requested", "failed"].includes(locked.status)) {
            const error = new Error("This refund is already being processed or has a final outcome.");
            error.statusCode = 409;
            throw error;
          }
          await applyRefundOutcome(connection, locked, {
            status: "processed",
            externalReference: `${reference} | ${adminNote}`,
            adminId: req.admin?.id,
          });
          return { ...locked, status: "processed", outcome_message: "Offline refund recorded." };
        });
        return res.json({ refund: updated, message: updated.outcome_message });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.get(
    "/reconciliation",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
        const conditions = ["p.business_id = ?"];
        const params = [businessId];
        const method = String(req.query?.method || "").trim().toLowerCase();
        if (method && method !== "all") {
          conditions.push("p.payment_method = ?");
          params.push(method);
        }
        const from = String(req.query?.from || "").trim();
        const to = String(req.query?.to || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
          conditions.push("p.created_at >= ?");
          params.push(`${from} 00:00:00`);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          conditions.push("p.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
          params.push(`${to} 00:00:00`);
        }
        const rows = await query(
          `
            SELECT p.payment_id, p.receipt_number, p.booking_id, p.payment_method,
              p.payment_reference, p.status, p.captured_amount, p.refunded_amount,
              p.gateway_status, p.created_at, u.name AS user_name,
              COALESCE(tx.ledger_captured, 0) AS ledger_captured,
              COALESCE(tx.ledger_refunded, 0) AS ledger_refunded,
              COALESCE(tx.adjustment_total, 0) AS adjustment_total,
              COALESCE(tx.razorpay_ledger, 0) AS razorpay_ledger,
              COALESCE(pa.gateway_captured, 0) AS gateway_captured,
              COALESCE(pa.expired_attempts, 0) AS expired_attempts,
              COALESCE(pa.review_attempts, 0) AS review_attempts,
              COALESCE(r.open_refunds, 0) AS open_refunds,
              COALESCE(r.failed_refunds, 0) AS failed_refunds,
              (SELECT n.note FROM finance_reconciliation_notes n
               WHERE n.business_id = p.business_id AND n.entity_type = 'payment'
                 AND n.entity_id = CAST(p.payment_id AS CHAR)
               ORDER BY n.note_id DESC LIMIT 1) AS last_audit_note
            FROM payments p
            JOIN booking b ON b.booking_id = p.booking_id
            JOIN users u ON u.uid = b.user_id
            LEFT JOIN (
              SELECT payment_id,
                SUM(CASE WHEN kind = 'capture' THEN amount ELSE 0 END) AS ledger_captured,
                SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END) AS ledger_refunded,
                SUM(CASE WHEN kind = 'adjustment' THEN amount ELSE 0 END) AS adjustment_total,
                SUM(CASE WHEN channel = 'razorpay' AND kind = 'capture' THEN amount ELSE 0 END) AS razorpay_ledger
              FROM payment_transactions GROUP BY payment_id
            ) tx ON tx.payment_id = p.payment_id
            LEFT JOIN (
              SELECT payment_id,
                SUM(CASE WHEN status = 'captured' THEN amount_paise / 100 ELSE 0 END) AS gateway_captured,
                SUM(CASE WHEN status IN ('creating_order', 'pending') AND checkout_expires_at < NOW() THEN 1 ELSE 0 END) AS expired_attempts,
                SUM(CASE WHEN status = 'captured_review' THEN 1 ELSE 0 END) AS review_attempts
              FROM payment_attempts GROUP BY payment_id
            ) pa ON pa.payment_id = p.payment_id
            LEFT JOIN (
              SELECT payment_id,
                SUM(CASE WHEN status IN ('requested', 'processing') THEN 1 ELSE 0 END) AS open_refunds,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_refunds
              FROM payment_refunds GROUP BY payment_id
            ) r ON r.payment_id = p.payment_id
            WHERE ${conditions.join(" AND ")}
            ORDER BY p.created_at DESC
            LIMIT 250
          `,
          params
        );
        const unresolvedOnly = String(req.query?.status || "unresolved").trim().toLowerCase() !== "all";
        const results = rows.map((row) => {
          const reasons = [];
          const captured = Number(row.captured_amount || 0);
          const refunded = Number(row.refunded_amount || 0);
          const ledgerCaptured = Number(row.ledger_captured || 0) + Number(row.adjustment_total || 0);
          const ledgerRefunded = Number(row.ledger_refunded || 0);
          if (!row.receipt_number) reasons.push("missing_payment_receipt");
          if (Math.abs(captured - ledgerCaptured) > 0.01) reasons.push("captured_ledger_mismatch");
          if (Math.abs(Number(row.gateway_captured || 0) - Number(row.razorpay_ledger || 0)) > 0.01) reasons.push("gateway_ledger_mismatch");
          if (Math.abs(refunded - ledgerRefunded) > 0.01) reasons.push("refund_ledger_mismatch");
          if (Number(row.open_refunds || 0)) reasons.push("refund_in_progress");
          if (Number(row.failed_refunds || 0)) reasons.push("refund_failed");
          if (Number(row.expired_attempts || 0)) reasons.push("expired_checkout_attempt");
          if (Number(row.review_attempts || 0)) reasons.push("provider_review_required");
          return {
            ...row,
            captured_amount: roundCurrency(captured),
            refunded_amount: roundCurrency(refunded),
            ledger_captured: roundCurrency(ledgerCaptured),
            ledger_refunded: roundCurrency(ledgerRefunded),
            gateway_captured: roundCurrency(row.gateway_captured),
            reasons,
            unresolved: reasons.length > 0,
          };
        });
        res.json(unresolvedOnly ? results.filter((row) => row.unresolved) : results);
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/reconciliation/notes",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const entityType = String(req.body?.entity_type || "").trim().toLowerCase();
        const entityId = String(req.body?.entity_id || "").trim().slice(0, 64);
        const note = String(req.body?.note || "").trim().slice(0, 1000);
        if (!["payment", "refund"].includes(entityType) || !entityId || !note) {
          return res.status(400).json({ error: "entity_type, entity_id, and note are required." });
        }
        const table = entityType === "payment" ? "payments" : "payment_refunds";
        const idColumn = entityType === "payment" ? "payment_id" : "refund_id";
        const found = await query(
          `SELECT business_id FROM ${table} WHERE ${idColumn} = ? LIMIT 1`,
          [entityId]
        );
        if (!found[0]) return res.status(404).json({ error: "Finance record not found." });
        const businessId = Number(found[0].business_id || 0);
        await requireAdminBusinessAccess(req.admin, businessId);
        await query(
          `INSERT INTO finance_reconciliation_notes (business_id, entity_type, entity_id, admin_id, note) VALUES (?, ?, ?, ?, ?)`,
          [businessId, entityType, entityId, Number(req.admin?.id || 0), note]
        );
        return res.status(201).json({ message: "Audit note saved." });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/reconciliation/adjustments",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const paymentId = Number(req.body?.payment_id || 0);
        const amount = Number(req.body?.amount);
        const channel = normalizePaymentChannel(req.body?.channel);
        const reference = String(req.body?.reference || "").trim();
        const note = String(req.body?.note || "").trim();
        if (!paymentId || !Number.isFinite(amount) || amount === 0 || !reference || !note) {
          return res.status(400).json({ error: "payment_id, non-zero amount, reference, and note are required." });
        }
        const rows = await query(
          `SELECT payment_id, business_id, booking_id FROM payments WHERE payment_id = ? LIMIT 1`,
          [paymentId]
        );
        const payment = rows[0];
        if (!payment) return res.status(404).json({ error: "Payment not found." });
        await requireAdminBusinessAccess(req.admin, Number(payment.business_id || 0));
        await withTransaction(async (connection) => recordPaymentTransaction(connection, {
          businessId: payment.business_id,
          paymentId,
          bookingId: payment.booking_id,
          kind: "adjustment",
          channel,
          amount: roundCurrency(amount),
          reference,
          sourceType: "admin_adjustment",
          sourceId: randomUUID(),
          adminId: req.admin?.id,
          note,
        }));
        return res.status(201).json({ message: "Reconciliation adjustment recorded." });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.get(
    "/summary",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const businessId = await resolveScopedAdminBusinessId(req, {
          sources: ["query"],
        });
        const [summary, payouts] = await Promise.all([
          getSettlementSummary({ businessId }),
          listBusinessPayouts({ businessId, limit: 5 }),
        ]);

        res.json({
          ...summary,
          recent_payouts: payouts,
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.get(
    "/payouts",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const businessId = await resolveScopedAdminBusinessId(req, {
          sources: ["query"],
        });
        const payouts = await listBusinessPayouts({
          businessId,
          limit: parseLimit(req.query?.limit, 12),
        });
        res.json(payouts);
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/payouts/request",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const businessId = await resolveScopedAdminBusinessId(req, {
          sources: ["body", "query"],
        });
        const payout = await createBusinessPayoutRequest({
          businessId,
          requestedByAdminId: req.admin?.id,
          cutoffDate: req.body?.cutoff_date,
          notes: req.body?.notes,
        });
        const summary = await getSettlementSummary({ businessId });

        res.status(201).json({
          message: "Payout request created.",
          payout,
          summary,
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.put(
    "/payouts/:id/status",
    adminAuth.requireSuperAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
    async (req, res) => {
      try {
        const existingPayout = await getBusinessPayoutById({
          payoutId: req.params.id,
        });

        if (!existingPayout) {
          return res.status(404).json({ error: "Payout not found." });
        }

        await requireAdminBusinessAccess(req.admin, existingPayout.business_id);

        const status = normalizePayoutStatus(req.body?.status, "");
        if (!status) {
          return res.status(400).json({ error: "Valid payout status required." });
        }

        const payout = await updateBusinessPayoutStatus({
          payoutId: req.params.id,
          status,
          paidByAdminId: req.admin?.id,
          payoutReference: req.body?.payout_reference,
          notes: req.body?.notes,
        });
        const summary = await getSettlementSummary({
          businessId: existingPayout.business_id,
        });

        return res.json({
          message: "Payout status updated.",
          payout,
          summary,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

const router = express.Router();
registerAdminSettlementRoutes(router);

module.exports = router;
module.exports.registerAdminSettlementRoutes = registerAdminSettlementRoutes;
