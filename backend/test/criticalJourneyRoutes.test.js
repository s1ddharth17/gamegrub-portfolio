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

function loadFreshRouteModule(path) {
  const modulePath = require.resolve(path);
  delete require.cache[modulePath];
  return require(path);
}

function getExpressRouteHandler(router, method, path) {
  const routeLayer = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.[method]
  );
  assert.ok(routeLayer, `Expected ${method.toUpperCase()} ${path} to be registered.`);
  return routeLayer.route.stack.at(-1).handle;
}

function createBookingConnection() {
  const calls = [];
  let bookingInserted = false;

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/FROM pc/.test(sql)) {
        return [[{
          pc_id: 7,
          business_id: 3,
          price_per_hour: 120,
          status: "active",
          commission_rate: 0,
          convenience_fee_flat: 0,
          convenience_fee_rate: 0,
        }]];
      }

      if (/SELECT uid, loyalty_points FROM users/.test(sql)) {
        return [[{ uid: 11, loyalty_points: 0 }]];
      }

      if (/FROM station_waitlist_openings/.test(sql)) {
        return [[]];
      }

      if (/FROM booking b/.test(sql) && /bs.hour IN/.test(sql)) {
        return [[]];
      }

      if (/FROM booking_slots bs/.test(sql) && /JOIN booking b/.test(sql)) {
        return [[]];
      }

      if (/INSERT INTO booking \(/.test(sql)) {
        bookingInserted = true;
        return [{ insertId: 501 }];
      }

      if (/INSERT INTO booking_slots/.test(sql) || /INSERT INTO payments/.test(sql) ||
          /UPDATE payments SET receipt_number/.test(sql)) {
        return [{ affectedRows: 1 }];
      }

      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected booking query: ${sql}`);
    },
    get bookingInserted() {
      return bookingInserted;
    },
  };
}

function createOrderConnection(ownerId = 11) {
  const calls = [];

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/FROM payment_attempts/.test(sql) && /FOR UPDATE/.test(sql)) {
        return [[]];
      }

      if (/SELECT booking_id, user_id, status/.test(sql)) {
        return [[{ booking_id: 501, user_id: ownerId, status: "running" }]];
      }

      if (/SELECT booking_id, business_id, user_id, status, start_time/.test(sql)) {
        return [[{
          booking_id: 501,
          business_id: 3,
          user_id: 11,
          status: "running",
          start_time: "2026-01-01T10:00:00.000Z",
        }]];
      }

      if (/SELECT payment_id, status/.test(sql)) {
        return [[{ payment_id: 901, status: "advance_paid" }]];
      }

      if (/SELECT order_id, notes/.test(sql)) {
        return [[]];
      }

      if (/INSERT INTO orders/.test(sql)) {
        return [{ insertId: 601 }];
      }

      if (/SELECT amount, is_available/.test(sql)) {
        return [[{ amount: 80, is_available: 1 }]];
      }

      if (/SELECT item_id, qty, total/.test(sql)) {
        return [[]];
      }

      if (
        /INSERT INTO order_items/.test(sql) ||
        /INSERT INTO order_status_history/.test(sql) ||
        /UPDATE orders\s+SET total_amount/.test(sql) ||
        /UPDATE payments\s+SET/.test(sql)
      ) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected order query: ${sql}`);
    },
  };
}

function createPaymentConnection(ownerId = 11) {
  const calls = [];

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/SELECT booking_id, user_id, status/.test(sql)) {
        return [[{ booking_id: 501, user_id: ownerId, status: "pending" }]];
      }

      if (/SELECT payment_id FROM payments/.test(sql)) {
        return [[{ payment_id: 901 }]];
      }

      if (/UPDATE payments\s+SET/.test(sql) || /UPDATE booking SET status/.test(sql)) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected payment query: ${sql}`);
    },
  };
}

function createCancellationConnection(ownerId = 11, bookingStatus = "confirmed") {
  const calls = [];

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/FROM payment_attempts/.test(sql) && /FOR UPDATE/.test(sql)) {
        return [[]];
      }

      if (/SELECT booking_id, user_id, status/.test(sql)) {
        return [[{ booking_id: 501, user_id: ownerId, status: bookingStatus }]];
      }

      if (/SELECT pc_id, user_id, status, start_time FROM booking/.test(sql)) {
        return [[{
          pc_id: 7,
          user_id: ownerId,
          status: bookingStatus,
          start_time: "2099-06-15T12:00:00.000Z",
        }]];
      }

      if (/SELECT payment_id, business_id, status, payment_method/.test(sql)) {
        return [[]];
      }

      if (/SELECT loyalty_amount FROM payments/.test(sql)) {
        return [[]];
      }

      if (/DELETE FROM booking_slots/.test(sql) ||
          /UPDATE booking SET status = 'cancelled'/.test(sql) ||
          /UPDATE payments/.test(sql) ||
          /UPDATE pc SET status = 'active'/.test(sql)) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected cancellation query: ${sql}`);
    },
  };
}

