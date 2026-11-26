const test = require("node:test");
const assert = require("node:assert/strict");

function createFakeRouter() {
  const routes = { get: [], post: [], put: [] };
  return {
    routes,
    get(path, ...handlers) { routes.get.push({ path, handlers }); return this; },
    post(path, ...handlers) { routes.post.push({ path, handlers }); return this; },
    put(path, ...handlers) { routes.put.push({ path, handlers }); return this; },
  };
}

function fakeRouterForTest(t) {
  const express = require("express");
  const router = createFakeRouter();
  t.mock.method(express, "Router", () => router);
  return router;
}

function responseRecorder(onStatus = () => {}) {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; onStatus(code); return this; },
    json(body) { this.body = body; return this; },
  };
}

test("business management endpoints require the super-admin permission chain", (t) => {
  const router = fakeRouterForTest(t);
  const adminAuth = require("../middleware/adminAuth");
  const modulePath = require.resolve("../routes/businessAdmin");
  delete require.cache[modulePath];
  require("../routes/businessAdmin");
  delete require.cache[modulePath];

  const route = router.routes.get.find((entry) => entry.path === "/");
  assert.ok(route, "Expected the business manager list endpoint.");
  assert.equal(route.handlers[0], adminAuth.requireActiveAdmin);
  assert.equal(route.handlers[2], adminAuth.requireSuperAdmin);

  const denied = responseRecorder();
  let deniedNext = false;
  route.handlers[1]({ admin: { id: 8, role: "admin" } }, denied, () => { deniedNext = true; });
  assert.equal(denied.statusCode, 403);
  assert.equal(deniedNext, false);

  let allowedNext = false;
  route.handlers[1]({ admin: { id: 1, role: "super_admin" } }, responseRecorder(), () => { allowedNext = true; });
  assert.equal(allowedNext, true);
});

test("a standard admin cannot update a menu item owned by another cafe", async (t) => {
  const router = fakeRouterForTest(t);
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  let queryCount = 0;
  t.mock.method(db, "query", async () => {
    queryCount += 1;
    return [{ id: 91, business_id: 22, image: null }];
  });
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async (_admin, businessId) => {
    assert.equal(businessId, 22);
    const error = new Error("You do not have access to this business.");
    error.statusCode = 403;
    throw error;
  });

  const modulePath = require.resolve("../routes/menu");
  delete require.cache[modulePath];
  require("../routes/menu");
  const route = router.routes.put.find((entry) => entry.path === "/update/:id");
  assert.ok(route, "Expected the menu update endpoint.");
  const handler = route.handlers[route.handlers.length - 1];
  const res = responseRecorder();
  await handler({ params: { id: "91" }, body: { business_id: 11 }, admin: { id: 5, role: "admin" } }, res);
  delete require.cache[modulePath];

  assert.equal(res.statusCode, 403);
  assert.equal(queryCount, 1, "The menu row is read, but no update should be issued.");
});

test("a standard admin cannot update a station owned by another cafe", async (t) => {
  const router = fakeRouterForTest(t);
  const db = require("../config/db");
  const businessAccess = require("../utils/businessAccess");
  let queryCount = 0;
  let complete;
  const completed = new Promise((resolve) => { complete = resolve; });
  t.mock.method(db, "query", (_sql, _params, callback) => {
    queryCount += 1;
    callback(null, [{ business_id: 22 }]);
  });
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async (_admin, businessId) => {
    assert.equal(businessId, 22);
    const error = new Error("You do not have access to this business.");
    error.statusCode = 403;
    throw error;
  });

  const modulePath = require.resolve("../routes/pc");
  delete require.cache[modulePath];
  require("../routes/pc");
  const route = router.routes.put.find((entry) => entry.path === "/update/:id");
  assert.ok(route, "Expected the station update endpoint.");
  const handler = route.handlers[route.handlers.length - 1];
  const res = responseRecorder((code) => { if (code !== 200) complete(); });
  await handler({ params: { id: "37" }, body: { business_id: 11 }, admin: { id: 5, role: "admin" } }, res);
  await completed;
  delete require.cache[modulePath];

  assert.equal(res.statusCode, 403);
  assert.equal(queryCount, 1, "The station row is read, but no update should be issued.");
});
