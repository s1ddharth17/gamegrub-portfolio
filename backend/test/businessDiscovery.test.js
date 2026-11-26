const test = require("node:test");
const assert = require("node:assert/strict");

function loadBusinessService(t, queryStub) {
  const db = require("../utils/db");
  t.mock.method(db, "query", queryStub);
  const modulePath = require.resolve("../utils/businesses");
  delete require.cache[modulePath];
  t.after(() => delete require.cache[modulePath]);
  return require(modulePath);
}

function fakeRouter() {
  const routes = { get: [], post: [] };
  return {
    routes,
    get(path, ...handlers) { routes.get.push({ path, handlers }); return this; },
    post(path, ...handlers) { routes.post.push({ path, handlers }); return this; },
  };
}

function recorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("cafe open-now checks use the cafe timezone and support overnight hours", () => {
  const service = require("../utils/businesses");
  assert.equal(service.isBusinessOpenNow({ opens_at: "09:00:00", closes_at: "23:00:00", timezone: "Asia/Kolkata" }, new Date("2026-10-25T10:00:00Z")), true);
  assert.equal(service.isBusinessOpenNow({ opens_at: "09:00:00", closes_at: "23:00:00", timezone: "Asia/Kolkata" }, new Date("2026-10-25T20:00:00Z")), false);
  assert.equal(service.isBusinessOpenNow({ opens_at: "20:00:00", closes_at: "03:00:00", timezone: "Asia/Kolkata" }, new Date("2026-10-25T21:00:00Z")), true);
});

test("cafe discovery returns only stations open for every requested hour", async (t) => {
  const calls = [];
  const service = loadBusinessService(t, async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM businesses b/.test(sql)) {
      return [
        { business_id: 3, name: "Pixel Cafe", status: "active", listing_status: "listed", opens_at: "09:00:00", closes_at: "23:00:00", timezone: "Asia/Kolkata", station_categories: "esports_pc,high_end_pc", game_titles: "Valorant||Counter-Strike 2", min_price_per_hour: 120, max_price_per_hour: 250 },
        { business_id: 4, name: "Console Corner", status: "active", listing_status: "listed", opens_at: "10:00:00", closes_at: "22:00:00", timezone: "Asia/Kolkata", station_categories: "console", game_titles: "", min_price_per_hour: 180, max_price_per_hour: 220 },
      ];
    }
    if (/FROM pc p/.test(sql)) {
      return [
        { pc_id: 18, business_id: 3, specs: "RTX 4070", category: "high_end_pc", price_per_hour: 220 },
        { pc_id: 27, business_id: 4, specs: "PS5", category: "console", price_per_hour: 180 },
      ];
    }
    throw new Error(`Unexpected discovery query: ${sql}`);
  });

  const results = await service.listPublicCafeDiscovery({ date: "2026-10-26", startHour: 18, durationHours: 3 });

  assert.equal(results.length, 2);
  assert.deepEqual(results[0].station_categories, ["esports_pc", "high_end_pc"]);
  assert.deepEqual(results[0].game_titles, ["Valorant", "Counter-Strike 2"]);
  assert.equal(results[0].available_setups[0].pc_id, 18);
  assert.deepEqual(results[0].availability_window, { date: "2026-10-26", start_hour: 18, duration_hours: 3 });
  assert.match(calls[1].sql, /b\.status NOT IN \('cancelled', 'closed', 'completed'\)/);
  assert.match(calls[1].sql, /station_waitlist_openings/);
  assert.deepEqual(calls[1].params.slice(-7), ["2026-10-26", 18, 19, 20, "2026-10-26", 21, 18]);
});

test("cafe discovery rejects invalid calendar dates and session windows", async (t) => {
  let calls = 0;
  const service = loadBusinessService(t, async () => { calls += 1; return []; });
  await assert.rejects(service.listPublicCafeDiscovery({ date: "2026-02-31", startHour: 18, durationHours: 2 }), { statusCode: 400 });
  await assert.rejects(service.listPublicCafeDiscovery({ date: "2026-10-26", startHour: 22, durationHours: 3 }), { statusCode: 400 });
  assert.equal(calls, 0);
});

test("public discovery route forwards the live booking window", async (t) => {
  const service = require("../utils/businesses");
  t.mock.method(service, "listPublicCafeDiscovery", async (window) => {
    assert.deepEqual(window, { date: "2026-10-26", startHour: "18", durationHours: "2" });
    return [{ business_id: 3, available_setups: [{ pc_id: 18 }] }];
  });
  const modulePath = require.resolve("../routes/business");
  delete require.cache[modulePath];
  t.after(() => delete require.cache[modulePath]);
  const { registerBusinessRoutes } = require(modulePath);
  const router = fakeRouter();
  registerBusinessRoutes(router);
  const handler = router.routes.get.find((route) => route.path === "/discovery").handlers.at(-1);
  const res = recorder();

  await handler({ query: { date: "2026-10-26", start_hour: "18", duration_hours: "2" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].available_setups[0].pc_id, 18);
});
