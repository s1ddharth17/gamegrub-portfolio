const test = require("node:test");
const assert = require("node:assert/strict");

function routeHandler(router, method, path) {
  const route = router.routes[method].find((entry) => entry.path === path);
  assert.ok(route, `Expected ${method.toUpperCase()} ${path} to be registered.`);
  return route.handlers[route.handlers.length - 1];
}

function createRouter() {
  const routes = { get: [], post: [] };
  return {
    routes,
    get(path, ...handlers) { routes.get.push({ path, handlers }); return this; },
    post(path, ...handlers) { routes.post.push({ path, handlers }); return this; },
  };
}

function responseRecorder() {
  return {
    body: null,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("community reaction toggles are authenticated, post-scoped, and return a count", async (t) => {
  const db = require("../utils/db");
  const sqlCalls = [];
  const connection = {
    async query(sql, params) {
      sqlCalls.push({ sql, params });
      if (/SELECT post_id/.test(sql)) return [[{ post_id: 5 }], []];
      if (/SELECT reaction_id/.test(sql)) return [[], []];
      if (/SELECT COUNT\(\*\)/.test(sql)) return [[{ reaction_count: 4 }], []];
      return [{ affectedRows: 1 }, []];
    },
  };
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  const modulePath = require.resolve("../routes/tournamentCommunityInteractionRoutes");
  delete require.cache[modulePath];
  const { registerTournamentCommunityInteractionRoutes } = require(modulePath);
  t.after(() => delete require.cache[modulePath]);
  const router = createRouter();
  registerTournamentCommunityInteractionRoutes(router);
  const handler = routeHandler(router, "post", "/community/:id/reaction");
  const res = responseRecorder();

  await handler({ params: { id: "5" }, user: { id: 9 } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { liked: true, reaction_count: 4 });
  assert.match(sqlCalls[0].sql, /status = 'published'/);
  assert.deepEqual(sqlCalls[2].params, [5, 9]);
});

test("community reports validate reason and save only one report per user and post", async (t) => {
  const db = require("../utils/db");
  const insertCalls = [];
  const connection = {
    async query(sql, params) {
      if (/SELECT post_id/.test(sql)) return [[{ post_id: 5 }], []];
      if (/SELECT report_id/.test(sql)) return [[], []];
      insertCalls.push({ sql, params });
      return [{ affectedRows: 1 }, []];
    },
  };
  t.mock.method(db, "withTransaction", async (work) => work(connection));
  const modulePath = require.resolve("../routes/tournamentCommunityInteractionRoutes");
  delete require.cache[modulePath];
  const { registerTournamentCommunityInteractionRoutes } = require(modulePath);
  t.after(() => delete require.cache[modulePath]);
  const router = createRouter();
  registerTournamentCommunityInteractionRoutes(router);
  const handler = routeHandler(router, "post", "/community/:id/report");

  const invalid = responseRecorder();
  await handler({ params: { id: "5" }, user: { id: 9 }, body: { reason: "contact" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(insertCalls.length, 0);

  const accepted = responseRecorder();
  await handler({
    params: { id: "5" },
    user: { id: 9 },
    body: { reason: "abuse", details: "Please review this post." },
  }, accepted);
  assert.equal(accepted.statusCode, 201);
  assert.deepEqual(insertCalls[0].params, [5, 9, "abuse", "Please review this post."]);
});
