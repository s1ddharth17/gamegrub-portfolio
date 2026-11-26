const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function createResponseRecorder() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("admin POS read routes stay registered and scope live sessions to the selected business", async (t) => {
  const db = require("../utils/db");
  const queryCalls = [];
  t.mock.method(db, "query", async (sql, params = []) => {
    queryCalls.push({ sql, params });
    if (/FROM businesses/.test(sql)) {
      return [{ business_id: 4, name: "Arcade", status: "active", listing_status: "listed" }];
    }
    if (/FROM booking b/.test(sql) && /b\.status = 'running'/.test(sql)) {
      return [{ booking_id: 91, name: "Player", specs: "Gaming PC", running_minutes: 17 }];
    }
    throw new Error(`Unexpected admin POS query: ${sql}`);
  });

  const routePath = require.resolve("../routes/adminPosReadRoutes");
  const accessPath = require.resolve("../utils/businessAccess");
  delete require.cache[routePath];
  delete require.cache[accessPath];
  t.after(() => {
    delete require.cache[routePath];
    delete require.cache[accessPath];
  });

  const { registerAdminPosReadRoutes } = require("../routes/adminPosReadRoutes");
  const router = express.Router();
  registerAdminPosReadRoutes(router);

  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  assert.deepEqual(routePaths, ["/session/live", "/pos-sessions"]);

  const route = router.stack.find((layer) => layer.route?.path === "/session/live").route;
  assert.equal(route.stack.length, 2, "the POS permission middleware remains attached");
  const handler = route.stack.at(-1).handle;
  const res = createResponseRecorder();
  await handler(
    { query: { business_id: "4" }, admin: { id: 1, role: "super_admin" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    { booking_id: 91, name: "Player", specs: "Gaming PC", running_minutes: 17 },
  ]);
  assert.deepEqual(queryCalls.map((call) => call.params), [[4], [4]]);
});
