const { createSign } = require("node:crypto");

const { db } = require("./db");
const { isValidTimeZone } = require("./timeZones");

const NOTIFICATION_CATEGORY_COLUMNS = Object.freeze({
  booking_reminders: "booking_reminders",
  no_show_warnings: "no_show_warnings",
  session_updates: "session_updates",
  food_orders: "food_orders",
  payments: "payments",
  refunds: "refunds",
  waitlist: "waitlist",
  tournaments: "tournaments",
});

let cachedAccessToken = null;

function normalizeCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.hasOwn(NOTIFICATION_CATEGORY_COLUMNS, normalized) ? normalized : null;
}

function normalizeDeepLink(value) {
  const deepLink = String(value || "").trim();
  if (!deepLink || deepLink.length > 500 || !deepLink.startsWith("/")) return "/notifications";
  return deepLink;
}

function serializeCustomerNotification(row) {
  return {
    notification_id: Number(row.notification_id || 0),
    category: normalizeCategory(row.category) || "session_updates",
    event_type: String(row.event_type || "update"),
    title: String(row.title || "GameGrub update"),
    message: String(row.message || ""),
    deep_link: normalizeDeepLink(row.deep_link),
    entity_type: String(row.entity_type || "account"),
    entity_id: String(row.entity_id || ""),
    push_status: String(row.push_status || "pending"),
    push_attempts: Number(row.push_attempts || 0),
    push_sent_count: Number(row.push_sent_count || 0),
    push_failed_count: Number(row.push_failed_count || 0),
    push_error: row.push_error || null,
    read_at: row.read_at || null,
    is_read: Boolean(row.read_at),
    created_at: row.created_at || null,
  };
}

async function createCustomerNotification(connection, {
  userId,
  category,
  eventType,
  title,
  message,
  deepLink,
  entityType,
  entityId,
  idempotencyKey,
}) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedTitle = String(title || "").trim().slice(0, 160);
  const normalizedMessage = String(message || "").trim().slice(0, 1000);
  const key = String(idempotencyKey || "").trim().slice(0, 191);
  const normalizedUserId = Number(userId || 0);
  if (!normalizedCategory || !normalizedTitle || !normalizedMessage || !key || !normalizedUserId) {
    return false;
  }

  const [result] = await connection.query(
    `
      INSERT IGNORE INTO customer_notifications (
        user_id, category, event_type, title, message, deep_link,
        entity_type, entity_id, idempotency_key, push_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      normalizedUserId,
      normalizedCategory,
      String(eventType || "update").trim().slice(0, 64),
      normalizedTitle,
      normalizedMessage,
      normalizeDeepLink(deepLink),
      String(entityType || "account").trim().slice(0, 24),
      String(entityId || "").trim().slice(0, 80),
      key,
    ]
  );
  return Number(result?.affectedRows || 0) > 0;
}

function readFirebaseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    if (
      !serviceAccount.project_id || !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) return null;
    return serviceAccount;
  } catch (_) {
    return null;
  }
}

function getPushConfiguration() {
  const serviceAccount = readFirebaseServiceAccount();
  return {
    configured: Boolean(serviceAccount),
    projectId: serviceAccount?.project_id || "",
    webVapidKey: String(process.env.FIREBASE_WEB_VAPID_KEY || "").trim(),
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createServiceAccountAssertion(serviceAccount, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const input = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(serviceAccount.private_key, "base64url")}`;
}

