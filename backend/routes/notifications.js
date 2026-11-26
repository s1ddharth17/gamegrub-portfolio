const express = require("express");

const auth = require("../middleware/auth");
const { query } = require("../utils/db");
const {
  getPushConfiguration,
  normalizeCategory,
  serializeCustomerNotification,
  serializeNotificationPreferences,
} = require("../utils/customerNotifications");
const { isValidTimeZone } = require("../utils/timeZones");

const router = express.Router();
const CATEGORY_NAMES = Object.freeze({
  booking_reminders: true,
  no_show_warnings: true,
  session_updates: true,
  food_orders: true,
  payments: true,
  refunds: true,
  waitlist: true,
  tournaments: true,
});

router.use(auth);

router.get("/push/config", (req, res) => {
  const config = getPushConfiguration();
  return res.json({
    configured: config.configured,
    web_vapid_key: config.webVapidKey,
  });
});

router.get("/preferences", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1",
      [Number(req.user.id)]
    );
    return res.json(serializeNotificationPreferences(rows[0] || {}));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/preferences", async (req, res) => {
  const body = req.body || {};
  const currentRows = await query(
    "SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1",
    [Number(req.user.id)]
  ).catch(() => []);
  const current = serializeNotificationPreferences(currentRows[0] || {});
  const requestedCategories = body.categories && typeof body.categories === "object"
    ? body.categories
    : {};
  const categories = { ...current.categories };
  for (const [key, value] of Object.entries(requestedCategories)) {
    const category = normalizeCategory(key);
    if (!category || typeof value !== "boolean") {
      return res.status(400).json({ error: "Category preferences must use known categories and boolean values." });
    }
    categories[category] = value;
  }

  const pushEnabled = typeof body.push_enabled === "boolean"
    ? body.push_enabled
    : current.push_enabled;
  const timezoneName = body.timezone_name === undefined
    ? current.timezone_name
    : String(body.timezone_name || "").trim();
  if (!isValidTimeZone(timezoneName)) {
    return res.status(400).json({ error: "A valid IANA timezone is required." });
  }

  try {
    await query(
      `INSERT INTO notification_preferences (
        user_id, push_enabled, booking_reminders, no_show_warnings,
        session_updates, food_orders, payments, refunds, waitlist, tournaments,
        timezone_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE push_enabled = VALUES(push_enabled),
        booking_reminders = VALUES(booking_reminders),
        no_show_warnings = VALUES(no_show_warnings),
        session_updates = VALUES(session_updates), food_orders = VALUES(food_orders),
        payments = VALUES(payments), refunds = VALUES(refunds),
        waitlist = VALUES(waitlist), tournaments = VALUES(tournaments),
        timezone_name = VALUES(timezone_name)` ,
      [
        Number(req.user.id), pushEnabled ? 1 : 0,
        ...Object.keys(CATEGORY_NAMES).map((name) => categories[name] ? 1 : 0),
        timezoneName,
      ]
    );
    return res.json({
      push_enabled: pushEnabled,
      timezone_name: timezoneName,
      categories,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/push/registration", async (req, res) => {
  const installationId = String(req.body?.installation_id || "").trim();
  const platform = String(req.body?.platform || "").trim().toLowerCase();
  if (!installationId || installationId.length > 255) {
    return res.status(400).json({ error: "A valid push installation id is required." });
  }
  if (!["android", "ios", "web"].includes(platform)) {
    return res.status(400).json({ error: "Platform must be android, ios, or web." });
  }
  try {
    await query(
      `INSERT INTO push_installations (
        installation_id, user_id, platform, is_active, user_agent, last_seen_at
      ) VALUES (?, ?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform),
        is_active = 1, user_agent = VALUES(user_agent), last_seen_at = NOW()` ,
      [installationId, Number(req.user.id), platform, String(req.get("user-agent") || "").slice(0, 500) || null]
    );
    return res.json({ registered: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

async function unregisterPushRegistration(req, res) {
  const installationId = String(req.body?.installation_id || "").trim();
  if (!installationId || installationId.length > 255) {
    return res.status(400).json({ error: "A valid push installation id is required." });
  }
  try {
    await query(
      "UPDATE push_installations SET is_active = 0 WHERE installation_id = ? AND user_id = ?",
      [installationId, Number(req.user.id)]
    );
    return res.json({ registered: false });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

router.delete("/push/registration", unregisterPushRegistration);
router.post("/push/unregister", unregisterPushRegistration);

router.get("/", async (req, res) => {
  const userId = Number(req.user.id || 0);
  const unreadOnly = String(req.query?.unread_only || "").toLowerCase() === "true";
  const category = req.query?.category ? normalizeCategory(req.query.category) : null;
  if (req.query?.category && !category) {
    return res.status(400).json({ error: "Unknown notification category." });
  }
  const filters = ["n.user_id = ?"];
  const params = [userId];
  if (unreadOnly) filters.push("n.read_at IS NULL");
  if (category) {
    filters.push("n.category = ?");
    params.push(category);
  }
  try {
    const rows = await query(
      `SELECT n.*, COALESCE(SUM(d.attempt_count), 0) AS push_attempts,
        MAX(CASE WHEN d.status = 'failed' THEN d.last_error END) AS push_error,
        SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS push_sent_count,
        SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS push_failed_count
       FROM customer_notifications n
       LEFT JOIN notification_deliveries d ON d.notification_id = n.notification_id
       WHERE ${filters.join(" AND ")}
       GROUP BY n.notification_id
       ORDER BY n.created_at DESC, n.notification_id DESC LIMIT 100`,
      params
    );
    return res.json(rows.map(serializeCustomerNotification));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:notificationId/read", async (req, res) => {
  const notificationId = Number(req.params.notificationId || 0);
  if (!notificationId) return res.status(400).json({ error: "Notification id is required." });
  try {
    await query(
      "UPDATE customer_notifications SET read_at = COALESCE(read_at, NOW()) WHERE notification_id = ? AND user_id = ?",
      [notificationId, Number(req.user.id)]
    );
    const rows = await query(
      `SELECT n.*, COALESCE(SUM(d.attempt_count), 0) AS push_attempts,
        MAX(CASE WHEN d.status = 'failed' THEN d.last_error END) AS push_error,
        SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS push_sent_count,
        SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS push_failed_count
       FROM customer_notifications n
       LEFT JOIN notification_deliveries d ON d.notification_id = n.notification_id
       WHERE n.notification_id = ? AND n.user_id = ?
       GROUP BY n.notification_id LIMIT 1`,
      [notificationId, Number(req.user.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Notification not found." });
    return res.json(serializeCustomerNotification(rows[0]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