function createSettlementConnection({
  ownerId = 11,
  bookingStatus = "session_over",
  capturedAmount = 0,
  loyaltyAmount = 0,
  loyaltyPoints = 0,
} = {}) {
  const calls = [];
  const booking = {
    booking_id: 501,
    business_id: 3,
    user_id: ownerId,
    pc_id: 7,
    booking_date: "2099-06-15",
    status: bookingStatus,
    start_time: "2099-06-15 12:00:00",
    actual_end_time: "2099-06-15 13:00:00",
    total_amount: 120,
    price_per_hour: 120,
    loyalty_points: loyaltyPoints,
    captured_amount: capturedAmount,
    loyalty_amount: loyaltyAmount,
    payment_status: capturedAmount > 0 ? "advance_paid" : "pending",
    commission_rate: 0,
    convenience_fee_flat: 0,
    convenience_fee_rate: 0,
  };

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/SELECT booking_id, user_id, status/.test(sql)) {
        return [[{ booking_id: 501, user_id: ownerId, status: bookingStatus }]];
      }

      if (/JOIN pc ON b\.pc_id = pc\.pc_id/.test(sql)) {
        return [[booking]];
      }

      if (/SELECT hour\s+FROM booking_slots/.test(sql)) {
        return [[{ hour: 12 }]];
      }

      if (/SELECT COALESCE\(SUM\(oi\.total\)/.test(sql)) {
        return [[{ food_total: 0 }]];
      }

      if (/SELECT\s+payment_id,\s+final_amount/.test(sql)) {
        return [[]];
      }

      if (/SELECT COUNT\(\*\) AS visit_count FROM loyalty_visit_days/.test(sql)) {
        return [[{ visit_count: 1 }]];
      }

      if (/FROM loyalty_visit_days/.test(sql) && /DATE_FORMAT\(visit_date/.test(sql)) {
        return [[{ visit_date: booking.booking_date }]];
      }

      if (/FROM loyalty_referrals/.test(sql)) {
        return [[]];
      }

      if (/UPDATE users\s+SET loyalty_points/.test(sql) ||
          /UPDATE orders/.test(sql) ||
          /INSERT INTO payments/.test(sql) ||
          /INSERT INTO loyalty_transactions/.test(sql) ||
          /INSERT IGNORE INTO loyalty_visit_days/.test(sql) ||
          /INSERT IGNORE INTO loyalty_user_badges/.test(sql) ||
          /INSERT IGNORE INTO loyalty_reward_grants/.test(sql) ||
          /UPDATE booking\s+SET\s+status = 'closed'/.test(sql) ||
          /UPDATE pc SET status = 'active'/.test(sql) ||
          /INSERT INTO bills/.test(sql) ||
          /UPDATE payments SET receipt_number/.test(sql) ||
          /UPDATE bills SET receipt_number/.test(sql) ||
          /INSERT INTO payment_transactions/.test(sql) ||
          /INSERT IGNORE INTO customer_notifications/.test(sql)) {
        return [{ affectedRows: 1, insertId: 902 }];
      }

      throw new Error(`Unexpected settlement query: ${sql}`);
    },
  };
}

