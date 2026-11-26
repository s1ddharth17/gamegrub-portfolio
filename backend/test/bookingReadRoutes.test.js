const test = require("node:test");
const assert = require("node:assert/strict");

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

test("booking read routes remain registered and format customer booking windows", async (t) => {
  const db = require("../utils/db");
  const queryCalls = [];
  t.mock.method(db, "query", async (sql, params = []) => {
    queryCalls.push({ sql, params });
    return [{
      booking_id: 501,
      pc_id: 7,
      booking_date: "2026-10-25",
      status: "confirmed",
      total_hours: 2,
      start_hour: 10,
      end_hour: 11,
    }];
  });

  const bookingPath = require.resolve("../routes/booking");
  const readRoutesPath = require.resolve("../routes/bookingReadRoutes");
  delete require.cache[bookingPath];
  delete require.cache[readRoutesPath];
  t.after(() => {
    delete require.cache[bookingPath];
    delete require.cache[readRoutesPath];
  });

  const router = require("../routes/booking");
  const readPaths = [
    "/user/:id",
    "/check-in-code/:id",
    "/user-bookings",
    "/current-session",
  ];
  for (const path of readPaths) {
    assert.ok(
      router.stack.some((layer) => layer.route?.path === path),
      `Expected GET ${path} to remain registered.`,
    );
  }

  const route = router.stack.find(
    (layer) => layer.route?.path === "/user-bookings" && layer.route.methods.get,
  ).route;
  const res = createResponseRecorder();
  await route.stack.at(-1).handle({ user: { id: 11 }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    data: [{
      booking_id: 501,
      pc_id: 7,
      booking_date: "2026-10-25",
      status: "confirmed",
      total_hours: 2,
      start_hour: 10,
      end_hour: 11,
      time_range: "10:00 - 12:00",
    }],
  });
  assert.deepEqual(queryCalls[0].params, [11]);
});
