const test = require("node:test");
const assert = require("node:assert/strict");

function loadTournamentPublicRoutesModule() {
  const modulePath = require.resolve("../routes/tournamentPublicRoutes");
  delete require.cache[modulePath];
  return require("../routes/tournamentPublicRoutes");
}

function createFakeRouter() {
  const routes = {
    get: [],
  };

  return {
    routes,
    get(path, ...handlers) {
      routes.get.push({ path, handlers });
      return this;
    },
  };
}

function getRouteHandler(router, path) {
  const route = router.routes.get.find((entry) => entry.path === path);
  assert.ok(route, `Expected GET ${path} to be registered.`);
  return route.handlers[route.handlers.length - 1];
}

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

test("public tournament list route forwards an optional business filter", async (t) => {
  const db = require("../utils/db");

  t.mock.method(db, "query", async (sql, params) => {
    assert.match(sql, /AND business_id = \?/);
    assert.deepEqual(params, ["published", 7]);
    return [
      {
        tournament_id: 15,
        business_id: 7,
        business_name: "Arena One",
        title: "Night Clash",
        game_title: "Valorant",
        format: "team",
        team_size: 5,
        max_participants: 16,
        registered_count: 8,
        entry_fee: 0,
        prize_pool: 5000,
        sponsor_prize_contribution: 0,
        refund_policy: "no_refunds",
        refund_cutoff_hours: 24,
        refund_percentage: 100,
        location_label: "Arena One",
        status: "published",
        operations_stage: "registrations",
        is_featured: 0,
        seeded_count: 0,
        bracket_match_count: 0,
        completed_bracket_match_count: 0,
        checked_in_count: 0,
        no_show_count: 0,
        waitlist_count: 0,
      },
    ];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/tournamentPublicRoutes")];
  });

  const { registerTournamentPublicRoutes } = loadTournamentPublicRoutesModule();
  const router = createFakeRouter();
  registerTournamentPublicRoutes(router);

  const handler = getRouteHandler(router, "/all");
  const res = createResponseRecorder();

  await handler({ query: { business_id: "7" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body[0]?.business_id, 7);
  assert.equal(res.body[0]?.business_name, "Arena One");
});

test("public community route requires published active posts and orders them safely", async (t) => {
  const db = require("../utils/db");
  let queryText = "";
  let queryParams = [];

  t.mock.method(db, "query", async (sql, params) => {
    queryText = sql;
    queryParams = params;
    return [
      {
        post_id: 12,
        status: "published",
        published_at: "2026-10-20T12:00:00.000Z",
        starts_at: "2026-10-20T12:00:00.000Z",
        ends_at: "2099-10-20T12:00:00.000Z",
        title: "Weekend Final",
        summary: "The final starts this weekend.",
        priority: 5,
        linked_tournament_id: 45,
        linked_tournament_tournament_id: 45,
        linked_tournament_slug: "weekend-final",
        linked_tournament_title: "Weekend Final",
        linked_tournament_status: "published",
      },
      {
        post_id: 11,
        status: "draft",
        published_at: null,
        title: "Internal draft",
        summary: "This stays private.",
      },
      {
        post_id: 10,
        status: "published",
        published_at: "2026-10-01T12:00:00.000Z",
        starts_at: "2026-10-01T12:00:00.000Z",
        ends_at: "2026-10-02T12:00:00.000Z",
        title: "Expired recap",
        summary: "This window has ended.",
      },
      {
        post_id: 9,
        status: "published",
        published_at: null,
        starts_at: "2026-10-20T12:00:00.000Z",
        ends_at: "2099-10-20T12:00:00.000Z",
        title: "Unpublished post",
        summary: "A timestamp is required.",
      },
      {
        post_id: 8,
        status: "published",
        published_at: "2026-10-20T12:00:00.000Z",
        starts_at: "2099-10-20T12:00:00.000Z",
        ends_at: "2099-10-21T12:00:00.000Z",
        title: "Upcoming spotlight",
        summary: "This has not started.",
      },
      {
        post_id: 7,
        status: "published",
        published_at: "2026-10-20T12:00:00.000Z",
        starts_at: "2026-10-20T12:00:00.000Z",
        ends_at: "2099-10-20T12:00:00.000Z",
        title: "Linked draft event",
        summary: "The post is live, but its linked event is not.",
        linked_tournament_id: 87,
      },
    ];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/tournamentPublicRoutes")];
  });

  const { registerTournamentPublicRoutes } = loadTournamentPublicRoutesModule();
  const router = createFakeRouter();
  registerTournamentPublicRoutes(router);

  const handler = getRouteHandler(router, "/community");
  const res = createResponseRecorder();

  await handler({ query: { limit: "8" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(queryText, /tcp\.status = \?/);
  assert.match(queryText, /tcp\.published_at IS NOT NULL/);
  assert.match(queryText, /tcp\.starts_at IS NULL OR tcp\.starts_at <= NOW\(\)/);
  assert.match(queryText, /tcp\.ends_at IS NULL OR tcp\.ends_at >= NOW\(\)/);
  assert.match(queryText, /lt\.status = \?/);
  assert.match(queryText, /ORDER BY\s+tcp\.priority DESC,\s+COALESCE\(tcp\.published_at, tcp\.updated_at\) DESC/);
  assert.deepEqual(queryParams, ["published", "published", 8]);
  assert.deepEqual(res.body.map((post) => post.post_id), [12, 7]);
  assert.equal(res.body[0].linked_tournament.slug, "weekend-final");
  assert.equal(res.body[1].linked_tournament_id, null);
  assert.equal(res.body[1].linked_tournament, null);
});

test("public tournament details never resolve an unpublished linked event", async (t) => {
  const db = require("../utils/db");
  let queryText = "";
  let queryParams = [];

  t.mock.method(db, "query", async (sql, params) => {
    queryText = sql;
    queryParams = params;
    return [];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/tournamentPublicRoutes")];
  });

  const { registerTournamentPublicRoutes } = loadTournamentPublicRoutesModule();
  const router = createFakeRouter();
  registerTournamentPublicRoutes(router);

  const handler = getRouteHandler(router, "/details/:slugOrId");
  const res = createResponseRecorder();

  await handler({ params: { slugOrId: "45" } }, res);

  assert.equal(res.statusCode, 404);
  assert.match(queryText, /WHERE status = \?/);
  assert.deepEqual(queryParams, ["published", "45", 45]);
});