async function getFirebaseAccessToken(serviceAccount = readFirebaseServiceAccount()) {
  if (!serviceAccount) {
    const error = new Error("Firebase push credentials are not configured.");
    error.code = "FCM_NOT_CONFIGURED";
    throw error;
  }
  const cacheKey = `${serviceAccount.project_id}:${serviceAccount.client_email}`;
  if (
    cachedAccessToken?.cacheKey === cacheKey &&
    cachedAccessToken.expiresAt > Date.now() + 60_000
  ) return cachedAccessToken.value;

  const assertion = createServiceAccountAssertion(serviceAccount);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    const error = new Error(String(result.error_description || result.error || "Firebase access-token request failed."));
    error.code = "FCM_AUTH_FAILED";
    throw error;
  }

  cachedAccessToken = {
    cacheKey,
    value: String(result.access_token),
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

async function sendFirebasePush({ installationId, title, message, deepLink, notificationId }) {
  const serviceAccount = readFirebaseServiceAccount();
  const accessToken = await getFirebaseAccessToken(serviceAccount);
  const data = {
    notification_id: String(notificationId),
    deep_link: normalizeDeepLink(deepLink),
  };
  const payload = {
    message: {
      fid: String(installationId),
      notification: { title: String(title), body: String(message) },
      data,
      android: {
        priority: "HIGH",
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
      webpush: {
        headers: { TTL: "3600", Urgency: "high" },
        notification: {
          title: String(title),
          body: String(message),
          icon: "/icons/Icon-192.png",
          data,
        },
      },
    },
  };
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.name) {
    const error = new Error(String(result.error?.message || "Firebase push delivery failed."));
    error.code = String(result.error?.details?.find?.((detail) => detail.errorCode)?.errorCode || result.error?.status || "FCM_SEND_FAILED");
    error.httpStatus = response.status;
    throw error;
  }
  return String(result.name);
}

async function updateNotificationPushStatus(notificationId) {
  const [rows] = await db.query(
    `
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
      FROM notification_deliveries WHERE notification_id = ?
    `,
    [notificationId]
  );
  const summary = rows[0] || {};
  const status = Number(summary.pending_count || 0) > 0
    ? "queued"
    : Number(summary.failed_count || 0) > 0
      ? "failed"
      : Number(summary.sent_count || 0) > 0
        ? "sent"
        : "skipped";
  await db.query("UPDATE customer_notifications SET push_status = ? WHERE notification_id = ?", [status, notificationId]);
  return status;
}

async function prepareNotificationDeliveries(limit = 100) {
  if (!getPushConfiguration().configured) {
    const [result] = await db.query(
      "UPDATE customer_notifications SET push_status = 'skipped' WHERE push_status = 'pending'"
    );
    return { queued: 0, skipped: Number(result?.affectedRows || 0) };
  }
  const [notifications] = await db.query(
    `SELECT notification_id, user_id, category FROM customer_notifications
     WHERE push_status = 'pending' ORDER BY notification_id ASC LIMIT ?`,
    [Math.max(1, Math.min(500, Number(limit) || 100))]
  );
  let queued = 0;
  let skipped = 0;
  for (const notification of notifications) {
    const [preferences] = await db.query(
      `SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1`,
      [notification.user_id]
    );
    const categoryColumn = NOTIFICATION_CATEGORY_COLUMNS[normalizeCategory(notification.category)];
    const preference = preferences[0];
    if (!preference?.push_enabled || !categoryColumn || !preference[categoryColumn]) {
      await db.query("UPDATE customer_notifications SET push_status = 'skipped' WHERE notification_id = ? AND push_status = 'pending'", [notification.notification_id]);
      skipped += 1;
      continue;
    }
    const [installations] = await db.query(
      `SELECT installation_id FROM push_installations WHERE user_id = ? AND is_active = 1`,
      [notification.user_id]
    );
    if (!installations.length) {
      await db.query("UPDATE customer_notifications SET push_status = 'skipped' WHERE notification_id = ? AND push_status = 'pending'", [notification.notification_id]);
      skipped += 1;
      continue;
    }
    for (const installation of installations) {
      await db.query(
        `INSERT IGNORE INTO notification_deliveries (notification_id, installation_id, status)
         VALUES (?, ?, 'pending')`,
        [notification.notification_id, installation.installation_id]
      );
    }
    await db.query("UPDATE customer_notifications SET push_status = 'queued' WHERE notification_id = ? AND push_status = 'pending'", [notification.notification_id]);
    queued += 1;
  }
  return { queued, skipped };
}

async function dispatchPendingNotificationDeliveries(limit = 100) {
  const [deliveries] = await db.query(
    `
      SELECT d.delivery_id, d.notification_id, d.installation_id, d.attempt_count,
        n.user_id, n.category, n.title, n.message, n.deep_link,
        pi.is_active
      FROM notification_deliveries d
      JOIN customer_notifications n ON n.notification_id = d.notification_id
      LEFT JOIN push_installations pi
        ON pi.installation_id = d.installation_id AND pi.user_id = n.user_id
      WHERE d.status = 'pending'
        AND d.attempt_count < 3
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
      ORDER BY d.delivery_id ASC LIMIT ?
    `,
    [Math.max(1, Math.min(500, Number(limit) || 100))]
  );

  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const categoryColumn = NOTIFICATION_CATEGORY_COLUMNS[normalizeCategory(delivery.category)];
    const [preferences] = await db.query(
      `SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1`,
      [delivery.user_id]
    );
    const preference = preferences[0];
    if (!delivery.is_active || !preference?.push_enabled || !categoryColumn || !preference[categoryColumn]) {
      await db.query(
        `UPDATE notification_deliveries SET status = 'skipped', last_error = ? WHERE delivery_id = ?`,
        [!delivery.is_active ? "Push installation is no longer active." : "Push is disabled for this category.", delivery.delivery_id]
      );
      await updateNotificationPushStatus(delivery.notification_id);
      continue;
    }

    const nextAttemptCount = Number(delivery.attempt_count || 0) + 1;
    await db.query(
      `UPDATE notification_deliveries SET attempt_count = ?, attempted_at = NOW(), last_error = NULL WHERE delivery_id = ?`,
      [nextAttemptCount, delivery.delivery_id]
    );
    try {
      const providerMessageId = await sendFirebasePush({
        installationId: delivery.installation_id,
        title: delivery.title,
        message: delivery.message,
        deepLink: delivery.deep_link,
        notificationId: delivery.notification_id,
      });
      await db.query(
        `UPDATE notification_deliveries
         SET status = 'sent', provider_message_id = ?, sent_at = NOW(), next_attempt_at = NULL,
           last_error = NULL WHERE delivery_id = ?`,
        [providerMessageId, delivery.delivery_id]
      );
      sent += 1;
    } catch (error) {
      const terminal = nextAttemptCount >= 3 || ["UNREGISTERED", "FID_NOT_FOUND"].includes(String(error.code || "").toUpperCase());
      const retryDelayMinutes = nextAttemptCount === 1 ? 1 : 5;
      await db.query(
        `UPDATE notification_deliveries
         SET status = ?, last_error = ?, next_attempt_at = ?
         WHERE delivery_id = ?`,
        [
          terminal ? "failed" : "pending",
          String(error.message || "Push delivery failed.").slice(0, 500),
          terminal ? null : new Date(Date.now() + retryDelayMinutes * 60 * 1000),
          delivery.delivery_id,
        ]
      );
      if (["UNREGISTERED", "FID_NOT_FOUND"].includes(String(error.code || "").toUpperCase())) {
        await db.query(
          `UPDATE push_installations SET is_active = 0 WHERE installation_id = ?`,
          [delivery.installation_id]
        );
      }
      if (terminal) failed += 1;
    }
    await updateNotificationPushStatus(delivery.notification_id);
  }
  return { attempted: deliveries.length, sent, failed };
}

async function processNotificationPushQueue(options = {}) {
  const prepared = await prepareNotificationDeliveries(options.limit);
  const delivered = await dispatchPendingNotificationDeliveries(options.limit);
  return { ...prepared, ...delivered };
}

function serializeNotificationPreferences(row = {}) {
  return {
    push_enabled: Boolean(row.push_enabled),
    timezone_name: isValidTimeZone(row.timezone_name) ? row.timezone_name : "Asia/Kolkata",
    categories: Object.fromEntries(
      Object.entries(NOTIFICATION_CATEGORY_COLUMNS).map(([category, column]) => [
        category,
        row[column] == null ? true : Boolean(row[column]),
      ])
    ),
  };
}

module.exports = {
  NOTIFICATION_CATEGORY_COLUMNS,
  createCustomerNotification,
  createServiceAccountAssertion,
  dispatchPendingNotificationDeliveries,
  getFirebaseAccessToken,
  getPushConfiguration,
  isValidTimeZone,
  normalizeCategory,
  prepareNotificationDeliveries,
  processNotificationPushQueue,
  readFirebaseServiceAccount,
  serializeCustomerNotification,
  serializeNotificationPreferences,
  sendFirebasePush,
};
