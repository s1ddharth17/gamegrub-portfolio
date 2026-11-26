const { query } = require("./db");

async function selectRows(executor, sql, params = []) {
  if (executor && typeof executor.query === "function") {
    const result = await executor.query(sql, params);
    return Array.isArray(result?.[0]) ? result[0] : result;
  }

  return query(sql, params);
}

function buildOwnershipError(resourceLabel) {
  const error = new Error(`You do not have access to this ${resourceLabel}.`);
  error.statusCode = 403;
  return error;
}

function buildNotFoundError(resourceLabel) {
  const error = new Error(`${resourceLabel} not found`);
  error.statusCode = 404;
  return error;
}

function ensureSameUser(requestedUserId, authenticatedUserId) {
  const requested = Number(requestedUserId || 0);
  const authenticated = Number(authenticatedUserId || 0);

  if (!requested || !authenticated || requested !== authenticated) {
    throw buildOwnershipError("user account");
  }
}

async function ensureUserOwnsBooking(executor, authenticatedUserId, bookingId) {
  const rows = await selectRows(
    executor,
    `
      SELECT booking_id, user_id, status
      FROM booking
      WHERE booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  const booking = rows[0];

  if (!booking) {
    throw buildNotFoundError("Booking");
  }

  if (Number(booking.user_id || 0) !== Number(authenticatedUserId || 0)) {
    throw buildOwnershipError("booking");
  }

  return booking;
}

async function ensureUserOwnsBill(executor, authenticatedUserId, billId) {
  const rows = await selectRows(
    executor,
    `
      SELECT bill_id, booking_id, user_id
      FROM bills
      WHERE bill_id = ?
      LIMIT 1
    `,
    [billId]
  );

  const bill = rows[0];

  if (!bill) {
    throw buildNotFoundError("Bill");
  }

  if (Number(bill.user_id || 0) !== Number(authenticatedUserId || 0)) {
    throw buildOwnershipError("bill");
  }

  return bill;
}

async function ensureUserOwnsOrder(executor, authenticatedUserId, orderId) {
  const rows = await selectRows(
    executor,
    `
      SELECT
        o.order_id,
        o.booking_id,
        o.status,
        b.user_id
      FROM orders o
      JOIN booking b ON b.booking_id = o.booking_id
      WHERE o.order_id = ?
      LIMIT 1
    `,
    [orderId]
  );

  const order = rows[0];

  if (!order) {
    throw buildNotFoundError("Order");
  }

  if (Number(order.user_id || 0) !== Number(authenticatedUserId || 0)) {
    throw buildOwnershipError("order");
  }

  return order;
}

async function ensureUserOwnsOrderItem(executor, authenticatedUserId, itemId) {
  const rows = await selectRows(
    executor,
    `
      SELECT
        oi.item_id,
        oi.order_id,
        o.booking_id,
        o.status,
        b.user_id
      FROM order_items oi
      JOIN orders o ON o.order_id = oi.order_id
      JOIN booking b ON b.booking_id = o.booking_id
      WHERE oi.item_id = ?
      LIMIT 1
    `,
    [itemId]
  );

  const item = rows[0];

  if (!item) {
    throw buildNotFoundError("Order item");
  }

  if (Number(item.user_id || 0) !== Number(authenticatedUserId || 0)) {
    throw buildOwnershipError("order item");
  }

  return item;
}

module.exports = {
  ensureSameUser,
  ensureUserOwnsBill,
  ensureUserOwnsBooking,
  ensureUserOwnsOrder,
  ensureUserOwnsOrderItem,
};
