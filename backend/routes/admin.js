const express = require("express");

const {
  ACTOR_ADMIN,
  createAuthSession,
  getRequestSessionMetadata,
  refreshAuthSession,
  revokeActorSessions,
  revokeAuthSession,
} = require("../utils/authSessions");
const adminAuth = require("../middleware/adminAuth");
const { authAttemptLimiter } = require("../middleware/requestThrottle");
const { roundCurrency } = require("../utils/billing");
const {
  buildLockoutMessage,
  computeFailedLoginUpdate,
  getLockoutState,
} = require("../utils/loginProtection");
const {
  ADMIN_PERMISSIONS,
  ADMIN_STATUS_ACTIVE,
  createAdminAccount,
  ensureAdminTableReady,
  getAdminByEmail,
  getAdminById,
  listAdmins,
  sanitizeAdmin,
  updateAdminAccess,
  updateAdminLoginTimestamp,
  updateAdminPassword,
} = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const { query, withTransaction } = require("../utils/db");
const { verifyPassword } = require("../utils/security");
const {
  getCheckInWindow,
  getVisitState,
  verifyBookingCheckInCode,
} = require("../utils/bookingCheckIn");
const { attachTournamentProfilesToUsers } = require("../utils/tournamentCommunity");
const { createOpeningsFromCancelledBooking } = require("../utils/stationWaitlist");
const { registerAdminPosReadRoutes } = require("./adminPosReadRoutes");

const router = express.Router();

const OPEN_ORDER_STATUSES = ["active", "preparing", "completed", "delivered"];
const ADMIN_REFRESH_COOKIE_NAME = "gg_admin_refresh";
const INVALID_ADMIN_LOGIN_MESSAGE = "Invalid admin email or password.";

function safeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function toCurrency(value) {
  return roundCurrency(value || 0);
}

