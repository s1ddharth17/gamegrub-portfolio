const test = require("node:test");
const assert = require("node:assert/strict");

function loadSupportRouter(t, { query, withTransaction, requireAdminBusinessAccess } = {}) {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  if (query) t.mock.method(db, "query", query);
  if (withTransaction) t.mock.method(db, "withTransaction", withTransaction);
  if (requireAdminBusinessAccess) {
    t.mock.method(businessAccess, "requireAdminBusinessAccess", requireAdminBusinessAccess);
  }

  const modulePath = require.resolve("../routes/support");
  delete require.cache[modulePath];
  t.after(() => delete require.cache[modulePath]);
  return require(modulePath);
}

function getHandler(router, method, path) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods?.[method]);
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route.`);
  return layer.route.stack.at(-1).handle;
}

function responseRecorder() {
  return {
    body: null,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function supportIssue(overrides = {}) {
  return {
    issue_id: 42,
    issue_number: "GGH-261025-A1B2C3D4",
    user_id: 12,
    business_id: 5,
    booking_id: null,
    order_id: null,
    bill_id: null,
    category: "service",
    subject: "Need a little help",
    description: "Please help me understand what happened.",
    status: "open",
    priority: "normal",
    assigned_admin_id: null,
    resolution_summary: null,
    business_name: "Pixel Cafe",
    business_phone: "9876543210",
    business_contact_email: "help@pixel.example",
    customer_name: "Player One",
    assigned_admin_name: "Cafe Operator",
    created_at: "2026-10-25 10:00:00",
    updated_at: "2026-10-25 10:00:00",
    ...overrides,
  };
}

test("customer can create a cafe help request and receives a safe customer view", async (t) => {
  const events = [];
  const inserted = [];
  const issue = supportIssue();
  const connection = {
    async query(sql, params = []) {
      if (/SELECT business_id FROM businesses/.test(sql)) return [[{ business_id: 5 }]];
      if (/INSERT INTO support_issues/.test(sql)) {
        inserted.push(params);
        return [{ insertId: 42 }];
      }
      if (/INSERT INTO support_issue_events/.test(sql)) {
        events.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/SELECT i\.\*/.test(sql)) return [[issue]];
      if (/FROM support_issue_events/.test(sql)) {
        return [[{
          event_id: 1, issue_id: 42, actor_type: "user", actor_id: 12,
          event_type: "created", message: "Support request submitted.",
          is_internal: 0, created_at: issue.created_at,
        }]];
      }
      throw new Error(`Unexpected support test query: ${sql}`);
    },
  };
  const router = loadSupportRouter(t, {
    withTransaction: async (work) => work(connection),
  });
  const res = responseRecorder();

  await getHandler(router, "post", "/issues")({
    body: { business_id: 5, category: "service", subject: issue.subject, description: issue.description },
    user: { id: 12 },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(inserted.length, 1);
  assert.equal(events.length, 1);
  assert.equal(res.body.issue.business_name, "Pixel Cafe");
  assert.equal(res.body.issue.business_phone, "9876543210");
  assert.equal("user_id" in res.body.issue, false);
  assert.equal("assigned_admin_name" in res.body.issue, false);
  assert.equal(res.body.issue.events.length, 1);
});

test("customer cannot file an issue against somebody else's booking", async (t) => {
  let issueInsertCount = 0;
  const connection = {
    async query(sql) {
      if (/FROM booking WHERE booking_id/.test(sql)) {
        return [[{ booking_id: 90, business_id: 5, user_id: 88 }]];
      }
      if (/INSERT INTO support_issues/.test(sql)) issueInsertCount += 1;
      throw new Error(`Unexpected support test query: ${sql}`);
    },
  };
  const router = loadSupportRouter(t, {
    withTransaction: async (work) => work(connection),
  });
  const res = responseRecorder();

  await getHandler(router, "post", "/issues")({
    body: { booking_id: 90, subject: "Help with booking", description: "This is a sufficiently detailed report." },
    user: { id: 12 },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(issueInsertCount, 0);
});

test("customer issue timeline omits internal events and staff identity", async (t) => {
  const issue = supportIssue();
  const router = loadSupportRouter(t, {
    query: async (sql) => {
      if (/SELECT issue_id, user_id FROM support_issues/.test(sql)) return [{ issue_id: 42, user_id: 12 }];
      if (/SELECT i\.\*/.test(sql)) return [issue];
      if (/FROM support_issue_events/.test(sql)) {
        assert.match(sql, /AND e\.is_internal=0/);
        assert.match(sql, /'Cafe support'/);
        return [{
          event_id: 1, issue_id: 42, actor_type: "admin", actor_id: 9,
          actor_name: "Cafe support", event_type: "comment", message: "We are checking this.",
          is_internal: 0, created_at: issue.updated_at,
        }];
      }
      throw new Error(`Unexpected support test query: ${sql}`);
    },
  });
  const res = responseRecorder();

  await getHandler(router, "get", "/issues/:id")({ params: { id: "42" }, user: { id: 12 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.events.length, 1);
  assert.equal(res.body.events[0].actor_name, "Cafe support");
});

test("cafe admin can assign and resolve a request with an auditable status history", async (t) => {
  const issue = supportIssue();
  const writtenEvents = [];
  const connection = {
    async query(sql, params = []) {
      if (/SELECT \* FROM support_issues/.test(sql)) return [[{ ...issue }]];
      if (/UPDATE support_issues SET status=\?/.test(sql)) {
        [issue.status, issue.priority, issue.assigned_admin_id, issue.resolution_summary] = params;
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO support_issue_events/.test(sql)) {
        writtenEvents.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/SELECT i\.\*/.test(sql)) return [[issue]];
      if (/FROM support_issue_events/.test(sql)) {
        return [writtenEvents.map((event, index) => ({
          event_id: index + 1, issue_id: 42, actor_type: event[1], actor_id: event[2],
          event_type: event[3], message: event[4], old_value: event[5], new_value: event[6],
          is_internal: event[7], actor_name: "Cafe Operator", created_at: issue.updated_at,
        }))];
      }
      throw new Error(`Unexpected support test transaction query: ${sql}`);
    },
  };
  const router = loadSupportRouter(t, {
    query: async (sql) => {
      if (/SELECT issue_id, business_id FROM support_issues/.test(sql)) return [{ issue_id: 42, business_id: 5 }];
      if (/SELECT a\.id, a\.role/.test(sql)) return [{ id: 19, role: "admin" }];
      throw new Error(`Unexpected support admin query: ${sql}`);
    },
    withTransaction: async (work) => work(connection),
    requireAdminBusinessAccess: async (admin, businessId) => {
      assert.equal(admin.id, 19);
      assert.equal(businessId, 5);
    },
  });
  const res = responseRecorder();

  await getHandler(router, "put", "/admin/issues/:id")({
    params: { id: "42" },
    admin: { id: 19, role: "admin" },
    body: { status: "resolved", priority: "urgent", assigned_admin_id: 19, resolution_summary: "Cafe replaced the faulty controller." },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.issue.status, "resolved");
  assert.equal(res.body.issue.assigned_admin_id, 19);
  assert.equal(res.body.issue.resolution_summary, "Cafe replaced the faulty controller.");
  assert.deepEqual(writtenEvents.map((event) => event[3]), ["status_changed", "priority_changed", "assignment_changed", "resolution_added"]);
  assert.equal(writtenEvents.find((event) => event[3] === "priority_changed")[7], 1);
});

test("admin private notes are audit events and both customer and admin routes are guarded", async (t) => {
  const issue = supportIssue();
  const writtenEvents = [];
  const connection = {
    async query(sql, params = []) {
      if (/SELECT status FROM support_issues/.test(sql)) return [[{ status: "assigned" }]];
      if (/UPDATE support_issues SET updated_at=NOW\(\)/.test(sql)) return [{ affectedRows: 1 }];
      if (/INSERT INTO support_issue_events/.test(sql)) {
        writtenEvents.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/SELECT i\.\*/.test(sql)) return [[issue]];
      if (/FROM support_issue_events/.test(sql)) {
        return [writtenEvents.map((event, index) => ({
          event_id: index + 1, issue_id: 42, actor_type: event[1], actor_id: event[2],
          event_type: event[3], message: event[4], old_value: event[5], new_value: event[6],
          is_internal: event[7], actor_name: "Cafe Operator", created_at: issue.updated_at,
        }))];
      }
      throw new Error(`Unexpected support note query: ${sql}`);
    },
  };
  const router = loadSupportRouter(t, {
    query: async (sql) => {
      if (/SELECT issue_id, business_id FROM support_issues/.test(sql)) return [{ issue_id: 42, business_id: 5 }];
      throw new Error(`Unexpected support admin lookup: ${sql}`);
    },
    withTransaction: async (work) => work(connection),
    requireAdminBusinessAccess: async (_admin, businessId) => assert.equal(businessId, 5),
  });
  const res = responseRecorder();
  const adminRoute = router.stack.find((item) => item.route?.path === "/admin/issues/:id/comments" && item.route.methods.post);
  const customerRoute = router.stack.find((item) => item.route?.path === "/issues/:id" && item.route.methods.get);
  assert.equal(adminRoute.route.stack.length, 3);
  assert.equal(customerRoute.route.stack.length, 2);

  await getHandler(router, "post", "/admin/issues/:id/comments")({
    params: { id: "42" },
    admin: { id: 19, role: "admin" },
    body: { message: "Check the terminal log before replying.", internal: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(writtenEvents.length, 1);
  assert.equal(writtenEvents[0][7], 1);
  assert.equal(res.body.issue.events[0].is_internal, true);
});