test("registration request and OTP verification create a normalized account", async (t) => {
  const db = require("../utils/db");
  const verification = require("../utils/userVerification");
  const mailer = require("../utils/mailer");
  const insertedUsers = [];
  let challengeOptions;

  t.mock.method(db, "query", async (sql, params = []) => {
    if (/SELECT uid, email, mobile\s+FROM users/.test(sql)) {
      return [];
    }

    if (/INSERT INTO users/.test(sql)) {
      insertedUsers.push(params);
      return { affectedRows: 1 };
    }

    throw new Error(`Unexpected registration query: ${sql}`);
  });
  t.mock.method(verification, "createVerificationChallenge", async (options) => {
    challengeOptions = options;
    return {
      otp: "123456",
      publicToken: "registration-token",
      expiresAt: new Date("2099-06-15T00:00:00Z"),
    };
  });
  t.mock.method(verification, "verifyChallenge", async (options) => {
    assert.equal(options.publicToken, "registration-token");
    assert.equal(options.otp, "123456");
    assert.equal(options.email, "player@example.com");
    return { payload: challengeOptions.payload };
  });
  t.mock.method(mailer, "isMailConfigured", () => true);
  t.mock.method(mailer, "sendMail", async () => undefined);
  t.after(() => delete require.cache[require.resolve("../routes/user")]);

  const router = loadFreshRouteModule("../routes/user");
  const requestOtp = getExpressRouteHandler(router, "post", "/register");
  const otpResponse = createResponseRecorder();

  await requestOtp(
    {
      body: {
        name: "  Player One ",
        email: " Player@Example.com ",
        mobile: "98765 43210",
        password: "ValidPass1!",
      },
    },
    otpResponse
  );

  assert.equal(otpResponse.statusCode, 200);
  assert.equal(otpResponse.body.verification_token, "registration-token");
  assert.equal(challengeOptions.email, "player@example.com");
  assert.equal(challengeOptions.payload.name, "Player One");
  assert.match(challengeOptions.payload.passwordHash, /^\$2[aby]\$/);

  const verifyOtp = getExpressRouteHandler(router, "post", "/register/verify-otp");
  const registrationResponse = createResponseRecorder();

  await verifyOtp(
    {
      body: {
        verification_token: "registration-token",
        email: "PLAYER@example.com",
        otp: "123456",
      },
    },
    registrationResponse
  );

  assert.equal(registrationResponse.statusCode, 200);
  assert.deepEqual(registrationResponse.body, { message: "User registered successfully" });
  assert.equal(insertedUsers.length, 1);
  assert.equal(insertedUsers[0][0], "Player One");
  assert.equal(insertedUsers[0][1], "player@example.com");
  assert.equal(insertedUsers[0][2], "9876543210");
});

