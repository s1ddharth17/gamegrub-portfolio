const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const { roundCurrency } = require("../utils/billing");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const { db, query, withTransaction } = require("../utils/db");
const { createCustomerNotification } = require("../utils/customerNotifications");
const {
  NEXT_ORDER_STATUS,
  ORDER_STATUS_TIMESTAMPS,
  isNextOrderStatus,
  normalizeEtaMinutes,
  toPublicOrderStatus,
  toStorageOrderStatus,
} = require("../utils/orderLifecycle");
const {
  ensureUserOwnsBooking,
  ensureUserOwnsOrder,
  ensureUserOwnsOrderItem,
} = require("../utils/userAccess");
const { registerOrderCheckoutRoutes } = require("./orderCheckoutRoutes");

const router = express.Router();

const OPEN_ORDER_STATUSES = ["active", "preparing", "completed", "delivered"];
const EDITABLE_ORDER_STATUS = "active";
const ORDER_TRACKING_STATUSES = [
  "accepted", "active", "preparing", "ready", "completed", "delivered",
];

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function fetchOrderItems(orderIds) {
  if (!orderIds.length) {
    return [];
  }

  const placeholders = orderIds.map(() => "?").join(",");
  return query(
    `
      SELECT
        oi.order_id,
        oi.item_id,
        oi.qty,
        oi.price,
        oi.total,
        m.id AS menu_id,
        COALESCE(m.name, 'Menu item') AS name,
        COALESCE(m.category, 'Snacks') AS category,
        COALESCE(m.prep_time_minutes, 0) AS prep_time_minutes
      FROM order_items oi
      LEFT JOIN menu m ON oi.menu_id = m.id
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.order_id DESC, oi.item_id ASC
    `,
    orderIds
  );
}

function groupOrderItems(items) {
  return items.reduce((accumulator, item) => {
    if (!accumulator[item.order_id]) {
      accumulator[item.order_id] = [];
    }

    accumulator[item.order_id].push({
      item_id: Number(item.item_id || 0),
      menu_id: Number(item.menu_id || 0),
      name: item.name,
      category: item.category,
      prep_time_minutes: Number(item.prep_time_minutes || 0),
      qty: Number(item.qty || 0),
      price: roundCurrency(item.price || 0),
      total: roundCurrency(item.total || 0),
    });

    return accumulator;
  }, {});
}

async function getOrderSummaryForBooking(bookingId, statuses = OPEN_ORDER_STATUSES) {
  const placeholders = statuses.map(() => "?").join(",");
  const orders = await query(
    `
      SELECT
        o.order_id,
        o.booking_id,
        o.total_amount,
        o.status,
        o.notes,
        o.customer_notes,
        DATE_FORMAT(o.accepted_at, '%Y-%m-%dT%H:%i:%sZ') AS accepted_at,
        DATE_FORMAT(o.preparing_at, '%Y-%m-%dT%H:%i:%sZ') AS preparing_at,
        DATE_FORMAT(o.ready_at, '%Y-%m-%dT%H:%i:%sZ') AS ready_at,
        DATE_FORMAT(o.delivered_at, '%Y-%m-%dT%H:%i:%sZ') AS delivered_at,
        DATE_FORMAT(o.eta_at, '%Y-%m-%dT%H:%i:%sZ') AS eta_at,
        o.eta_minutes,
        o.created_at,
        o.updated_at
      FROM orders o
      WHERE o.booking_id = ?
      AND o.status IN (${placeholders})
      ORDER BY
        FIELD(o.status, 'active', 'preparing', 'completed', 'delivered', 'closed'),
        o.order_id DESC
    `,
    [bookingId, ...statuses]
  );

  if (!orders.length) {
    return {
      booking_id: Number(bookingId),
      grand_total: 0,
      items: [],
      orders: [],
    };
  }

  const items = await fetchOrderItems(orders.map((order) => order.order_id));
  const itemsByOrderId = groupOrderItems(items);

  const normalizedOrders = orders.map((order) => ({
    order_id: Number(order.order_id || 0),
    booking_id: Number(order.booking_id || 0),
    status: toPublicOrderStatus(order.status),
    notes: order.customer_notes || "",
    customer_notes: order.customer_notes || "",
    accepted_at: order.accepted_at,
    preparing_at: order.preparing_at,
    ready_at: order.ready_at,
    delivered_at: order.delivered_at,
    eta_at: order.eta_at,
    eta_minutes: Number(order.eta_minutes || 0) || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_amount: roundCurrency(order.total_amount || 0),
    items: itemsByOrderId[order.order_id] || [],
  }));

  return {
    booking_id: Number(bookingId),
    grand_total: roundCurrency(
      normalizedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    ),
    items: normalizedOrders.flatMap((order) => order.items),
    orders: normalizedOrders,
  };
}