function createCheckInError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resolveCheckInBooking(connection, { qrCode, businessId, admin, forUpdate = false }) {
  const identity = verifyBookingCheckInCode(qrCode);
  if (!identity) {
    throw createCheckInError("This is not a valid GameGrub booking QR code.", 400);
  }

  await requireAdminBusinessAccess(admin, businessId);
  const [rows] = await connection.query(
    `
      SELECT
        b.booking_id,
        b.business_id,
        b.user_id,
        b.pc_id,
        b.booking_date,
        b.status,
        b.checked_in_at,
        COALESCE(bus.timezone, 'Asia/Kolkata') AS timezone,
        bus.name AS business_name,
        u.name AS customer_name,
        pc.specs AS pc_specs,
        (SELECT MIN(bs.hour) FROM booking_slots bs WHERE bs.booking_id = b.booking_id) AS start_hour,
        (SELECT MAX(bs.hour) + 1 FROM booking_slots bs WHERE bs.booking_id = b.booking_id) AS end_hour
      FROM booking b
      JOIN businesses bus ON bus.business_id = b.business_id
      JOIN users u ON u.uid = b.user_id
      JOIN pc ON pc.pc_id = b.pc_id
      WHERE b.booking_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [identity.bookingId]
  );
  const booking = rows[0];
  if (!booking || Number(booking.user_id) !== identity.userId) {
    throw createCheckInError("This QR code does not match a valid customer booking.", 404);
  }
  if (Number(booking.business_id) !== Number(businessId)) {
    throw createCheckInError("This QR code belongs to a different cafe workspace.", 403);
  }
  if (booking.checked_in_at) {
    throw createCheckInError("This booking has already been checked in.", 409);
  }
  if (!["confirmed", "running"].includes(String(booking.status || "").toLowerCase())) {
    throw createCheckInError("This booking is no longer open for check-in.", 409);
  }

  const window = getCheckInWindow({
    bookingDate: booking.booking_date,
    startHour: booking.start_hour,
    timezone: booking.timezone,
  });
  if (!window.open) {
    const message = window.reason === "too_early"
      ? "Check-in opens 15 minutes before the booked start time."
      : window.reason === "too_late"
      ? "The check-in window has passed. Ask the cafe team to review this booking."
      : "The booking schedule is unavailable for check-in.";
    throw createCheckInError(message, 409);
  }

  return { booking, identity, scheduledStart: window.scheduledStart };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
}

function isStrongAdminPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 12 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function isProductionEnvironment() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function getAdminRefreshCookieOptions(refreshExpiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionEnvironment(),
    path: "/api/admin",
    expires: refreshExpiresAt,
  };
}

function setAdminRefreshCookie(res, refreshToken, refreshExpiresAt) {
  if (!refreshToken || !refreshExpiresAt) {
    return;
  }

  res.cookie(
    ADMIN_REFRESH_COOKIE_NAME,
    refreshToken,
    getAdminRefreshCookieOptions(refreshExpiresAt)
  );
}

function clearAdminRefreshCookie(res) {
  res.clearCookie(ADMIN_REFRESH_COOKIE_NAME, getAdminRefreshCookieOptions(new Date(0)));
}

function getCookieValue(req, cookieName) {
  const cookieHeader = String(req.headers.cookie || "").trim();

  if (!cookieHeader) {
    return "";
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName === cookieName) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return "";
}

async function verifyAndUpgradeAdminPassword(admin, password) {
  const verification = await verifyPassword(password, admin?.password);

  if (verification.matches && verification.needsRehash && admin?.id) {
    await updateAdminPassword(admin.id, password);
  }

  return verification.matches;
}

async function getDashboardPayload(businessId = null) {
  const safeBusinessId = Number(businessId || 0) || null;
  const [
    totalUsersRows,
    totalBookingsRows,
    activeSessionsRows,
    occupiedPcsRows,
    todayBookingsRows,
    totalRevenueRows,
    todayRevenueRows,
    openOrderValueRows,
    avgSessionRows,
    loyaltyEarnedRows,
    loyaltyOutstandingRows,
    revenueRows,
    bookingStatusRows,
    paymentMethodRows,
    peakHoursRows,
    topMenuRows,
    topCustomerRows,
    loyaltyRows,
    recentPaymentRows,
    liveSessionRows,
  ] = await Promise.all([
    safeBusinessId
      ? query(
          `
            SELECT COUNT(DISTINCT scoped_users.user_id) AS total_users
            FROM (
              SELECT user_id
              FROM booking
              WHERE business_id = ?
              UNION
              SELECT user_id
              FROM bills
              WHERE business_id = ?
            ) scoped_users
          `,
          [safeBusinessId, safeBusinessId]
        )
      : query("SELECT COUNT(*) AS total_users FROM users"),
    query(
      `
        SELECT COUNT(*) AS total_bookings
        FROM booking
        WHERE status <> 'cancelled'
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COUNT(*) AS active_sessions
        FROM booking
        WHERE status = 'running'
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COUNT(*) AS occupied_pcs
        FROM pc
        WHERE status = 'occupied'
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COUNT(*) AS today_bookings
        FROM booking
        WHERE booking_date = CURDATE()
        AND status <> 'cancelled'
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COALESCE(SUM(final_amount), 0) AS total_revenue
        FROM payments
        WHERE status = 'paid'
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COALESCE(SUM(final_amount), 0) AS today_revenue
        FROM payments
        WHERE status = 'paid'
        AND DATE(COALESCE(paid_at, created_at)) = CURDATE()
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COALESCE(SUM(total_amount), 0) AS open_order_value
        FROM orders
        WHERE status IN ('active', 'preparing', 'completed', 'delivered')
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT COALESCE(AVG(TIMESTAMPDIFF(MINUTE, start_time, actual_end_time)), 0) AS avg_session_minutes
        FROM booking
        WHERE actual_end_time IS NOT NULL
        ${safeBusinessId ? "AND business_id = ?" : ""}
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    safeBusinessId
      ? query(
          `
            SELECT COALESCE(SUM(CASE WHEN lt.points > 0 THEN lt.points ELSE 0 END), 0) AS loyalty_earned
            FROM loyalty_transactions lt
            JOIN booking b ON b.booking_id = lt.booking_id
            WHERE b.business_id = ?
          `,
          [safeBusinessId]
        )
      : query(
          `
            SELECT COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS loyalty_earned
            FROM loyalty_transactions
          `
        ),
    safeBusinessId
      ? query(
          `
            SELECT COALESCE(SUM(u.loyalty_points), 0) AS loyalty_outstanding
            FROM users u
            JOIN (
              SELECT DISTINCT user_id
              FROM booking
              WHERE business_id = ?
              UNION
              SELECT DISTINCT user_id
              FROM bills
              WHERE business_id = ?
            ) scoped_users ON scoped_users.user_id = u.uid
          `,
          [safeBusinessId, safeBusinessId]
        )
      : query("SELECT COALESCE(SUM(loyalty_points), 0) AS loyalty_outstanding FROM users"),
    query(
      `
        SELECT
          DATE(COALESCE(paid_at, created_at)) AS day,
          COALESCE(SUM(final_amount), 0) AS revenue,
          COUNT(*) AS payments
        FROM payments
        WHERE DATE(COALESCE(paid_at, created_at)) >= CURDATE() - INTERVAL 13 DAY
        ${safeBusinessId ? "AND business_id = ?" : ""}
        GROUP BY DATE(COALESCE(paid_at, created_at))
        ORDER BY day ASC
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT status, COUNT(*) AS total
        FROM booking
        ${safeBusinessId ? "WHERE business_id = ?" : ""}
        GROUP BY status
        ORDER BY total DESC
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT
          payment_method AS method,
          COUNT(*) AS count,
          COALESCE(SUM(final_amount), 0) AS revenue
        FROM payments
        WHERE status = 'paid'
        ${safeBusinessId ? "AND business_id = ?" : ""}
        GROUP BY payment_method
        ORDER BY revenue DESC
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT
          hour,
          COUNT(*) AS total_bookings
        FROM booking_slots
        ${safeBusinessId ? "WHERE business_id = ?" : ""}
        GROUP BY hour
        ORDER BY hour ASC
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT
          COALESCE(m.name, 'Menu item') AS name,
          COALESCE(m.category, 'Snacks') AS category,
          COALESCE(SUM(oi.qty), 0) AS qty_sold,
          COALESCE(SUM(oi.total), 0) AS revenue
        FROM order_items oi
        LEFT JOIN menu m ON oi.menu_id = m.id
        LEFT JOIN orders o ON o.order_id = oi.order_id
        ${safeBusinessId ? "WHERE o.business_id = ?" : ""}
        GROUP BY m.id, m.name, m.category
        ORDER BY revenue DESC, qty_sold DESC
        LIMIT 6
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT
          u.uid,
          u.name,
          u.loyalty_points,
          COUNT(DISTINCT bi.bill_id) AS bill_count,
          COALESCE(SUM(bi.final_amount), 0) AS total_spend
        FROM users u
        LEFT JOIN bills bi
          ON bi.user_id = u.uid
          ${safeBusinessId ? "AND bi.business_id = ?" : ""}
        GROUP BY u.uid, u.name, u.loyalty_points
        ${safeBusinessId ? "HAVING bill_count > 0 OR total_spend > 0" : ""}
        ORDER BY total_spend DESC, bill_count DESC
        LIMIT 5
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    safeBusinessId
      ? query(
          `
            SELECT
              DATE(lt.created_at) AS day,
              COALESCE(SUM(CASE WHEN lt.points > 0 THEN lt.points ELSE 0 END), 0) AS earned,
              COALESCE(ABS(SUM(CASE WHEN lt.points < 0 THEN lt.points ELSE 0 END)), 0) AS redeemed
            FROM loyalty_transactions lt
            JOIN booking b ON b.booking_id = lt.booking_id
            WHERE DATE(lt.created_at) >= CURDATE() - INTERVAL 13 DAY
            AND b.business_id = ?
            GROUP BY DATE(lt.created_at)
            ORDER BY day ASC
          `,
          [safeBusinessId]
        )
      : query(
          `
            SELECT
              DATE(created_at) AS day,
              COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS earned,
              COALESCE(ABS(SUM(CASE WHEN points < 0 THEN points ELSE 0 END)), 0) AS redeemed
            FROM loyalty_transactions
            WHERE DATE(created_at) >= CURDATE() - INTERVAL 13 DAY
            GROUP BY DATE(created_at)
            ORDER BY day ASC
          `
        ),
    query(
      `
        SELECT
          p.payment_id,
          p.booking_id,
          p.final_amount,
          p.status,
          p.payment_method,
          p.payment_reference,
          COALESCE(p.paid_at, p.created_at) AS paid_on,
          u.name AS user_name
        FROM payments p
        LEFT JOIN booking b ON b.booking_id = p.booking_id
        LEFT JOIN users u ON u.uid = b.user_id
        ${safeBusinessId ? "WHERE p.business_id = ?" : ""}
        ORDER BY COALESCE(p.paid_at, p.created_at) DESC
        LIMIT 8
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
    query(
      `
        SELECT
          b.booking_id,
          u.name,
          pc.pc_id,
          pc.specs,
          b.start_time,
          TIMESTAMPDIFF(MINUTE, b.start_time, NOW()) AS running_minutes
        FROM booking b
        JOIN users u ON b.user_id = u.uid
        JOIN pc ON b.pc_id = pc.pc_id
        WHERE b.status = 'running'
        ${safeBusinessId ? "AND b.business_id = ?" : ""}
        ORDER BY b.start_time ASC
      `,
      safeBusinessId ? [safeBusinessId] : []
    ),
  ]);

  const summary = {
    ...(totalUsersRows[0] || {}),
    ...(totalBookingsRows[0] || {}),
    ...(activeSessionsRows[0] || {}),
    ...(occupiedPcsRows[0] || {}),
    ...(todayBookingsRows[0] || {}),
    ...(totalRevenueRows[0] || {}),
    ...(todayRevenueRows[0] || {}),
    ...(openOrderValueRows[0] || {}),
    ...(avgSessionRows[0] || {}),
    ...(loyaltyEarnedRows[0] || {}),
    ...(loyaltyOutstandingRows[0] || {}),
  };

  return {
    summary: {
      total_users: Number(summary.total_users || 0),
      total_bookings: Number(summary.total_bookings || 0),
      active_sessions: Number(summary.active_sessions || 0),
      occupied_pcs: Number(summary.occupied_pcs || 0),
      today_bookings: Number(summary.today_bookings || 0),
      total_revenue: toCurrency(summary.total_revenue),
      today_revenue: toCurrency(summary.today_revenue),
      open_order_value: toCurrency(summary.open_order_value),
      avg_session_minutes: Math.round(Number(summary.avg_session_minutes || 0)),
      loyalty_earned: Number(summary.loyalty_earned || 0),
      loyalty_outstanding: Number(summary.loyalty_outstanding || 0),
    },
    revenue_series: safeRows(revenueRows).map((row) => ({
      day: row.day,
      revenue: toCurrency(row.revenue),
      payments: Number(row.payments || 0),
    })),
    booking_status_series: safeRows(bookingStatusRows).map((row) => ({
      status: row.status,
      total: Number(row.total || 0),
    })),
    payment_method_series: safeRows(paymentMethodRows).map((row) => ({
      method: row.method || "unknown",
      count: Number(row.count || 0),
      revenue: toCurrency(row.revenue),
    })),
    peak_hour_series: safeRows(peakHoursRows).map((row) => ({
      hour: Number(row.hour || 0),
      total_bookings: Number(row.total_bookings || 0),
    })),
    top_menu_items: safeRows(topMenuRows).map((row) => ({
      name: row.name,
      category: row.category,
      qty_sold: Number(row.qty_sold || 0),
      revenue: toCurrency(row.revenue),
    })),
    top_customers: safeRows(topCustomerRows).map((row) => ({
      uid: Number(row.uid || 0),
      name: row.name,
      loyalty_points: Number(row.loyalty_points || 0),
      bill_count: Number(row.bill_count || 0),
      total_spend: toCurrency(row.total_spend),
    })),
    loyalty_series: safeRows(loyaltyRows).map((row) => ({
      day: row.day,
      earned: Number(row.earned || 0),
      redeemed: Number(row.redeemed || 0),
    })),
    recent_payments: safeRows(recentPaymentRows).map((row) => ({
      payment_id: Number(row.payment_id || 0),
      booking_id: Number(row.booking_id || 0),
      user_name: row.user_name || "Guest",
      final_amount: toCurrency(row.final_amount),
      status: row.status,
      payment_method: row.payment_method || "unknown",
      payment_reference: row.payment_reference || "",
      paid_on: row.paid_on,
    })),
    live_sessions: safeRows(liveSessionRows).map((row) => ({
      booking_id: Number(row.booking_id || 0),
      user_name: row.name,
      pc_id: Number(row.pc_id || 0),
      pc_specs: row.specs,
      start_time: row.start_time,
      running_minutes: Number(row.running_minutes || 0),
    })),
  };
}