test("registration rejects malformed account details before storage is touched", async (t) => {
  const db = require("../utils/db");
  const query = t.mock.method(db, "query", async () => {
    throw new Error("Database should not be used for invalid registration details.");
  });
  t.after(() => delete require.cache[require.resolve("../routes/user")]);

  const router = loadFreshRouteModule("../routes/user");
  const requestOtp = getExpressRouteHandler(router, "post", "/register");
  const res = createResponseRecorder();

  await requestOtp(
    {
      body: {
        name: "Player One",
        email: "not-an-email",
        mobile: "9876543210",
        password: "ValidPass1!",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Please enter a valid email address." });
  assert.equal(query.mock.callCount(), 0);
});

test("login creates an authenticated session and returns the customer profile", async (t) => {
  const db = require("../utils/db");
  const authSessions = require("../utils/authSessions");
  const tournamentCommunity = require("../utils/tournamentCommunity");
  const { hashPassword } = require("../utils/security");
  const passwordHash = await hashPassword("ValidPass1!");
  const user = {
    uid: 11,
    name: "Player One",
    email: "player@example.com",
    mobile: "9876543210",
    loyalty_points: 25,
    password: passwordHash,
    failed_login_attempts: 0,
    last_failed_login_at: null,
    locked_until: null,
  };

  t.mock.method(db, "query", async (sql) => {
    if (/SELECT \* FROM users WHERE email = \? LIMIT 1/.test(sql)) {
      return [user];
    }

    if (/SELECT\s+uid,\s+name,\s+email,\s+mobile/.test(sql)) {
      return [user];
    }

    throw new Error(`Unexpected login query: ${sql}`);
  });
  t.mock.method(authSessions, "createAuthSession", async (options) => {
    assert.equal(options.actorId, 11);
    assert.equal(options.actorType, "user");
    return {
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      sessionId: "test-session-id",
    };
  });
  t.mock.method(tournamentCommunity, "attachTournamentProfilesToUsers", async (users) => users);
  t.after(() => delete require.cache[require.resolve("../routes/user")]);

  const router = loadFreshRouteModule("../routes/user");
  const handler = getExpressRouteHandler(router, "post", "/login");
  const res = createResponseRecorder();

  await handler(
    { body: { email: "PLAYER@example.com", password: "ValidPass1!" }, headers: {} },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Login success");
  assert.equal(res.body.token, "test-access-token");
  assert.equal(res.body.refresh_token, "test-refresh-token");
  assert.equal(res.body.user.uid, 11);
  assert.equal(res.body.user.email, "player@example.com");
});

test("login rejects an incorrect password without creating a session", async (t) => {
  const db = require("../utils/db");
  const authSessions = require("../utils/authSessions");
  const { hashPassword } = require("../utils/security");
  const user = {
    uid: 11,
    email: "player@example.com",
    password: await hashPassword("CorrectPass1!"),
    failed_login_attempts: 0,
    last_failed_login_at: null,
    locked_until: null,
  };
  const session = t.mock.method(authSessions, "createAuthSession", async () => {
    throw new Error("A session must not be created for an incorrect password.");
  });

  t.mock.method(db, "query", async (sql) => {
    if (/SELECT \* FROM users WHERE email = \? LIMIT 1/.test(sql)) {
      return [user];
    }

    if (/UPDATE users\s+SET\s+failed_login_attempts/.test(sql)) {
      return { affectedRows: 1 };
    }

    throw new Error(`Unexpected failed login query: ${sql}`);
  });
  t.after(() => delete require.cache[require.resolve("../routes/user")]);

  const router = loadFreshRouteModule("../routes/user");
  const handler = getExpressRouteHandler(router, "post", "/login");
  const res = createResponseRecorder();

  await handler(
    { body: { email: "player@example.com", password: "WrongPass1!" }, headers: {} },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid email or password." });
  assert.equal(session.mock.callCount(), 0);
});

test("cash booking creation reserves the slot without claiming a captured payment", async (t) => {
  const db = require("../utils/db");
  const connection = createBookingConnection();

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/create");
  const res = createResponseRecorder();

  await handler(
    {
      user: { id: 11 },
      body: {
        pc_id: 7,
        booking_date: "2099-06-15",
        slots: [12, 13],
        payment_method: "cash",
        use_loyalty: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.message, "Booking confirmed. Payment is due at the counter.");
  assert.equal(res.body.booking_id, 501);
  assert.equal(res.body.total_amount, 240);
  assert.equal(res.body.amount_paid, 240);
  assert.equal(res.body.payment_status, "pending");
  assert.equal(connection.bookingInserted, true);
  assert.ok(connection.calls.some((call) => /INSERT INTO booking_slots/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /INSERT INTO payments/.test(call.sql)));
});

test("booking creation rejects a request that tries to act as another user before storage is touched", async () => {
  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/create");
  const res = createResponseRecorder();

  await handler(
    {
      user: { id: 11 },
      body: {
        user_id: 12,
        pc_id: 7,
        booking_date: "2099-06-15",
        slots: [12],
        payment_method: "cash",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You do not have access to this user account." });
});

test("food checkout creates the order and defers the charge to the active session bill", async (t) => {
  const db = require("../utils/db");
  const connection = createOrderConnection();

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => {
    delete require.cache[require.resolve("../routes/order")];
    delete require.cache[require.resolve("../routes/orderCheckoutRoutes")];
  });

  const router = loadFreshRouteModule("../routes/order");
  const handler = getExpressRouteHandler(router, "post", "/checkout");
  const res = createResponseRecorder();

  await handler(
    {
      user: { id: 11 },
      body: {
        booking_id: 501,
        items: [{ menu_id: 42, qty: 2 }],
        defer_payment: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.order_id, 601);
  assert.equal(res.body.charged_amount, 160);
  assert.equal(res.body.payment_deferred, true);
  assert.equal(res.body.payment_method, null);
  assert.match(res.body.message, /Payment will be collected at session checkout/);
  assert.ok(connection.calls.some((call) => /INSERT INTO order_items/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /UPDATE payments\s+SET/.test(call.sql)));
});

test("food checkout rejects another user's booking without creating an order", async (t) => {
  const db = require("../utils/db");
  const connection = createOrderConnection(12);

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => {
    delete require.cache[require.resolve("../routes/order")];
    delete require.cache[require.resolve("../routes/orderCheckoutRoutes")];
  });

  const router = loadFreshRouteModule("../routes/order");
  const handler = getExpressRouteHandler(router, "post", "/checkout");
  const res = createResponseRecorder();

  await handler(
    {
      user: { id: 11 },
        body: {
          booking_id: 501,
          items: [{ menu_id: 42, qty: 1 }],
          defer_payment: true,
        },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You do not have access to this booking." });
  assert.equal(connection.calls.some((call) => /INSERT INTO orders/.test(call.sql)), false);
});

test("booking cancellation releases slots, cancels payment, and frees the station", async (t) => {
  const db = require("../utils/db");
  const connection = createCancellationConnection();

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/cancel");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: true,
    refund_request: null,
    message: "Booking cancelled.",
  });
  assert.ok(connection.calls.some((call) => /DELETE FROM booking_slots/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /UPDATE booking SET status = 'cancelled'/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /UPDATE payments/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /UPDATE pc SET status = 'active'/.test(call.sql)));
});

test("booking cancellation rejects another user's booking before changing its state", async (t) => {
  const db = require("../utils/db");
  const connection = createCancellationConnection(12);

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/cancel");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You do not have access to this booking." });
  assert.equal(connection.calls.some((call) => /DELETE FROM booking_slots/.test(call.sql)), false);
});

test("session settlement closes after the verified advance covers the final balance", async (t) => {
  const db = require("../utils/db");
  const connection = createSettlementConnection({ capturedAmount: 120 });

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/settle");
  const res = createResponseRecorder();

  await handler(
    {
      user: { id: 11 },
      body: {
        booking_id: 501,
        payment_method: "cash",
        payment_reference: "CASH-SETTLEMENT-501",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.final_amount, 120);
  assert.equal(res.body.amount_due, 0);
  assert.equal(res.body.payment_reference, "CASH-SETTLEMENT-501");
  assert.ok(connection.calls.some((call) => /INSERT INTO payments/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /UPDATE booking\s+SET\s+status = 'closed'/.test(call.sql)));
  assert.ok(connection.calls.some((call) => /INSERT INTO bills/.test(call.sql)));
  const billNotification = connection.calls.find((call) =>
    /INSERT IGNORE INTO customer_notifications/.test(call.sql)
  );
  assert.equal(billNotification.params[2], "bill_settled");
  assert.equal(billNotification.params[5], "/bills/902");
});

test("session settlement includes loyalty redeemed when booking the advance", async (t) => {
  const db = require("../utils/db");
  const connection = createSettlementConnection({
    capturedAmount: 80,
    loyaltyAmount: 20,
    loyaltyPoints: 50,
  });

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/settle");
  const res = createResponseRecorder();

  await handler({
    user: { id: 11 },
    body: { booking_id: 501, use_loyalty: true },
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.final_amount, 80);
  assert.equal(res.body.loyalty_used, 40);
  assert.equal(res.body.amount_due, 0);
  const insertPayment = connection.calls.find((call) => /INSERT INTO payments/.test(call.sql));
  assert.equal(insertPayment.params[8], 40);
  assert.equal(insertPayment.params[9], 40);
});

test("session settlement rejects a booking that belongs to another user", async (t) => {
  const db = require("../utils/db");
  const connection = createSettlementConnection({ ownerId: 12 });

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/settle");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You do not have access to this booking." });
  assert.equal(connection.calls.some((call) => /UPDATE booking\s+SET\s+status = 'closed'/.test(call.sql)), false);
});

test("session settlement rejects a booking before the session ends", async (t) => {
  const db = require("../utils/db");
  const connection = createSettlementConnection({ bookingStatus: "running" });

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.after(() => delete require.cache[require.resolve("../routes/booking")]);

  const router = loadFreshRouteModule("../routes/booking");
  const handler = getExpressRouteHandler(router, "post", "/settle");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Session can be settled only after it ends" });
  assert.equal(connection.calls.some((call) => /INSERT INTO bills/.test(call.sql)), false);
});

test("client-reported payment success is disabled", async (t) => {
  t.after(() => delete require.cache[require.resolve("../routes/payment")]);

  const router = loadFreshRouteModule("../routes/payment");
  const handler = getExpressRouteHandler(router, "post", "/success");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /verified checkout flow/);
});

test("legacy payment success endpoint never writes payment state", async (t) => {
  t.after(() => delete require.cache[require.resolve("../routes/payment")]);

  const router = loadFreshRouteModule("../routes/payment");
  const handler = getExpressRouteHandler(router, "post", "/success");
  const res = createResponseRecorder();

  await handler({ user: { id: 11 }, body: { booking_id: 501 } }, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /Client-reported payment success is disabled/);
});
