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

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route.methods?.[method]
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} to exist.`);
  return layer.route.stack.at(-1).handle;
}

test("booking check-in codes are signed, purpose-bound, and tied to one booking and customer", () => {
  const {
    createBookingCheckInCode,
    verifyBookingCheckInCode,
  } = require("../utils/bookingCheckIn");
  const code = createBookingCheckInCode({ bookingId: 501, userId: 11 });

  assert.deepEqual(verifyBookingCheckInCode(code), { bookingId: 501, userId: 11 });
  assert.equal(verifyBookingCheckInCode(code.replace("GAMEGRUB-CHECKIN:1:", "")), null);
  assert.equal(verifyBookingCheckInCode(`${code}tampered`), null);
  assert.throws(() => createBookingCheckInCode({ bookingId: 0, userId: 11 }));
});

test("visit state is canonical across booking, check-in, end, and settlement states", () => {
  const { getVisitState } = require("../utils/bookingCheckIn");

  assert.equal(getVisitState({ status: "confirmed" }), "confirmed");
  assert.equal(getVisitState({ status: "confirmed", checkedInAt: "2026-10-25 11:50:00" }), "checked_in");
  assert.equal(getVisitState({ status: "running", checkedInAt: null }), "running");
  assert.equal(getVisitState({ status: "session_over", paymentStatus: "pending" }), "ending");
  assert.equal(getVisitState({ status: "session_over", paymentStatus: "paid" }), "settled");
  assert.equal(getVisitState({ status: "closed" }), "settled");
});

test("check-in window follows café timezone and allows 15 minutes before through 15 minutes after start", () => {
  const { getCheckInWindow } = require("../utils/bookingCheckIn");
  const start = new Date("2026-10-25T04:30:00.000Z"); // 10:00 at Asia/Kolkata

  assert.equal(getCheckInWindow({
    bookingDate: "2026-10-25",
    startHour: 10,
    timezone: "Asia/Kolkata",
    now: new Date(start.getTime() - 15 * 60_000),
  }).open, true);
  assert.equal(getCheckInWindow({
    bookingDate: "2026-10-25",
    startHour: 10,
    timezone: "Asia/Kolkata",
    now: new Date(start.getTime() - 16 * 60_000),
  }).reason, "too_early");
  assert.equal(getCheckInWindow({
    bookingDate: "2026-10-25",
    startHour: 10,
    timezone: "Asia/Kolkata",
    now: new Date(start.getTime() + 16 * 60_000),
  }).reason, "too_late");
});

test("admin check-in binds the signed customer QR to the displayed booking and writes once", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const bookingCheckIn = require("../utils/bookingCheckIn");
  const queries = [];
  const occupiedStations = [];
  const connection = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (/SELECT\s+b\.booking_id/.test(String(sql))) {
        return [[{
          booking_id: 501,
          business_id: 3,
          user_id: 11,
          pc_id: 7,
          booking_date: "2026-10-25",
          status: "confirmed",
          checked_in_at: null,
          timezone: "Asia/Kolkata",
          business_name: "Cafe Three",
          customer_name: "Player One",
          pc_specs: "RTX gaming station",
          start_hour: 10,
          end_hour: 12,
        }]];
      }
      if (/UPDATE booking\s+SET start_time/.test(String(sql))) {
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE pc SET status = 'occupied'/.test(String(sql))) {
        occupiedStations.push(params[0]);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected check-in query: ${sql}`);
    },
  };

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async () => ({}));
  t.mock.method(bookingCheckIn, "getCheckInWindow", () => ({
    open: true,
    scheduledStart: new Date(Date.now() - 1),
  }));
  const modulePath = require.resolve("../routes/admin");
  delete require.cache[modulePath];
  t.after(() => delete require.cache[modulePath]);
  const router = require("../routes/admin");
  const handler = getRouteHandler(router, "post", "/session/check-in");
  const qrCode = bookingCheckIn.createBookingCheckInCode({ bookingId: 501, userId: 11 });
  const res = createResponseRecorder();

  await handler({
    body: { business_id: 3, qr_code: qrCode },
    admin: { id: 9, role: "admin" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: "Booking checked in and session started.",
    booking_id: 501,
    customer_name: "Player One",
    pc_id: 7,
    visit_state: "running",
  });
  const write = queries.find(({ sql }) => /UPDATE booking\s+SET start_time/.test(sql));
  assert.ok(write);
  assert.match(write.sql, /user_id = \?/);
  assert.match(write.sql, /checked_in_at IS NULL/);
  assert.deepEqual(write.params, [1, 10, 1, 9, 501, 11]);
  assert.deepEqual(occupiedStations, [7]);
});

test("admin check-in rejects a signed code for a different customer", async (t) => {
  const db = require("../utils/db");
  const businessAccess = require("../utils/businessAccess");
  const bookingCheckIn = require("../utils/bookingCheckIn");
  let updateAttempted = false;
  const connection = {
    async query(sql) {
      if (/SELECT\s+b\.booking_id/.test(String(sql))) {
        return [[{
          booking_id: 501,
          business_id: 3,
          user_id: 12,
          pc_id: 7,
          booking_date: "2026-10-25",
          status: "confirmed",
          checked_in_at: null,
          timezone: "Asia/Kolkata",
          business_name: "Cafe Three",
          customer_name: "Player Two",
          pc_specs: "RTX gaming station",
          start_hour: 10,
          end_hour: 12,
        }]];
      }
      if (/UPDATE booking/.test(String(sql))) updateAttempted = true;
      throw new Error(`Unexpected check-in query: ${sql}`);
    },
  };

  t.mock.method(db, "withTransaction", async (work) => work(connection));
  t.mock.method(businessAccess, "requireAdminBusinessAccess", async () => ({}));
  t.mock.method(bookingCheckIn, "getCheckInWindow", () => ({ open: true }));
  const modulePath = require.resolve("../routes/admin");
  delete require.cache[modulePath];
  t.after(() => delete require.cache[modulePath]);
  const router = require("../routes/admin");
  const handler = getRouteHandler(router, "post", "/session/check-in");
  const qrCode = bookingCheckIn.createBookingCheckInCode({ bookingId: 501, userId: 11 });
  const res = createResponseRecorder();

  await handler({
    body: { business_id: 3, qr_code: qrCode },
    admin: { id: 9, role: "admin" },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /does not match/);
  assert.equal(updateAttempted, false);
});
