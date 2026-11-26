const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createVerify } = require("node:crypto");

const {
  createCustomerNotification,
  createServiceAccountAssertion,
  normalizeCategory,
  sendFirebasePush,
  serializeCustomerNotification,
} = require("../utils/customerNotifications");
const { formatTimeInZone, isValidTimeZone, zonedDateTimeToUtc } = require("../utils/timeZones");
const { reminderEventForBooking, reminderEventForTournament } = require("../cron/notificationEngine");

test("customer notification inserts use a stable idempotency key and validated category", async () => {
  let insertSql = "";
  let insertParams = [];
  const connection = {
    async query(sql, params) {
      insertSql = sql;
      insertParams = params;
      return [{ affectedRows: 0 }];
    },
  };

  const inserted = await createCustomerNotification(connection, {
    userId: 42,
    category: " BOOKING_REMINDERS ",
    eventType: "booking_reminder_1h",
    title: "Your session is coming up",
    message: "The café opens at 10 AM.",
    deepLink: "/booking/123",
    entityType: "booking",
    entityId: 123,
    idempotencyKey: "booking:123:reminder:1h",
  });

  assert.equal(inserted, false, "a duplicate insert is not reported as a new notification");
  assert.match(insertSql, /INSERT IGNORE INTO customer_notifications/);
  assert.equal(insertParams[8], "booking:123:reminder:1h");
  assert.equal(normalizeCategory("waitlist"), "waitlist");
  assert.equal(normalizeCategory("unknown"), null);
});

test("notification serialization exposes read state and push delivery diagnostics", () => {
  const notification = serializeCustomerNotification({
    notification_id: "17",
    category: "refunds",
    event_type: "refund_failed",
    title: "Refund could not be completed",
    message: "Try again later.",
    deep_link: "/booking/15",
    push_status: "failed",
    push_attempts: "3",
    push_sent_count: "0",
    push_failed_count: "1",
    push_error: "Provider unavailable",
    read_at: null,
  });
  assert.equal(notification.notification_id, 17);
  assert.equal(notification.is_read, false);
  assert.equal(notification.push_attempts, 3);
  assert.equal(notification.push_failed_count, 1);
  assert.equal(notification.push_error, "Provider unavailable");
});

test("local booking times convert through the IANA zone and render in the user's zone", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  const kolkata = zonedDateTimeToUtc({
    date: new Date(2026, 9, 26),
    hour: 10,
    timezone: "Asia/Kolkata",
  });
  assert.equal(kolkata.toISOString(), "2026-10-26T04:30:00.000Z");
  assert.match(formatTimeInZone(kolkata, "America/New_York"), /12:30 AM/);

  const berlinAfterDstChange = zonedDateTimeToUtc({
    date: "2026-03-29",
    hour: 10,
    timezone: "Europe/Berlin",
  });
  assert.equal(berlinAfterDstChange.toISOString(), "2026-03-29T08:00:00.000Z");
});

test("booking reminder windows create one-hour, 24-hour, and no-show events", () => {
  const booking = {
    booking_id: 123,
    booking_date: "2026-10-26",
    start_hour: 10,
    business_timezone: "Asia/Kolkata",
    display_timezone: "UTC",
  };
  assert.equal(
    reminderEventForBooking(booking, new Date("2026-10-25T05:00:00.000Z")).key,
    "booking:123:reminder:24h",
  );
  assert.equal(
    reminderEventForBooking(booking, new Date("2026-10-26T03:45:00.000Z")).key,
    "booking:123:reminder:1h",
  );
  assert.equal(
    reminderEventForBooking(booking, new Date("2026-10-26T04:37:00.000Z")).key,
    "booking:123:no_show_warning",
  );
  assert.equal(reminderEventForBooking(booking, new Date("2026-10-26T05:00:00.000Z")), null);
});

test("tournament reminders follow the venue timezone and change key when rescheduled", () => {
  const event = reminderEventForTournament({
    tournament_id: 21,
    title: "Night Clash",
    start_at: "2026-10-26T04:30:00.000Z",
    business_timezone: "Asia/Kolkata",
    location_label: "Arena One",
  }, new Date("2026-10-25T05:00:00.000Z"));
  assert.equal(event.eventType, "tournament_reminder_24h");
  assert.match(event.message, /10:00 AM GMT\+5:30 at Arena One/);
  assert.match(event.key, /^tournament:21:20261026043000000:reminder:24h$/);
  assert.equal(reminderEventForTournament({
    tournament_id: 21,
    start_at: "invalid",
  }), null);
});

test("Firebase service-account assertion is a signed messaging-scope JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const token = createServiceAccountAssertion({
    project_id: "gamegrub-test",
    client_email: "push@example.test",
    private_key: privateKey,
  }, 1_800_000_000);
  const [header, claims, signature] = token.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url").toString()).alg, "RS256");
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(payload.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assert.equal(payload.exp - payload.iat, 3600);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature, "base64url"), true);
});

test("push payload targets a Firebase installation and carries its app deep link", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const previousServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "gamegrub-push-test",
    client_email: "push@example.test",
    private_key: privateKey,
  });
  t.after(() => {
    if (previousServiceAccount === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    } else {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previousServiceAccount;
    }
  });

  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        async json() {
          return { access_token: "test-access-token", expires_in: 3600 };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { name: "projects/gamegrub-push-test/messages/123" };
      },
    };
  });

  const providerId = await sendFirebasePush({
    installationId: "firebase-installation-id",
    title: "Booking confirmed",
    message: "Your booking is ready.",
    deepLink: "/booking/501",
    notificationId: 99,
  });
  const message = JSON.parse(requests[1].options.body).message;

  assert.equal(providerId, "projects/gamegrub-push-test/messages/123");
  assert.equal(message.fid, "firebase-installation-id");
  assert.equal(message.token, undefined);
  assert.deepEqual(message.data, {
    notification_id: "99",
    deep_link: "/booking/501",
  });
});