registerOrderCheckoutRoutes(router);

// CREATE ORDER
router.post("/create", auth, async (req, res) => {
  const { booking_id: bookingId, notes: rawNotes = "" } = req.body;
  const notes = typeof rawNotes === "string" ? rawNotes.trim().slice(0, 500) : "";

  if (!bookingId) {
    return res.status(400).json({ error: "booking_id required" });
  }

  try {
    await ensureUserOwnsBooking(null, Number(req.user?.id || 0), bookingId);

    const existing = await query(
      `
        SELECT order_id
        FROM orders
        WHERE booking_id = ?
        AND status = ?
        ORDER BY order_id DESC
        LIMIT 1
      `,
      [bookingId, EDITABLE_ORDER_STATUS]
    );

    if (existing.length) {
      return res.json({
        message: "Order already exists",
        order_id: Number(existing[0].order_id || 0),
      });
    }

    const result = await query(
      `
        INSERT INTO orders (
          business_id, booking_id, total_amount, status, notes, accepted_at, customer_notes
        )
        SELECT business_id, booking_id, 0, ?, '', UTC_TIMESTAMP(), ?
        FROM booking
        WHERE booking_id = ?
        LIMIT 1
      `,
      [EDITABLE_ORDER_STATUS, notes || null, bookingId]
    );

    if (!result.insertId) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({
      message: "Order created",
      order_id: Number(result.insertId || 0),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADD ITEM
router.post("/add-item", auth, async (req, res) => {
  const { order_id: orderId, menu_id: menuId, qty } = req.body;
  const parsedQty = Number(qty);

  if (!orderId || !menuId || !Number.isInteger(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    const response = await withTransaction(async (connection) => {
      await ensureUserOwnsOrder(connection, Number(req.user?.id || 0), orderId);

      const [orders] = await connection.query(
        `
          SELECT
            o.status,
            COALESCE(o.business_id, b.business_id, 1) AS business_id
          FROM orders o
          LEFT JOIN booking b ON b.booking_id = o.booking_id
          WHERE o.order_id = ?
          LIMIT 1
        `,
        [orderId]
      );

      if (!orders.length) {
        const error = new Error("Order not found");
        error.statusCode = 404;
        throw error;
      }

      if (orders[0].status !== EDITABLE_ORDER_STATUS) {
        const error = new Error("Only active orders can be edited");
        error.statusCode = 400;
        throw error;
      }

      const [menuRows] = await connection.query(
        `
          SELECT amount, is_available
          FROM menu
          WHERE id = ?
          AND business_id = ?
          LIMIT 1
        `,
        [menuId, Number(orders[0].business_id || 1)]
      );

      if (!menuRows.length || Number(menuRows[0].is_available) === 0) {
        const error = new Error("Menu item unavailable");
        error.statusCode = 404;
        throw error;
      }

      const price = roundCurrency(menuRows[0].amount || 0);
      const lineTotal = roundCurrency(price * parsedQty);

      await connection.query(
        `
          INSERT INTO order_items (order_id, menu_id, qty, price, total)
          VALUES (?, ?, ?, ?, ?)
        `,
        [orderId, menuId, parsedQty, price, lineTotal]
      );

      await connection.query(
        "UPDATE orders SET total_amount = total_amount + ? WHERE order_id = ?",
        [lineTotal, orderId]
      );

      return {
        item_total: lineTotal,
      };
    });

    res.json({ message: "Item added", ...response });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// SET ITEM QUANTITY
router.post("/set-item", auth, async (req, res) => {
  const { order_id: orderId, menu_id: menuId, qty } = req.body;
  const parsedQty = Number(qty);

  if (!orderId || !menuId || !Number.isInteger(parsedQty) || parsedQty < 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    const summary = await withTransaction(async (connection) => {
      await ensureUserOwnsOrder(connection, Number(req.user?.id || 0), orderId);

      const [orders] = await connection.query(
        `
          SELECT
            o.order_id,
            o.status,
            COALESCE(o.business_id, b.business_id, 1) AS business_id
          FROM orders o
          LEFT JOIN booking b ON b.booking_id = o.booking_id
          WHERE o.order_id = ?
          LIMIT 1
        `,
        [orderId]
      );

      if (!orders.length) {
        const error = new Error("Order not found");
        error.statusCode = 404;
        throw error;
      }

      if (orders[0].status !== EDITABLE_ORDER_STATUS) {
        const error = new Error("Only active orders can be edited");
        error.statusCode = 400;
        throw error;
      }

      const [menuRows] = await connection.query(
        `
          SELECT amount
          FROM menu
          WHERE id = ?
          AND business_id = ?
          LIMIT 1
        `,
        [menuId, Number(orders[0].business_id || 1)]
      );

      if (!menuRows.length) {
        const error = new Error("Menu item not found");
        error.statusCode = 404;
        throw error;
      }

      const price = roundCurrency(menuRows[0].amount || 0);
      const [existingRows] = await connection.query(
        `
          SELECT item_id, qty, total
          FROM order_items
          WHERE order_id = ? AND menu_id = ?
          ORDER BY item_id DESC
        `,
        [orderId, menuId]
      );

      const existingItem = existingRows[0] || null;
      const previousTotal = roundCurrency(existingItem?.total || 0);
      const nextTotal = roundCurrency(price * parsedQty);
      const delta = nextTotal - previousTotal;

      if (!existingItem && parsedQty === 0) {
        return { delta: 0 };
      }

      if (existingItem && parsedQty === 0) {
        await connection.query("DELETE FROM order_items WHERE item_id = ?", [existingItem.item_id]);
      } else if (existingItem) {
        await connection.query(
          `
            UPDATE order_items
            SET qty = ?, price = ?, total = ?
            WHERE item_id = ?
          `,
          [parsedQty, price, nextTotal, existingItem.item_id]
        );
      } else {
        await connection.query(
          `
            INSERT INTO order_items (order_id, menu_id, qty, price, total)
            VALUES (?, ?, ?, ?, ?)
          `,
          [orderId, menuId, parsedQty, price, nextTotal]
        );
      }

      await connection.query(
        `
          UPDATE orders
          SET total_amount = GREATEST(0, total_amount + ?)
          WHERE order_id = ?
        `,
        [delta, orderId]
      );

      return { delta };
    });

    res.json({
      message: "Order updated",
      delta: roundCurrency(summary.delta || 0),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// REMOVE ITEM
router.post("/remove-item", auth, async (req, res) => {
  const { item_id: itemId } = req.body;

  if (!itemId) {
    return res.status(400).json({ error: "item_id required" });
  }

  try {
    await withTransaction(async (connection) => {
      await ensureUserOwnsOrderItem(connection, Number(req.user?.id || 0), itemId);

      const [rows] = await connection.query(
        `
          SELECT
            oi.order_id,
            oi.total,
            o.status
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.order_id
          WHERE oi.item_id = ?
          LIMIT 1
        `,
        [itemId]
      );

      if (!rows.length) {
        const error = new Error("Item not found");
        error.statusCode = 404;
        throw error;
      }

      const row = rows[0];

      if (row.status !== EDITABLE_ORDER_STATUS) {
        const error = new Error("Only active orders can be edited");
        error.statusCode = 400;
        throw error;
      }

      await connection.query("DELETE FROM order_items WHERE item_id = ?", [itemId]);
      await connection.query(
        "UPDATE orders SET total_amount = GREATEST(0, total_amount - ?) WHERE order_id = ?",
        [roundCurrency(row.total || 0), row.order_id]
      );
    });

    res.json({ message: "Item removed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ORDER SUMMARY
router.get("/summary/:booking_id", auth, async (req, res) => {
  try {
    await ensureUserOwnsBooking(null, Number(req.user?.id || 0), Number(req.params.booking_id));
    res.json(await getOrderSummaryForBooking(req.params.booking_id));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get(
  "/admin/summary/:booking_id",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.POS_READ),
  async (req, res) => {
    try {
      const bookingId = Number(req.params.booking_id || 0);

      if (!bookingId) {
        return res.status(400).json({ error: "booking_id required" });
      }

      const rows = await query(
        `
          SELECT booking_id, business_id
          FROM booking
          WHERE booking_id = ?
          LIMIT 1
        `,
        [bookingId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Booking not found" });
      }

      await requireAdminBusinessAccess(req.admin, Number(rows[0].business_id || 0));
      res.json(await getOrderSummaryForBooking(bookingId));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

// ADMIN ORDER QUEUE
router.get(
  "/admin/list",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ORDERS_MANAGE),
  async (req, res) => {
  let businessId;
  try {
    businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }

  const requestedStatus = normalizeStatus(req.query.status);

  let whereClause = "WHERE o.business_id = ?";
  let params = [businessId];

  if (requestedStatus && requestedStatus !== "all") {
    if (requestedStatus === "open") {
      whereClause = `WHERE o.business_id = ? AND o.status IN (${OPEN_ORDER_STATUSES.map(() => "?").join(",")})`;
      params = [businessId, ...OPEN_ORDER_STATUSES];
    } else {
      whereClause = "WHERE o.business_id = ? AND o.status = ?";
      params = [businessId, toStorageOrderStatus(requestedStatus) || requestedStatus];
    }
  }

  try {
    const orders = await query(
      `
        SELECT
          o.order_id,
          o.booking_id,
          o.status,
          o.total_amount,
          o.customer_notes,
          DATE_FORMAT(o.accepted_at, '%Y-%m-%dT%H:%i:%sZ') AS accepted_at,
          DATE_FORMAT(o.preparing_at, '%Y-%m-%dT%H:%i:%sZ') AS preparing_at,
          DATE_FORMAT(o.ready_at, '%Y-%m-%dT%H:%i:%sZ') AS ready_at,
          DATE_FORMAT(o.delivered_at, '%Y-%m-%dT%H:%i:%sZ') AS delivered_at,
          DATE_FORMAT(o.eta_at, '%Y-%m-%dT%H:%i:%sZ') AS eta_at,
          o.eta_minutes,
          o.created_at,
          o.updated_at,
          b.status AS booking_status,
          b.booking_date,
          b.start_time,
          u.uid AS user_id,
          u.name AS user_name,
          pc.pc_id,
          pc.specs AS pc_specs
        FROM orders o
        JOIN booking b ON o.booking_id = b.booking_id
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        ${whereClause}
        ORDER BY
          FIELD(o.status, 'active', 'preparing', 'completed', 'delivered', 'closed'),
          o.order_id DESC
      `,
      params
    );

    if (!orders.length) {
      return res.json([]);
    }

    const itemsByOrderId = groupOrderItems(await fetchOrderItems(orders.map((order) => order.order_id)));

    res.json(
      orders.map((order) => {
        const items = itemsByOrderId[order.order_id] || [];
        const totalItems = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

        return {
          order_id: Number(order.order_id || 0),
          booking_id: Number(order.booking_id || 0),
          status: toPublicOrderStatus(order.status),
          total_amount: roundCurrency(order.total_amount || 0),
          notes: order.customer_notes || "",
          customer_notes: order.customer_notes || "",
          accepted_at: order.accepted_at,
          preparing_at: order.preparing_at,
          ready_at: order.ready_at,
          delivered_at: order.delivered_at,
          eta_at: order.eta_at,
          eta_minutes: Number(order.eta_minutes || 0) || null,
          created_at: order.created_at,
          updated_at: order.updated_at,
          booking_status: order.booking_status,
          booking_date: order.booking_date,
          start_time: order.start_time,
          user_id: Number(order.user_id || 0),
          user_name: order.user_name,
          pc_id: Number(order.pc_id || 0),
          pc_specs: order.pc_specs,
          total_items: totalItems,
          items,
        };
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
  }
);

// ADMIN ORDER STATUS UPDATE
router.put(
  "/status/:order_id",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ORDERS_MANAGE),
  async (req, res) => {
  const orderId = Number(req.params.order_id);
  const nextPublicStatus = normalizeStatus(req.body.status);
  const nextStatus = toStorageOrderStatus(nextPublicStatus);
  const etaMinutes = normalizeEtaMinutes(req.body.eta_minutes);

  if (!orderId) {
    return res.status(400).json({ error: "order_id required" });
  }

  if (!ORDER_TRACKING_STATUSES.includes(nextPublicStatus) || !nextStatus) {
    return res.status(400).json({
      error: "Status must be accepted, preparing, ready, or delivered",
    });
  }

  if ((nextStatus === "preparing" && etaMinutes === null) || Number.isNaN(etaMinutes)) {
    return res.status(400).json({
      error: "Set a preparation ETA between 1 and 240 minutes when starting preparation",
    });
  }

  try {
    const transition = await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        `
          SELECT order_id, business_id, booking_id, status, eta_minutes
          FROM orders
          WHERE order_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [orderId]
      );

      if (!rows.length) {
        const error = new Error("Order not found");
        error.statusCode = 404;
        throw error;
      }

      const order = rows[0];
      const currentStatus = normalizeStatus(order.status);
      await requireAdminBusinessAccess(req.admin, Number(order.business_id || 0));

      if (currentStatus === "closed") {
        const error = new Error("Closed orders cannot be updated");
        error.statusCode = 400;
        throw error;
      }

      const etaChanged = nextStatus === "preparing" &&
        etaMinutes !== null && Number(order.eta_minutes || 0) !== etaMinutes;
      const isStatusChange = currentStatus !== nextStatus;

      if (isStatusChange && !isNextOrderStatus(currentStatus, nextStatus)) {
        const error = new Error(
          `Order must move from ${toPublicOrderStatus(currentStatus)} to ${toPublicOrderStatus(
            NEXT_ORDER_STATUS[currentStatus] || currentStatus
          )} next.`
        );
        error.statusCode = 409;
        throw error;
      }

      if (!isStatusChange && !etaChanged) {
        return { order, changed: false };
      }

      const timestampColumn = isStatusChange ? ORDER_STATUS_TIMESTAMPS[nextStatus] : null;
      const assignments = [];
      const values = [];
      if (isStatusChange) {
        assignments.push("status = ?");
        values.push(nextStatus);
        assignments.push(`${timestampColumn} = UTC_TIMESTAMP()`);
      }
      if (nextStatus === "preparing" && etaMinutes !== null) {
        const etaAt = new Date(Date.now() + etaMinutes * 60_000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        assignments.push("eta_minutes = ?", "eta_at = ?");
        values.push(etaMinutes, etaAt);
      }

      await connection.query(
        `UPDATE orders SET ${assignments.join(", ")} WHERE order_id = ?`,
        [...values, orderId]
      );

      const previousPublicStatus = toPublicOrderStatus(currentStatus);
      const nextStoredStatus = isStatusChange ? nextStatus : currentStatus;
      await connection.query(
        `
          INSERT INTO order_status_history (
            order_id, previous_status, status, changed_by_admin_id, eta_at, changed_at
          )
          SELECT ?, ?, ?, ?, eta_at, UTC_TIMESTAMP()
          FROM orders
          WHERE order_id = ?
        `,
        [
          orderId,
          previousPublicStatus,
          toPublicOrderStatus(nextStoredStatus),
          Number(req.admin?.id || 0) || null,
          orderId,
        ]
      );

      return { order, changed: isStatusChange, etaChanged };
    });

    if (nextStatus === "completed") {
      const bookingRows = await query(
        "SELECT user_id FROM booking WHERE booking_id = ? LIMIT 1",
        [transition.order.booking_id]
      );
      await createCustomerNotification(db, {
        userId: bookingRows[0]?.user_id,
        category: "food_orders",
        eventType: "food_order_ready",
        title: "Your food order is ready",
        message: "Your order is ready for pickup. Open the bill to see the order details.",
        deepLink: `/orders/${orderId}?booking_id=${Number(transition.order.booking_id)}`,
        entityType: "order",
        entityId: orderId,
        idempotencyKey: `order:${orderId}:ready`,
      });
    }

    res.json({
      message: "Order status updated",
      order_id: orderId,
      status: toPublicOrderStatus(nextStatus),
      changed: transition.changed,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// LIVE BILL
router.get("/bill/:booking_id", auth, async (req, res) => {
  try {
    await ensureUserOwnsBooking(null, Number(req.user?.id || 0), Number(req.params.booking_id));
    const summary = await getOrderSummaryForBooking(req.params.booking_id);
    res.json(summary);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