async function recordLoyaltyAdjustment(userId, points, note) {
  await query(
    `
      INSERT INTO loyalty_transactions (
        user_id,
        booking_id,
        points,
        transaction_type,
        note
      )
      VALUES (?, NULL, ?, 'adjusted', ?)
    `,
    [userId, points, note]
  );
}

function buildAdminAuthResponse({ message, token, refreshToken, admin }) {
  return {
    message,
    token,
    admin,
  };
}

async function resetAdminLoginProtection(adminId) {
  await query(
    `
      UPDATE admin
      SET
        failed_login_attempts = 0,
        last_failed_login_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = ?
    `,
    [adminId]
  );
}

// LOGIN ROUTE
router.post("/login", authAttemptLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    await ensureAdminTableReady();
    const admin = await getAdminByEmail(email);

    if (!admin) {
      return res.status(400).json({ message: INVALID_ADMIN_LOGIN_MESSAGE });
    }

    const safeAdmin = sanitizeAdmin(admin);
    if (safeAdmin.status !== ADMIN_STATUS_ACTIVE) {
      return res.status(403).json({
        message:
          safeAdmin.status === "pending"
            ? "This admin account is pending approval."
            : "This admin account is disabled.",
      });
    }

    const lockout = getLockoutState(admin);

    if (lockout.locked) {
      return res.status(423).json({
        message: buildLockoutMessage({
          actorLabel: "Admin account",
          lockedUntil: lockout.lockedUntil,
        }),
      });
    }

    const matches = await verifyAndUpgradeAdminPassword(admin, password);

    if (!matches) {
      const nextState = computeFailedLoginUpdate(admin);

      await query(
        `
          UPDATE admin
          SET
            failed_login_attempts = ?,
            last_failed_login_at = ?,
            locked_until = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          nextState.failedLoginAttempts,
          nextState.lastFailedLoginAt,
          nextState.lockedUntil,
          admin.id,
        ]
      );

      if (nextState.lockedNow) {
        return res.status(423).json({
          message: buildLockoutMessage({
            actorLabel: "Admin account",
            lockedUntil: nextState.lockedUntil,
          }),
        });
      }

      return res.status(400).json({ message: INVALID_ADMIN_LOGIN_MESSAGE });
    }

    if (
      Number(admin.failed_login_attempts || 0) > 0 ||
      admin.last_failed_login_at ||
      admin.locked_until
    ) {
      await resetAdminLoginProtection(admin.id);
    }

    await updateAdminLoginTimestamp(safeAdmin.id);
    const session = await createAuthSession({
      actorType: ACTOR_ADMIN,
      actorId: safeAdmin.id,
      role: safeAdmin.role,
      ...getRequestSessionMetadata(req),
    });
    setAdminRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);

    res.json(
      buildAdminAuthResponse({
        message: "Login success",
        token: session.accessToken,
        admin: safeAdmin,
      })
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/refresh", async (req, res) => {
  const refreshToken = String(
    req.body.refresh_token || getCookieValue(req, ADMIN_REFRESH_COOKIE_NAME) || ""
  ).trim();

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required." });
  }

  try {
    const session = await refreshAuthSession({
      actorType: ACTOR_ADMIN,
      refreshToken,
      ...getRequestSessionMetadata(req),
      resolveTokenPayload: async ({ connection, actorId }) => {
        const [rows] = await connection.query(
          "SELECT id, role, status FROM admin WHERE id = ? LIMIT 1",
          [actorId]
        );
        const admin = rows[0];

        if (!admin || String(admin.status || "").trim() !== ADMIN_STATUS_ACTIVE) {
          return null;
        }

        return {
          id: Number(admin.id || 0),
          role: String(admin.role || "admin").trim(),
        };
      },
    });
    const admin = await getAdminById(session.actorId);

    if (!admin) {
      clearAdminRefreshCookie(res);
      return res.status(401).json({ message: "Admin account not found." });
    }

    setAdminRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);

    res.json(
      buildAdminAuthResponse({
        message: "Session refreshed",
        token: session.accessToken,
        admin: sanitizeAdmin(admin),
      })
    );
  } catch (error) {
    if ((error.statusCode || error.status) === 401) {
      clearAdminRefreshCookie(res);
    }

    res.status(error.statusCode || error.status || 500).json({
      message: error.message || "Unable to refresh admin session",
    });
  }
});

router.post("/logout", adminAuth.requireActiveAdmin, async (req, res) => {
  try {
    await revokeAuthSession({
      actorType: ACTOR_ADMIN,
      actorId: Number(req.admin?.id || 0),
      sessionId: req.authSession?.session_id,
      reason: "admin_logout",
    });
    clearAdminRefreshCookie(res);

    res.json({ message: "Logged out successfully." });
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({
      message: error.message || "Unable to log out",
    });
  }
});

router.use(adminAuth.requireActiveAdmin);

router.get("/me", async (req, res) => {
  res.json({ admin: req.admin });
});

router.get(
  "/access/list",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  async (req, res) => {
  try {
    res.json(await listAdmins());
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Unable to load admins" });
  }
  }
);

router.post(
  "/access/create",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "admin").trim().toLowerCase();
  const status = String(req.body.status || "active").trim().toLowerCase();

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid admin email address." });
  }

  if (!isStrongAdminPassword(password)) {
    return res.status(400).json({
      message:
        "Admin password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
    });
  }

  try {
    const admin = await createAdminAccount({
      name,
      email,
      password,
      role,
      status,
      createdById: req.admin.id,
      approvedById: req.admin.id,
    });

    res.status(201).json({
      message: "Admin account created successfully.",
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || "Unable to create admin account",
    });
  }
  }
);

router.put(
  "/access/:id/status",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  async (req, res) => {
  const adminId = Number(req.params.id);
  const status = String(req.body.status || "").trim().toLowerCase();

  if (!adminId || !status) {
    return res.status(400).json({ message: "Admin id and status are required." });
  }

  if (adminId === req.admin.id) {
    return res.status(400).json({ message: "Use another super admin to change your own access." });
  }

  try {
    const admin = await updateAdminAccess(adminId, { status }, req.admin.id);

    if (admin?.status !== ADMIN_STATUS_ACTIVE) {
      await revokeActorSessions({
        actorType: ACTOR_ADMIN,
        actorId: adminId,
        reason: `admin_status_${admin.status}`,
      });
    }

    res.json({
      message: "Admin status updated successfully.",
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || "Unable to update admin status",
    });
  }
  }
);

router.put(
  "/access/:id/role",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  async (req, res) => {
  const adminId = Number(req.params.id);
  const role = String(req.body.role || "").trim().toLowerCase();

  if (!adminId || !role) {
    return res.status(400).json({ message: "Admin id and role are required." });
  }

  if (adminId === req.admin.id) {
    return res.status(400).json({ message: "Use another super admin to change your own role." });
  }

  try {
    const admin = await updateAdminAccess(adminId, { role }, req.admin.id);
    res.json({
      message: "Admin role updated successfully.",
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || "Unable to update admin role",
    });
  }
  }
);

router.put(
  "/access/:id/password",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  async (req, res) => {
  const adminId = Number(req.params.id);
  const password = String(req.body.password || "");

  if (!adminId || !password) {
    return res.status(400).json({ message: "Admin id and password are required." });
  }

  if (!isStrongAdminPassword(password)) {
    return res.status(400).json({
      message:
        "Admin password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
    });
  }

  try {
    await updateAdminPassword(adminId, password);
    await revokeActorSessions({
      actorType: ACTOR_ADMIN,
      actorId: adminId,
      reason: "admin_password_changed",
    });
    res.json({ message: "Admin password updated successfully." });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || "Unable to update admin password",
    });
  }
  }
);

// DASHBOARD SUMMARY, LEGACY SHAPE
router.get("/stats", adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.DASHBOARD_READ), async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const payload = await getDashboardPayload(businessId);
    res.json({
      users: payload.summary.total_users,
      bookings: payload.summary.total_bookings,
      revenue: payload.summary.total_revenue,
      today_bookings: payload.summary.today_bookings,
      active_sessions: payload.summary.active_sessions,
      open_order_value: payload.summary.open_order_value,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FULL DASHBOARD PAYLOAD
router.get(
  "/dashboard",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.DASHBOARD_READ),
  async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    res.json(await getDashboardPayload(businessId));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FETCH USERS
router.get("/users", adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.USERS_READ), async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const rows = await query(
      `
        SELECT
          u.uid,
          u.name,
          u.email,
          u.mobile,
          u.loyalty_points,
          COALESCE(u.gamer_tag, '') AS gamer_tag,
          COALESCE(u.favorite_game, '') AS favorite_game,
          COALESCE(u.player_bio, '') AS player_bio,
          COUNT(DISTINCT b.booking_id) AS total_bookings,
          COUNT(DISTINCT bi.bill_id) AS settled_bills,
          COALESCE(SUM(bi.final_amount), 0) AS lifetime_spend,
          MAX(bi.created_at) AS last_visit
        FROM users u
        LEFT JOIN booking b ON b.user_id = u.uid AND b.business_id = ?
        LEFT JOIN bills bi ON bi.user_id = u.uid AND bi.business_id = ?
        GROUP BY
          u.uid,
          u.name,
          u.email,
          u.mobile,
          u.loyalty_points,
          u.gamer_tag,
          u.favorite_game,
          u.player_bio
        HAVING total_bookings > 0 OR settled_bills > 0
        ORDER BY lifetime_spend DESC, u.uid DESC
      `,
      [businessId, businessId]
    );
    const enrichedRows = await attachTournamentProfilesToUsers(rows);

    res.json(
      enrichedRows.map((row) => ({
        ...row,
        lifetime_spend: toCurrency(row.lifetime_spend),
        total_bookings: Number(row.total_bookings || 0),
        settled_bills: Number(row.settled_bills || 0),
        loyalty_points: Number(row.loyalty_points || 0),
      }))
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// UPDATE LOYALTY
router.put(
  "/user/loyalty/:id",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.LOYALTY_MANAGE),
  async (req, res) => {
  let { points } = req.body;
  const userId = Number(req.params.id);

  points = Number(points);

  if (!Number.isFinite(points)) {
    return res.status(400).json({ error: "Invalid points" });
  }

  points = Math.max(0, Math.floor(points));

  try {
    const [user] = await query(
      "SELECT uid, loyalty_points, name FROM users WHERE uid = ? LIMIT 1",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingPoints = Number(user.loyalty_points || 0);
    const delta = points - existingPoints;

    await query("UPDATE users SET loyalty_points = ? WHERE uid = ?", [points, userId]);

    if (delta !== 0) {
      await recordLoyaltyAdjustment(
        userId,
        delta,
        `Admin adjusted loyalty for ${user.name} from ${existingPoints} to ${points}`
      );
    }

    res.json({
      message: "Loyalty updated",
      uid: userId,
      loyalty_points: points,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
  }
);

// REVENUE CHART, LEGACY SHAPE
router.get(
  "/revenue-chart",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ANALYTICS_READ),
  async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const payload = await getDashboardPayload(businessId);
    res.json(
      payload.revenue_series.map((row) => ({
        date: row.day,
        revenue: row.revenue,
      }))
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FORCE SESSION START
router.post(
  "/session/start",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
  const { booking_id: bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "booking_id required" });
  }

  try {
    await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        "SELECT booking_id, business_id, pc_id, booking_date FROM booking WHERE booking_id = ? LIMIT 1",
        [bookingId]
      );

      if (!rows.length) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }

      const booking = rows[0];
      await requireAdminBusinessAccess(req.admin, Number(booking.business_id || 0));

      const [runningRows] = await connection.query(
        "SELECT COUNT(*) AS running FROM booking WHERE pc_id = ? AND status = 'running'",
        [booking.pc_id]
      );

      if (Number(runningRows[0]?.running || 0) > 0) {
        const error = new Error("PC already has running session");
        error.statusCode = 400;
        throw error;
      }

      await connection.query(
        "UPDATE booking SET status = 'running', start_time = NOW() WHERE booking_id = ?",
        [bookingId]
      );

      await connection.query("UPDATE pc SET status = 'occupied' WHERE pc_id = ?", [booking.pc_id]);
    });

    res.json({ message: "Session started by admin" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FORCE END
router.post(
  "/session/end",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
  const { booking_id: bookingId } = req.body;

  try {
    await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        "SELECT booking_id, business_id, pc_id FROM booking WHERE booking_id = ? LIMIT 1",
        [bookingId]
      );

      if (!rows.length) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }

      const booking = rows[0];
      await requireAdminBusinessAccess(req.admin, Number(booking.business_id || 0));

      await connection.query(
        "UPDATE booking SET status = 'session_over', actual_end_time = NOW() WHERE booking_id = ?",
        [bookingId]
      );
      await connection.query("UPDATE pc SET status = 'active' WHERE pc_id = ?", [booking.pc_id]);
    });

    res.json({ message: "Session ended by admin" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// FORCE CANCEL
router.post(
  "/session/cancel",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
  const { booking_id: bookingId } = req.body;

  try {
    await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        "SELECT booking_id, business_id, pc_id FROM booking WHERE booking_id = ? LIMIT 1",
        [bookingId]
      );

      if (!rows.length) {
        const error = new Error("Booking not found");
        error.statusCode = 404;
        throw error;
      }

      const booking = rows[0];
      await requireAdminBusinessAccess(req.admin, Number(booking.business_id || 0));

      await connection.query("UPDATE booking SET status = 'cancelled' WHERE booking_id = ?", [
        bookingId,
      ]);
      await createOpeningsFromCancelledBooking(connection, bookingId);
      await connection.query("DELETE FROM booking_slots WHERE booking_id = ?", [bookingId]);
      await connection.query(
        `
          UPDATE payments
          SET status = 'cancelled', gateway_status = 'cancelled'
          WHERE booking_id = ?
        `,
        [bookingId]
      );
      await connection.query("UPDATE pc SET status = 'active' WHERE pc_id = ?", [booking.pc_id]);
    });

    res.json({ message: "Session force cancelled" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

router.post(
  "/session/check-in/preview",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
    const businessId = Number(req.body.business_id || 0);
    const qrCode = req.body.qr_code;
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ error: "Select a cafe workspace before scanning a booking." });
    }

    try {
      const result = await withTransaction((connection) =>
        resolveCheckInBooking(connection, {
          qrCode,
          businessId,
          admin: req.admin,
        })
      );
      const { booking, scheduledStart } = result;
      res.json({
        booking_id: Number(booking.booking_id),
        customer_name: booking.customer_name,
        business_name: booking.business_name,
        pc_id: Number(booking.pc_id),
        pc_specs: booking.pc_specs,
        booking_date: booking.booking_date,
        start_hour: Number(booking.start_hour),
        end_hour: Number(booking.end_hour),
        scheduled_start: scheduledStart.toISOString(),
        timezone: booking.timezone,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.post(
  "/session/check-in",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE),
  async (req, res) => {
    const businessId = Number(req.body.business_id || 0);
    const qrCode = req.body.qr_code;
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ error: "Select a cafe workspace before checking in a booking." });
    }

    try {
      const result = await withTransaction(async (connection) => {
        const { booking, scheduledStart } = await resolveCheckInBooking(connection, {
          qrCode,
          businessId,
          admin: req.admin,
          forUpdate: true,
        });
        const startImmediately = Date.now() >= scheduledStart.getTime();
        const [update] = await connection.query(
          `
            UPDATE booking
            SET start_time = CASE
                  WHEN status = 'confirmed' AND ? = 1
                    THEN COALESCE(start_time, TIMESTAMP(booking_date, MAKETIME(?, 0, 0)))
                  ELSE start_time
                END,
                status = CASE
                  WHEN status = 'confirmed' AND ? = 1 THEN 'running'
                  ELSE status
                END,
                checked_in_at = NOW(),
                checked_in_by = ?
            WHERE booking_id = ?
            AND user_id = ?
            AND checked_in_at IS NULL
            AND status IN ('confirmed', 'running')
          `,
          [
            startImmediately ? 1 : 0,
            Number(booking.start_hour),
            startImmediately ? 1 : 0,
            Number(req.admin.id),
            Number(booking.booking_id),
            Number(booking.user_id),
          ]
        );
        if (Number(update?.affectedRows || 0) !== 1) {
          throw createCheckInError("This booking was checked in or changed by another staff member.", 409);
        }
        const started = startImmediately && String(booking.status).toLowerCase() === "confirmed";
        if (started) {
          await connection.query("UPDATE pc SET status = 'occupied' WHERE pc_id = ?", [booking.pc_id]);
        }
        return { booking, started };
      });

      res.json({
        message: result.started ? "Booking checked in and session started." : "Booking checked in.",
        booking_id: Number(result.booking.booking_id),
        customer_name: result.booking.customer_name,
        pc_id: Number(result.booking.pc_id),
        visit_state: getVisitState({
          status: result.started ? "running" : result.booking.status,
          checkedInAt: true,
        }),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

// ANALYTICS, LEGACY PLUS MORE
registerAdminPosReadRoutes(router);
router.get(
  "/analytics",
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ANALYTICS_READ),
  async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const payload = await getDashboardPayload(businessId);
    const peakHour = payload.peak_hour_series.reduce(
      (best, item) => (item.total_bookings > (best?.total_bookings || 0) ? item : best),
      null
    );
    const topPcRows = await query(
      `
        SELECT pc_id, COUNT(*) AS sessions
        FROM booking
        WHERE status <> 'cancelled'
        AND business_id = ?
        GROUP BY pc_id
        ORDER BY sessions DESC
        LIMIT 1
      `,
      [businessId]
    );

    res.json({
      total_revenue: payload.summary.total_revenue,
      today_revenue: payload.summary.today_revenue,
      top_pc: topPcRows[0] || null,
      peak_hour: peakHour,
      today_sessions: payload.summary.today_bookings,
      running_sessions: payload.summary.active_sessions,
      avg_session_minutes: payload.summary.avg_session_minutes,
      payment_method_series: payload.payment_method_series,
      top_menu_items: payload.top_menu_items,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

module.exports = router;
