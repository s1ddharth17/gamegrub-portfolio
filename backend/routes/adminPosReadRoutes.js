const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { calculateBreakdown, summarizeSlotUsage } = require("../utils/billing");
const { resolveScopedAdminBusinessId } = require("../utils/businessAccess");
const { query } = require("../utils/db");

function buildFeeBreakdownOptions(source = {}) {
  return {
    commissionRate: source.commission_rate || 0,
    convenienceFeeFlat: source.convenience_fee_flat || 0,
    convenienceFeeRate: source.convenience_fee_rate || 0,
  };
}

function registerAdminPosReadRoutes(router) {
  // FETCH LIVE SESSION
  router.get("/session/live", adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.POS_READ), async (req, res) => {
    try {
      const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
      const rows = await query(
        `
          SELECT
            b.booking_id,
            u.name,
            pc.specs,
            b.start_time,
            TIMESTAMPDIFF(MINUTE, b.start_time, NOW()) AS running_minutes
          FROM booking b
          JOIN users u ON b.user_id = u.uid
          JOIN pc ON b.pc_id = pc.pc_id
          WHERE b.status = 'running'
          AND b.business_id = ?
        `,
        [businessId]
      );

      res.json(rows);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  // POS SESSION LIST
  router.get("/pos-sessions", adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.POS_READ), async (req, res) => {
    try {
      const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
      const sessions = await query(
        `
          SELECT
            b.booking_id,
            b.business_id,
            b.booking_date,
            b.status,
            b.start_time,
            b.actual_end_time,
            b.user_id,
            pc.pc_id,
            pc.specs,
            pc.price_per_hour,
            u.name,
            u.loyalty_points,
            o.order_id,
            o.status AS order_status,
            o.total_amount AS open_food_total,
            COUNT(DISTINCT oi.item_id) AS open_item_lines,
            GROUP_CONCAT(DISTINCT bs.hour ORDER BY bs.hour) AS slot_hours,
            MAX(p.payment_method) AS payment_method,
            MAX(p.status) AS payment_status,
            MAX(COALESCE(p.customer_final_amount, p.final_amount, 0)) AS captured_amount,
            COALESCE(bus.commission_rate, 0) AS commission_rate,
            COALESCE(bus.convenience_fee_flat, 0) AS convenience_fee_flat,
            COALESCE(bus.convenience_fee_rate, 0) AS convenience_fee_rate
          FROM booking b
          JOIN pc ON b.pc_id = pc.pc_id
          JOIN users u ON b.user_id = u.uid
          LEFT JOIN businesses bus ON bus.business_id = b.business_id
          LEFT JOIN booking_slots bs ON bs.booking_id = b.booking_id
          LEFT JOIN orders o
            ON o.booking_id = b.booking_id
            AND o.status IN ('active', 'preparing', 'completed', 'delivered')
          LEFT JOIN order_items oi ON oi.order_id = o.order_id
          LEFT JOIN payments p ON p.booking_id = b.booking_id
          WHERE b.status IN ('running', 'session_over')
          AND b.business_id = ?
          GROUP BY
            b.booking_id,
            b.booking_date,
            b.status,
            b.start_time,
            b.actual_end_time,
            b.user_id,
            pc.pc_id,
            pc.specs,
            pc.price_per_hour,
            u.name,
            u.loyalty_points,
            o.order_id,
            o.status,
            o.total_amount
          ORDER BY b.start_time ASC
        `,
        [businessId]
      );

      const response = sessions.map((session) => {
        const start = session.start_time ? new Date(session.start_time) : new Date();
        const end =
          session.status === "session_over" && session.actual_end_time
            ? new Date(session.actual_end_time)
            : new Date();
        const minutes = Math.max(0, Math.floor((end - start) / 60000));
        const slotUsage = summarizeSlotUsage({
          bookingDate: session.booking_date,
          slotHours: String(session.slot_hours || "")
            .split(",")
            .map((hour) => hour.trim())
            .filter((hour) => hour !== "")
            .map((hour) => Number(hour))
            .filter(Number.isInteger),
          referenceTime: end,
        });
        const breakdown = calculateBreakdown({
          minutes,
          slotCount: slotUsage.billableSlots,
          pricePerHour: session.price_per_hour,
          foodTotal: session.open_food_total || 0,
          loyaltyPoints: session.loyalty_points,
          capturedAmount: session.captured_amount || 0,
          useLoyalty: true,
          ...buildFeeBreakdownOptions(session),
        });

        return {
          booking_id: Number(session.booking_id || 0),
          business_id: Number(session.business_id || 0),
          status: session.status,
          pc_id: Number(session.pc_id || 0),
          pc_specs: session.specs,
          user_id: Number(session.user_id || 0),
          user_name: session.name,
          loyalty_points: Number(session.loyalty_points || 0),
          running_minutes: breakdown.minutes,
          booked_slots: slotUsage.totalBookedSlots,
          billable_slots: slotUsage.billableSlots,
          future_slots: slotUsage.futureSlots,
          gaming_cost: breakdown.gamingCost,
          food_total: breakdown.foodCost,
          subtotal: breakdown.subtotal,
          convenience_fee: breakdown.convenienceFee,
          customer_subtotal: breakdown.customerSubtotal,
          captured_amount: breakdown.capturedAmount,
          open_balance_before_loyalty: breakdown.openBalance,
          loyalty_redeemable: breakdown.loyaltyUsed,
          service_final_total: breakdown.finalAmount,
          total_bill: breakdown.customerFinalAmount,
          customer_final_total: breakdown.customerFinalAmount,
          amount_due: breakdown.amountDue,
          earned_loyalty: breakdown.earnedLoyalty,
          commission_rate: breakdown.commissionRate,
          platform_commission: breakdown.platformCommission,
          seller_net_amount: breakdown.sellerNetAmount,
          order_id: session.order_id ? Number(session.order_id) : null,
          order_status: session.order_status || null,
          open_item_lines: Number(session.open_item_lines || 0),
          payment_method: session.payment_method || "unassigned",
          payment_status: session.payment_status || "pending",
        };
      });

      res.json(response);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
}

module.exports = { registerAdminPosReadRoutes };
