const test = require("node:test");
const assert = require("node:assert/strict");

function loadLifecycleRoutesModule() {
  const modulePath = require.resolve("../routes/tournamentAdminLifecycleRoutes");
  delete require.cache[modulePath];
  return require("../routes/tournamentAdminLifecycleRoutes");
}

function createFakeRouter() {
  const routes = {
    post: [],
    put: [],
  };

  return {
    routes,
    post(path, ...handlers) {
      routes.post.push({ path, handlers });
      return this;
    },
    put(path, ...handlers) {
      routes.put.push({ path, handlers });
      return this;
    },
  };
}

function getRouteHandler(router, method, path) {
  const route = router.routes[method].find((entry) => entry.path === path);
  assert.ok(route, `Expected ${method.toUpperCase()} ${path} to be registered.`);
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

test("publish route sends publish notifications without cancellation refund side effects", async (t) => {
  const db = require("../utils/db");
  const routeSupport = require("../routes/tournamentRouteSupport");
  const registrationSupport = require("../routes/tournamentRegistrationSupport");

  const emailDispatches = [];
  let refundCalls = 0;
  let notificationCalls = 0;
  const queryResults = [
    [[{ tournament_id: 7, title: "Summer Cup", status: "draft", published_at: null }]],
    [{}],
    [[{ tournament_id: 7, title: "Summer Cup", status: "published", published_at: "2026-06-04T00:00:00.000Z" }]],
  ];
  const connection = {
    async query() {
      const result = queryResults.shift();
      assert.ok(result, "Unexpected query executed in publish route test.");
      return result;
    },
  };

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(
    routeSupport,
    "createTournamentNotificationCampaignWithDeliveries",
    async () => {
      notificationCalls += 1;
      return {
        campaign: null,
        notifications: [],
        emailJobs: [{ type: "publish-notification" }],
      };
    }
  );
  t.mock.method(routeSupport, "dispatchTournamentNotificationEmails", async (jobs) => {
    emailDispatches.push(jobs);
  });
  t.mock.method(routeSupport, "getTournamentNotificationRecipients", async () => [
    { user_id: 21, registration_status: "registered", email: "player@example.com" },
  ]);
  t.mock.method(
    registrationSupport,
    "requestTournamentCancellationRefunds",
    async () => {
      refundCalls += 1;
      return {
        notificationBatch: {
          campaign: null,
          notifications: [],
          emailJobs: [{ type: "refund-notification" }],
        },
      };
    }
  );
  t.after(() => {
    delete require.cache[require.resolve("../routes/tournamentAdminLifecycleRoutes")];
  });

  const { registerTournamentAdminLifecycleRoutes } = loadLifecycleRoutesModule();
  const router = createFakeRouter();
  registerTournamentAdminLifecycleRoutes(router);

  const handler = getRouteHandler(router, "post", "/admin/publish/:id");
  const res = createResponseRecorder();

  await handler(
    {
      admin: { id: 55 },
      params: { id: "7" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.message, "Tournament published.");
  assert.equal(refundCalls, 0);
  assert.equal(notificationCalls, 1);
  assert.deepEqual(emailDispatches, [[{ type: "publish-notification" }]]);
});

test("cancel route opens tournament cancellation refunds before dispatching notifications", async (t) => {
  const db = require("../utils/db");
  const routeSupport = require("../routes/tournamentRouteSupport");
  const registrationSupport = require("../routes/tournamentRegistrationSupport");

  const emailDispatches = [];
  let refundCalls = 0;
  const queryResults = [
    [[{ tournament_id: 9, title: "Monsoon Clash", status: "published" }]],
    [{}],
    [[{ tournament_id: 9, title: "Monsoon Clash", status: "cancelled" }]],
  ];
  const connection = {
    async query() {
      const result = queryResults.shift();
      assert.ok(result, "Unexpected query executed in cancel route test.");
      return result;
    },
  };

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(
    routeSupport,
    "createTournamentNotificationCampaignWithDeliveries",
    async () => ({
      campaign: null,
      notifications: [],
      emailJobs: [{ type: "cancel-notification" }],
    })
  );
  t.mock.method(routeSupport, "dispatchTournamentNotificationEmails", async (jobs) => {
    emailDispatches.push(jobs);
  });
  t.mock.method(routeSupport, "getTournamentNotificationRecipients", async () => [
    { user_id: 41, registration_status: "registered", email: "player@example.com" },
  ]);
  t.mock.method(
    registrationSupport,
    "requestTournamentCancellationRefunds",
    async () => {
      refundCalls += 1;
      return {
        notificationBatch: {
          campaign: null,
          notifications: [],
          emailJobs: [{ type: "refund-notification" }],
        },
      };
    }
  );
  t.after(() => {
    delete require.cache[require.resolve("../routes/tournamentAdminLifecycleRoutes")];
  });

  const { registerTournamentAdminLifecycleRoutes } = loadLifecycleRoutesModule();
  const router = createFakeRouter();
  registerTournamentAdminLifecycleRoutes(router);

  const handler = getRouteHandler(router, "post", "/admin/cancel/:id");
  const res = createResponseRecorder();

  await handler(
    {
      admin: { id: 89 },
      params: { id: "9" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.message, "Tournament cancelled.");
  assert.equal(refundCalls, 1);
  assert.deepEqual(emailDispatches, [
    [{ type: "cancel-notification" }, { type: "refund-notification" }],
  ]);
});
