const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const { roundCurrency } = require("../utils/billing");
const { query } = require("../utils/db");
const { ensureSameUser, ensureUserOwnsBill } = require("../utils/userAccess");
const { createReceiptPdf } = require("../utils/receiptPdf");

const router = express.Router();

// FETCH ALL BILLS
router.get(
  "/all",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
  async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const rows = await query(
      `
        SELECT
          b.bill_id,
          b.receipt_number,
          b.booking_id,
          u.name AS user_name,
          pc.specs,
          b.payout_id,
          b.gaming_cost,
          b.food_cost,
          b.subtotal,
          b.convenience_fee,
          b.loyalty_used,
          b.final_amount,
          b.customer_final_amount,
          b.commission_rate,
          b.platform_commission,
          b.seller_net_amount,
          b.earned_loyalty,
          b.created_at,
          bp.status AS payout_status,
          bp.payout_reference,
          bp.paid_at AS payout_paid_at,
          p.payment_method,
          p.payment_reference,
          p.receipt_number AS payment_receipt_number,
          p.status AS payment_status
        FROM bills b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        LEFT JOIN business_payouts bp ON bp.payout_id = b.payout_id
        WHERE b.business_id = ?
        ORDER BY b.bill_id DESC
      `,
      [businessId]
    );

    res.json(
      rows.map((row) => ({
        ...row,
        gaming_cost: roundCurrency(row.gaming_cost || 0),
        food_cost: roundCurrency(row.food_cost || 0),
        subtotal: roundCurrency(row.subtotal || 0),
        convenience_fee: roundCurrency(row.convenience_fee || 0),
        loyalty_used: roundCurrency(row.loyalty_used || 0),
        final_amount: roundCurrency(row.final_amount || 0),
        customer_final_amount: roundCurrency(row.customer_final_amount || 0),
        commission_rate: roundCurrency(row.commission_rate || 0),
        platform_commission: roundCurrency(row.platform_commission || 0),
        seller_net_amount: roundCurrency(row.seller_net_amount || 0),
        earned_loyalty: Number(row.earned_loyalty || 0),
      }))
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FETCH USER HISTORY
router.get(
  "/admin/:id",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.BILLING_READ),
  async (req, res) => {
  try {
    const billRows = await query(
      `
        SELECT
          b.*,
          u.name,
          u.mobile,
          pc.specs,
          bp.status AS payout_status,
          bp.payout_reference,
          bp.paid_at AS payout_paid_at,
          p.payment_method,
          p.payment_reference,
          p.receipt_number AS payment_receipt_number,
          p.captured_amount,
          p.refunded_amount,
          p.status AS payment_status,
          p.paid_at
        FROM bills b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        LEFT JOIN business_payouts bp ON bp.payout_id = b.payout_id
        WHERE b.bill_id = ?
        LIMIT 1
      `,
      [req.params.id]
    );

    if (!billRows.length) {
      return res.status(404).json({ error: "Bill not found" });
    }

    const bill = billRows[0];
    await requireAdminBusinessAccess(req.admin, Number(bill.business_id || 0));

    const items = await query(
      `
        SELECT
          o.order_id,
          COALESCE(m.name, 'Menu item') AS name,
          oi.qty,
          oi.price,
          oi.total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN menu m ON oi.menu_id = m.id
        WHERE o.booking_id = ?
        AND o.status = 'closed'
      `,
      [bill.booking_id]
    );

    res.json({
      bill: {
        ...bill,
        gaming_cost: roundCurrency(bill.gaming_cost || 0),
        food_cost: roundCurrency(bill.food_cost || 0),
        subtotal: roundCurrency(bill.subtotal || 0),
        convenience_fee: roundCurrency(bill.convenience_fee || 0),
        loyalty_used: roundCurrency(bill.loyalty_used || 0),
        final_amount: roundCurrency(bill.final_amount || 0),
        customer_final_amount: roundCurrency(bill.customer_final_amount || 0),
        commission_rate: roundCurrency(bill.commission_rate || 0),
        platform_commission: roundCurrency(bill.platform_commission || 0),
        seller_net_amount: roundCurrency(bill.seller_net_amount || 0),
        earned_loyalty: Number(bill.earned_loyalty || 0),
      },
      items: items.map((item) => ({
        ...item,
        qty: Number(item.qty || 0),
        price: roundCurrency(item.price || 0),
        total: roundCurrency(item.total || 0),
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FETCH USER HISTORY
router.get("/user/:id", auth, async (req, res) => {
  try {
    ensureSameUser(req.params.id, Number(req.user?.id || 0));

    const rows = await query(
      `
        SELECT
          b.bill_id,
          b.receipt_number,
          b.booking_id,
          b.payout_id,
          b.gaming_cost,
          b.food_cost,
          b.subtotal,
          b.convenience_fee,
          b.loyalty_used,
          b.final_amount,
          b.customer_final_amount,
          b.commission_rate,
          b.platform_commission,
          b.seller_net_amount,
          b.earned_loyalty,
          b.created_at,
          bp.status AS payout_status,
          bp.payout_reference,
          bp.paid_at AS payout_paid_at,
          p.payment_method,
          p.payment_reference,
          p.receipt_number AS payment_receipt_number,
          p.status AS payment_status
        FROM bills b
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        LEFT JOIN business_payouts bp ON bp.payout_id = b.payout_id
        WHERE b.user_id = ?
        ORDER BY b.bill_id DESC
      `,
      [req.params.id]
    );

    res.json(
      rows.map((row) => ({
        ...row,
        gaming_cost: roundCurrency(row.gaming_cost || 0),
        food_cost: roundCurrency(row.food_cost || 0),
        subtotal: roundCurrency(row.subtotal || 0),
        convenience_fee: roundCurrency(row.convenience_fee || 0),
        loyalty_used: roundCurrency(row.loyalty_used || 0),
        final_amount: roundCurrency(row.final_amount || 0),
        customer_final_amount: roundCurrency(row.customer_final_amount || 0),
        commission_rate: roundCurrency(row.commission_rate || 0),
        platform_commission: roundCurrency(row.platform_commission || 0),
        seller_net_amount: roundCurrency(row.seller_net_amount || 0),
        earned_loyalty: Number(row.earned_loyalty || 0),
      }))
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// DOWNLOADABLE, SERVER-ISSUED RECEIPT
router.get("/:id/receipt", auth, async (req, res) => {
  try {
    const billId = Number(req.params.id);
    const userId = Number(req.user?.id || 0);
    await ensureUserOwnsBill(null, userId, billId);
    const rows = await query(
      `
        SELECT b.*, u.name, pc.specs, p.receipt_number AS payment_receipt_number,
          p.payment_method, p.payment_reference, p.captured_amount, p.refunded_amount, p.paid_at
        FROM bills b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        WHERE b.bill_id = ? LIMIT 1
      `,
      [billId]
    );
    const bill = rows[0];
    if (!bill) return res.status(404).json({ error: "Bill not found." });
    const items = await query(
      `
        SELECT COALESCE(m.name, 'Menu item') AS name, oi.qty, oi.total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN menu m ON oi.menu_id = m.id
        WHERE o.booking_id = ? AND o.status = 'closed'
        ORDER BY o.order_id, oi.item_id
      `,
      [bill.booking_id]
    );
    const receiptNumber = bill.receipt_number || `GG-BILL-${String(billId).padStart(10, "0")}`;
    const lines = [
      "GameGrub payment receipt",
      `Receipt: ${receiptNumber}`,
      `Payment reference: ${bill.payment_receipt_number || "Not available"}`,
      `Bill: ${bill.bill_id}    Booking: ${bill.booking_id}`,
      `Customer: ${bill.name || "Customer"}`,
      `Station: ${bill.specs || "GameGrub station"}`,
      `Payment method: ${bill.payment_method || "Not recorded"}`,
      `Transaction reference: ${bill.payment_reference || "Not recorded"}`,
      `Paid at: ${bill.paid_at || bill.created_at || "Not available"}`,
      "",
      `Gaming: Rs ${roundCurrency(bill.gaming_cost).toFixed(2)}`,
      `Food: Rs ${roundCurrency(bill.food_cost).toFixed(2)}`,
      `Subtotal: Rs ${roundCurrency(bill.subtotal).toFixed(2)}`,
      `Convenience fee: Rs ${roundCurrency(bill.convenience_fee).toFixed(2)}`,
      `Loyalty used: Rs ${roundCurrency(bill.loyalty_used).toFixed(2)}`,
      `Final total: Rs ${roundCurrency(bill.customer_final_amount).toFixed(2)}`,
      `Captured: Rs ${roundCurrency(bill.captured_amount).toFixed(2)}`,
      `Refunded: Rs ${roundCurrency(bill.refunded_amount).toFixed(2)}`,
      "",
      "Food items",
      ...items.map((item) => `${item.qty} x ${item.name} - Rs ${roundCurrency(item.total).toFixed(2)}`),
    ];
    const pdf = createReceiptPdf(lines);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Content-Disposition", `attachment; filename="${receiptNumber}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(pdf);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// SINGLE BILL INVOICE
router.get("/:id", auth, async (req, res) => {
  try {
    await ensureUserOwnsBill(null, Number(req.user?.id || 0), Number(req.params.id));

    const billRows = await query(
      `
        SELECT
          b.*,
          u.name,
          u.mobile,
          pc.specs,
          bp.status AS payout_status,
          bp.payout_reference,
          bp.paid_at AS payout_paid_at,
          p.payment_method,
          p.payment_reference,
          p.receipt_number AS payment_receipt_number,
          p.captured_amount,
          p.refunded_amount,
          p.status AS payment_status,
          p.paid_at
        FROM bills b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        LEFT JOIN payments p ON p.booking_id = b.booking_id
        LEFT JOIN business_payouts bp ON bp.payout_id = b.payout_id
        WHERE b.bill_id = ?
        LIMIT 1
      `,
      [req.params.id]
    );

    if (!billRows.length) {
      return res.status(404).json({ error: "Bill not found" });
    }

    const bill = billRows[0];
    const items = await query(
      `
        SELECT
          o.order_id,
          COALESCE(m.name, 'Menu item') AS name,
          oi.qty,
          oi.price,
          oi.total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN menu m ON oi.menu_id = m.id
        WHERE o.booking_id = ?
        AND o.status = 'closed'
      `,
      [bill.booking_id]
    );

    const orders = await query(
      `SELECT order_id, status, total_amount FROM orders WHERE booking_id = ? ORDER BY order_id`,
      [bill.booking_id]
    );
    const refunds = await query(
      `SELECT refund_id, refund_number, order_id, requested_amount, processed_amount,
        status, reason, outcome_message, failure_description, requested_at, processed_at
       FROM payment_refunds WHERE booking_id = ? AND user_id = ? ORDER BY requested_at DESC`,
      [bill.booking_id, Number(req.user?.id || 0)]
    );

    res.json({
      bill: {
        ...bill,
        gaming_cost: roundCurrency(bill.gaming_cost || 0),
        food_cost: roundCurrency(bill.food_cost || 0),
        subtotal: roundCurrency(bill.subtotal || 0),
        convenience_fee: roundCurrency(bill.convenience_fee || 0),
        loyalty_used: roundCurrency(bill.loyalty_used || 0),
        final_amount: roundCurrency(bill.final_amount || 0),
        customer_final_amount: roundCurrency(bill.customer_final_amount || 0),
        commission_rate: roundCurrency(bill.commission_rate || 0),
        platform_commission: roundCurrency(bill.platform_commission || 0),
        seller_net_amount: roundCurrency(bill.seller_net_amount || 0),
        earned_loyalty: Number(bill.earned_loyalty || 0),
      },
      items: items.map((item) => ({
        order_id: Number(item.order_id || 0),
        ...item,
        qty: Number(item.qty || 0),
        price: roundCurrency(item.price || 0),
        total: roundCurrency(item.total || 0),
      })),
      orders: orders.map((order) => ({
        ...order,
        order_id: Number(order.order_id),
        total_amount: roundCurrency(order.total_amount),
      })),
      refunds: refunds.map((refund) => ({
        ...refund,
        requested_amount: roundCurrency(refund.requested_amount),
        processed_amount: roundCurrency(refund.processed_amount),
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
