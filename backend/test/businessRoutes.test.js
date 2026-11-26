const test = require("node:test");
const assert = require("node:assert/strict");

function loadBusinessRoutesModule() {
  const modulePath = require.resolve("../routes/business");
  delete require.cache[modulePath];
  return require("../routes/business");
}

function createFakeRouter() {
  const routes = {
    get: [],
    post: [],
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

test("public business list route clamps limit and returns platform cafes", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "listPublicBusinesses", async ({ limit }) => {
    assert.equal(limit, 100);
    return [{ business_id: 1, name: "GameGrub Cafe" }];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "get", "/all");
  const res = createResponseRecorder();

  await handler({ query: { limit: "400" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ business_id: 1, name: "GameGrub Cafe" }]);
});

test("business detail route returns 404 when a cafe is not found", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "getPublicBusinessDetails", async (identifier) => {
    assert.equal(identifier, "missing-cafe");
    return null;
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "get", "/details/:slugOrId");
  const res = createResponseRecorder();

  await handler({ params: { slugOrId: "missing-cafe" } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Business not found." });
});

test("admin access route returns the businesses visible to the current admin", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "listAccessibleBusinessesForAdmin", async (admin) => {
    assert.equal(admin.id, 9);
    return [{ business_id: 2, membership_role: "manager" }];
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "get", "/admin/access");
  const res = createResponseRecorder();

  await handler({ admin: { id: 9, role: "admin" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ business_id: 2, membership_role: "manager" }]);
});

test("public business reviews route returns the review feed for a cafe", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "listPublicBusinessReviews", async (identifier, options) => {
    assert.equal(identifier, "gg-arena");
    assert.equal(options.limit, 12);
    return {
      business_id: 4,
      average_rating: 4.7,
      review_count: 9,
      reviews: [{ review_id: 1, rating: 5 }],
    };
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "get", "/reviews/:slugOrId");
  const res = createResponseRecorder();

  await handler({ params: { slugOrId: "gg-arena" }, query: { limit: "12" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.review_count, 9);
  assert.deepEqual(res.body.reviews, [{ review_id: 1, rating: 5 }]);
});

test("review state route returns the current user's eligibility and review", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "getUserBusinessReviewState", async ({ businessId, userId }) => {
    assert.equal(businessId, "7");
    assert.equal(userId, 44);
    return {
      business_id: 7,
      can_review: true,
      proof_bill_id: 51,
      review: { review_id: 3, rating: 4 },
    };
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "get", "/review-state/:businessId");
  const res = createResponseRecorder();

  await handler({ params: { businessId: "7" }, user: { id: 44 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.can_review, true);
  assert.equal(res.body.review.review_id, 3);
});

test("review submit route forwards the normalized payload to the business service", async (t) => {
  const businessService = require("../utils/businesses");

  t.mock.method(businessService, "upsertUserBusinessReview", async (payload) => {
    assert.deepEqual(payload, {
      businessId: 7,
      userId: 44,
      rating: 5,
      reviewTitle: "Loved the late-night queue",
      reviewText: "The cafe handled our booking fast and the rigs stayed smooth.",
    });

    return {
      message: "Review published.",
      review: { review_id: 18, rating: 5 },
    };
  });

  t.after(() => {
    delete require.cache[require.resolve("../routes/business")];
  });

  const { registerBusinessRoutes } = loadBusinessRoutesModule();
  const router = createFakeRouter();
  registerBusinessRoutes(router);

  const handler = getRouteHandler(router, "post", "/review");
  const res = createResponseRecorder();

  await handler(
    {
      body: {
        business_id: 7,
        rating: 5,
        title: "Loved the late-night queue",
        review_text: "The cafe handled our booking fast and the rigs stayed smooth.",
      },
      user: { id: 44 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Review published.");
  assert.equal(res.body.review.review_id, 18);
});
