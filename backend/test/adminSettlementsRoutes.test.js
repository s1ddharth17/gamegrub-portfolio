const test = require("node:test");
const assert = require("node:assert/strict");

function loadAdminSettlementRoutesModule() {
  const modulePath = require.resolve("../routes/adminSettlements");
  delete require.cache[modulePath];
  return require("../routes/adminSettlements");
}

function createFakeRouter() {
  const routes = {
    get: [],
    post: [],
    put: [],
  };

  return {
    routes,
    get(path, ...handlers) {
      routes.get.push({ path, handlers });
      return this;
    },
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

test("settlement summary route returns scoped summary and recent payouts", async (t) => {
  const settlements = require("../utils/settlements");
  const businessAccess = require("../utils/businessAccess");

  t.mock.method(businessAccess, "resolveScopedAdminBusinessId", async () => 7);
  t.mock.method(settlements, "getSettlementSummary", async ({ businessId }) => {
    assert.equal(businessId, 7);
    return { business_id: 7, unsettled_seller_net_amount: 820 };
  });
  t.mock.method(settlements, "listBusinessPayouts", async ({ businessId, limit }) => {
    assert.equal(businessId, 7);
    assert.equal(limit, 5);
    return [{ payout_id: 3, status: "pending" }];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/adminSettlements")];
  });

  const { registerAdminSettlementRoutes } = loadAdminSettlementRoutesModule();
  const router = createFakeRouter();
  registerAdminSettlementRoutes(router);

  const handler = getRouteHandler(router, "get", "/summary");
  const res = createResponseRecorder();

  await handler({ query: { business_id: "7" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.business_id, 7);
  assert.equal(res.body.recent_payouts[0].payout_id, 3);
});

test("payout request route creates a payout request and returns refreshed summary", async (t) => {
  const settlements = require("../utils/settlements");
  const businessAccess = require("../utils/businessAccess");

  t.mock.method(businessAccess, "resolveScopedAdminBusinessId", async () => 9);
  t.mock.method(settlements, "createBusinessPayoutRequest", async (payload) => {
    assert.deepEqual(payload, {
      businessId: 9,
      requestedByAdminId: 14,
      cutoffDate: "2026-06-07",
      notes: "Weekend batch",
    });

    return { payout_id: 12, status: "pending" };
  });
  t.mock.method(settlements, "getSettlementSummary", async ({ businessId }) => {
    assert.equal(businessId, 9);
    return { business_id: 9, pending_payout_amount: 1250 };
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/adminSettlements")];
  });

  const { registerAdminSettlementRoutes } = loadAdminSettlementRoutesModule();
  const router = createFakeRouter();
  registerAdminSettlementRoutes(router);

  const handler = getRouteHandler(router, "post", "/payouts/request");
  const res = createResponseRecorder();

  await handler(
    {
      body: {
        business_id: 9,
        cutoff_date: "2026-06-07",
        notes: "Weekend batch",
      },
      admin: { id: 14 },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message, "Payout request created.");
  assert.equal(res.body.payout.payout_id, 12);
  assert.equal(res.body.summary.pending_payout_amount, 1250);
});

test("payout status route validates access and returns updated payout", async (t) => {
  const settlements = require("../utils/settlements");
  const businessAccess = require("../utils/businessAccess");

  t.mock.method(settlements, "getBusinessPayoutById", async ({ payoutId }) => {
    assert.equal(payoutId, "4");
    return { payout_id: 4, business_id: 11, status: "pending" };
  });
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async (admin, businessId) => {
    assert.equal(admin.id, 2);
    assert.equal(businessId, 11);
  });
  t.mock.method(settlements, "updateBusinessPayoutStatus", async (payload) => {
    assert.deepEqual(payload, {
      payoutId: "4",
      status: "paid",
      paidByAdminId: 2,
      payoutReference: "UTR-7788",
      notes: "Released to cafe owner",
    });
    return { payout_id: 4, business_id: 11, status: "paid" };
  });
  t.mock.method(settlements, "getSettlementSummary", async ({ businessId }) => {
    assert.equal(businessId, 11);
    return { business_id: 11, paid_payout_amount: 2400 };
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/adminSettlements")];
  });

  const { registerAdminSettlementRoutes } = loadAdminSettlementRoutesModule();
  const router = createFakeRouter();
  registerAdminSettlementRoutes(router);

  const handler = getRouteHandler(router, "put", "/payouts/:id/status");
  const res = createResponseRecorder();

  await handler(
    {
      params: { id: "4" },
      body: {
        status: "paid",
        payout_reference: "UTR-7788",
        notes: "Released to cafe owner",
      },
      admin: { id: 2 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Payout status updated.");
  assert.equal(res.body.payout.status, "paid");
  assert.equal(res.body.summary.paid_payout_amount, 2400);
});
