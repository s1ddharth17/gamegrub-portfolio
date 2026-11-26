const test = require("node:test");
const assert = require("node:assert/strict");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function statusHandler(router) {
  const route = router.stack.find(
    (layer) => layer.route?.path === "/status/:order_id" && layer.route.methods?.put,
  );
  assert.ok(route, "order status route is registered");
  assert.ok(route.route.stack.length >= 3, "admin auth and permission middleware protect the route");
  return route.route.stack.at(-1).handle;
}

function orderConnection(status = "active", etaMinutes = null) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT order_id, business_id, booking_id, status, eta_minutes/.test(sql)) {
        return [[{
          order_id: 44,
          business_id: 3,
          booking_id: 501,
          status,
          eta_minutes: etaMinutes,
        }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

function loadFreshOrderRoute() {
  const modulePath = require.resolve("../routes/order");
  delete require.cache[modulePath];
  return require(modulePath);
}

test("kitchen status update records the authorized preparing transition and ETA", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const connection = orderConnection();
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async (admin, businessId) => {
    assert.equal(admin.id, 7);
    assert.equal(businessId, 3);
  });
  t.after(() => delete require.cache[require.resolve("../routes/order")]);

  const handler = statusHandler(loadFreshOrderRoute());
  const res = responseRecorder();
  await handler({
    params: { order_id: "44" },
    body: { status: "preparing", eta_minutes: "20" },
    admin: { id: 7 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "preparing");
  const update = connection.calls.find((call) => /UPDATE orders SET/.test(call.sql));
  assert.match(update.sql, /preparing_at = UTC_TIMESTAMP\(\)/);
  assert.match(update.sql, /eta_minutes = \?/);
  assert.match(update.sql, /eta_at = \?/);
  assert.equal(update.params[1], 20);
  const history = connection.calls.find((call) => /INSERT INTO order_status_history/.test(call.sql));
  assert.deepEqual(history.params, [44, "accepted", "preparing", 7, 44]);
});

test("kitchen cannot skip order stages or cross the assigned business scope", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const connection = orderConnection();
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async () => {
    const error = new Error("You do not have access to this business.");
    error.statusCode = 403;
    throw error;
  });
  t.after(() => delete require.cache[require.resolve("../routes/order")]);

  const handler = statusHandler(loadFreshOrderRoute());
  const res = responseRecorder();
  await handler({
    params: { order_id: "44" },
    body: { status: "ready" },
    admin: { id: 7 },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(connection.calls.some((call) => /UPDATE orders SET/.test(call.sql)), false);
  assert.equal(connection.calls.some((call) => /INSERT INTO order_status_history/.test(call.sql)), false);
});

test("kitchen cannot skip accepted orders directly to ready", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const connection = orderConnection("active");
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async () => undefined);
  t.after(() => delete require.cache[require.resolve("../routes/order")]);

  const handler = statusHandler(loadFreshOrderRoute());
  const res = responseRecorder();
  await handler({
    params: { order_id: "44" },
    body: { status: "ready" },
    admin: { id: 7 },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /must move from accepted to preparing next/);
  assert.equal(connection.calls.some((call) => /UPDATE orders SET/.test(call.sql)), false);
});

test("ready orders send one idempotent customer notification", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const notifications = require("../utils/customerNotifications");
  const connection = orderConnection("preparing", 20);
  let notification;
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(db, "query", async (sql) => {
    assert.match(sql, /SELECT user_id FROM booking/);
    return [{ user_id: 99 }];
  });
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async () => undefined);
  t.mock.method(notifications, "createCustomerNotification", async (_db, payload) => {
    notification = payload;
  });
  t.after(() => delete require.cache[require.resolve("../routes/order")]);

  const handler = statusHandler(loadFreshOrderRoute());
  const res = responseRecorder();
  await handler({
    params: { order_id: "44" },
    body: { status: "ready" },
    admin: { id: 7 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "ready");
  assert.equal(notification.userId, 99);
  assert.equal(notification.idempotencyKey, "order:44:ready");
  assert.ok(connection.calls.some((call) => /ready_at = UTC_TIMESTAMP\(\)/.test(call.sql)));
});
