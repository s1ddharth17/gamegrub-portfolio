const { query, withTransaction } = require("./db");
const { hashPassword } = require("./security");

const ADMIN_ROLE_SUPER = "super_admin";
const ADMIN_ROLE_STANDARD = "admin";
const ADMIN_ROLES = new Set([ADMIN_ROLE_SUPER, ADMIN_ROLE_STANDARD]);

const ADMIN_PERMISSIONS = Object.freeze({
  DASHBOARD_READ: "dashboard.read",
  ANALYTICS_READ: "analytics.read",
  BOOKINGS_READ: "bookings.read",
  USERS_READ: "users.read",
  LOYALTY_MANAGE: "loyalty.manage",
  SESSIONS_MANAGE: "sessions.manage",
  POS_READ: "pos.read",
  ORDERS_MANAGE: "orders.manage",
  MENU_MANAGE: "menu.manage",
  STATIONS_MANAGE: "stations.manage",
  BILLING_READ: "billing.read",
  TOURNAMENTS_MANAGE: "tournaments.manage",
  ADMIN_ACCESS_MANAGE: "admin_access.manage",
  SUPPORT_MANAGE: "support.manage",
});

const STANDARD_ADMIN_PERMISSIONS = Object.freeze([
  ADMIN_PERMISSIONS.DASHBOARD_READ,
  ADMIN_PERMISSIONS.ANALYTICS_READ,
  ADMIN_PERMISSIONS.BOOKINGS_READ,
  ADMIN_PERMISSIONS.USERS_READ,
  ADMIN_PERMISSIONS.SESSIONS_MANAGE,
  ADMIN_PERMISSIONS.POS_READ,
  ADMIN_PERMISSIONS.ORDERS_MANAGE,
  ADMIN_PERMISSIONS.MENU_MANAGE,
  ADMIN_PERMISSIONS.STATIONS_MANAGE,
  ADMIN_PERMISSIONS.BILLING_READ,
  ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE,
  ADMIN_PERMISSIONS.SUPPORT_MANAGE,
]);

const SUPER_ADMIN_PERMISSIONS = Object.freeze(Object.values(ADMIN_PERMISSIONS));

const ADMIN_STATUS_PENDING = "pending";
const ADMIN_STATUS_ACTIVE = "active";
const ADMIN_STATUS_DISABLED = "disabled";
const ADMIN_STATUSES = new Set([
  ADMIN_STATUS_PENDING,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DISABLED,
]);

let adminTableReady = false;

function normalizeAdminEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeAdminName(name, email) {
  const normalized = String(name || "").trim();
  if (normalized) {
    return normalized;
  }

  const emailPrefix = normalizeAdminEmail(email).split("@")[0];
  return emailPrefix || "Admin";
}

function normalizeAdminRole(role, fallback = ADMIN_ROLE_STANDARD) {
  const normalized = String(role || "").trim().toLowerCase();
  return ADMIN_ROLES.has(normalized) ? normalized : fallback;
}

function normalizeAdminStatus(status, fallback = ADMIN_STATUS_PENDING) {
  const normalized = String(status || "").trim().toLowerCase();
  return ADMIN_STATUSES.has(normalized) ? normalized : fallback;
}

function getAdminPermissions(role) {
  const normalizedRole = normalizeAdminRole(role, ADMIN_ROLE_STANDARD);
  const permissions =
    normalizedRole === ADMIN_ROLE_SUPER ? SUPER_ADMIN_PERMISSIONS : STANDARD_ADMIN_PERMISSIONS;
  return [...permissions];
}

function hasAdminPermission(adminOrRole, permission) {
  if (!permission) {
    return true;
  }

  const role =
    typeof adminOrRole === "string"
      ? adminOrRole
      : normalizeAdminRole(adminOrRole?.role, ADMIN_ROLE_STANDARD);
  const permissions =
    Array.isArray(adminOrRole?.permissions) && adminOrRole.permissions.length
      ? adminOrRole.permissions
      : getAdminPermissions(role);

  return permissions.includes(permission);
}

function sanitizeAdmin(admin) {
  if (!admin) {
    return null;
  }

  const role = normalizeAdminRole(admin.role, ADMIN_ROLE_STANDARD);

  return {
    id: Number(admin.id || 0),
    name: admin.name || "",
    email: admin.email || "",
    role,
    permissions: getAdminPermissions(role),
    status: normalizeAdminStatus(admin.status, ADMIN_STATUS_PENDING),
    created_by: admin.created_by ? Number(admin.created_by) : null,
    approved_by: admin.approved_by ? Number(admin.approved_by) : null,
    approved_at: admin.approved_at || null,
    last_login_at: admin.last_login_at || null,
    locked_until: admin.locked_until || null,
    created_at: admin.created_at || null,
    updated_at: admin.updated_at || null,
  };
}

async function ensureAdminColumn(columnName, definition) {
  const rows = await query("SHOW COLUMNS FROM admin LIKE ?", [columnName]);
  if (!rows.length) {
    await query(`ALTER TABLE admin ADD COLUMN ${definition}`);
  }
}

async function ensureSeededSuperAdmin() {
  const existingAdmins = await query("SELECT id, email, role, status FROM admin ORDER BY id ASC");

  if (!existingAdmins.length) {
    const bootstrapEmail = normalizeAdminEmail(process.env.SUPER_ADMIN_EMAIL);
    const bootstrapPassword = String(process.env.SUPER_ADMIN_PASSWORD || "");

    if (!bootstrapEmail || !bootstrapPassword) {
      return;
    }

    const passwordHash = await hashPassword(bootstrapPassword);
    await query(
      `
        INSERT INTO admin (
          name,
          email,
          password,
          role,
          status,
          approved_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `,
      [
        normalizeAdminName(process.env.SUPER_ADMIN_NAME, bootstrapEmail),
        bootstrapEmail,
        passwordHash,
        ADMIN_ROLE_SUPER,
        ADMIN_STATUS_ACTIVE,
      ]
    );
    return;
  }

  const hasSuperAdmin = existingAdmins.some(
    (admin) => normalizeAdminRole(admin.role, "") === ADMIN_ROLE_SUPER
  );

  if (!hasSuperAdmin) {
    const firstAdminId = Number(existingAdmins[0].id || 0);
    if (firstAdminId) {
      await query(
        `
          UPDATE admin
          SET role = ?, status = ?, approved_at = COALESCE(approved_at, NOW())
          WHERE id = ?
        `,
        [ADMIN_ROLE_SUPER, ADMIN_STATUS_ACTIVE, firstAdminId]
      );
    }
  }
}

async function ensureAdminTableReady() {
  if (adminTableReady) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS admin (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      password VARCHAR(512) NOT NULL
    )
  `);

  await ensureAdminColumn("name", "name VARCHAR(120) NULL AFTER id");
  await ensureAdminColumn(
    "role",
    `role VARCHAR(32) NOT NULL DEFAULT '${ADMIN_ROLE_STANDARD}' AFTER password`
  );
  await ensureAdminColumn(
    "status",
    `status VARCHAR(32) NOT NULL DEFAULT '${ADMIN_STATUS_ACTIVE}' AFTER role`
  );
  await ensureAdminColumn("created_by", "created_by INT NULL AFTER status");
  await ensureAdminColumn("approved_by", "approved_by INT NULL AFTER created_by");
  await ensureAdminColumn("approved_at", "approved_at DATETIME NULL AFTER approved_by");
  await ensureAdminColumn("last_login_at", "last_login_at DATETIME NULL AFTER approved_at");
  await ensureAdminColumn(
    "failed_login_attempts",
    "failed_login_attempts INT NOT NULL DEFAULT 0 AFTER password"
  );
  await ensureAdminColumn(
    "last_failed_login_at",
    "last_failed_login_at DATETIME NULL AFTER failed_login_attempts"
  );
  await ensureAdminColumn("locked_until", "locked_until DATETIME NULL AFTER last_failed_login_at");
  await ensureAdminColumn(
    "created_at",
    "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_login_at"
  );
  await ensureAdminColumn(
    "updated_at",
    "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_at"
  );

  await query(
    `
      UPDATE admin
      SET
        name = COALESCE(NULLIF(TRIM(name), ''), SUBSTRING_INDEX(email, '@', 1)),
        role = CASE
          WHEN role IN ('super_admin', 'admin') THEN role
          ELSE ?
        END,
        status = CASE
          WHEN status IN ('pending', 'active', 'disabled') THEN status
          ELSE ?
        END,
        updated_at = COALESCE(updated_at, NOW()),
        created_at = COALESCE(created_at, NOW())
    `,
    [ADMIN_ROLE_STANDARD, ADMIN_STATUS_ACTIVE]
  );

  await ensureSeededSuperAdmin();
  adminTableReady = true;
}

async function getAdminByEmail(email) {
  await ensureAdminTableReady();
  const rows = await query("SELECT * FROM admin WHERE email = ? LIMIT 1", [
    normalizeAdminEmail(email),
  ]);
  return rows[0] || null;
}

async function getAdminById(id) {
  await ensureAdminTableReady();
  const rows = await query("SELECT * FROM admin WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function listAdmins() {
  await ensureAdminTableReady();
  const rows = await query(
    `
      SELECT
        a.id,
        a.name,
        a.email,
        a.role,
        a.status,
        a.created_by,
        a.approved_by,
        a.approved_at,
        a.last_login_at,
        a.created_at,
        a.updated_at,
        creator.name AS created_by_name,
        approver.name AS approved_by_name
      FROM admin a
      LEFT JOIN admin creator ON creator.id = a.created_by
      LEFT JOIN admin approver ON approver.id = a.approved_by
      ORDER BY
        FIELD(a.role, 'super_admin', 'admin'),
        FIELD(a.status, 'active', 'pending', 'disabled'),
        a.created_at ASC,
        a.id ASC
    `
  );

  return rows.map((row) => ({
    ...sanitizeAdmin(row),
    created_by_name: row.created_by_name || null,
    approved_by_name: row.approved_by_name || null,
  }));
}

async function createAdminAccount({
  name,
  email,
  password,
  role = ADMIN_ROLE_STANDARD,
  status = ADMIN_STATUS_PENDING,
  createdById = null,
  approvedById = null,
}) {
  await ensureAdminTableReady();

  const normalizedEmail = normalizeAdminEmail(email);
  const existingAdmin = await getAdminByEmail(normalizedEmail);
  if (existingAdmin) {
    const error = new Error("An admin account with this email already exists.");
    error.status = 409;
    throw error;
  }

  const normalizedStatus = normalizeAdminStatus(status);
  const normalizedRole = normalizeAdminRole(role);
  const passwordHash = await hashPassword(password);

  const result = await query(
    `
      INSERT INTO admin (
        name,
        email,
        password,
        role,
        status,
        created_by,
        approved_by,
        approved_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      normalizeAdminName(name, normalizedEmail),
      normalizedEmail,
      passwordHash,
      normalizedRole,
      normalizedStatus,
      createdById,
      normalizedStatus === ADMIN_STATUS_ACTIVE ? approvedById : null,
      normalizedStatus === ADMIN_STATUS_ACTIVE ? new Date() : null,
    ]
  );

  return getAdminById(result.insertId);
}

async function updateAdminLoginTimestamp(adminId) {
  await ensureAdminTableReady();
  await query("UPDATE admin SET last_login_at = NOW(), updated_at = NOW() WHERE id = ?", [adminId]);
}

async function updateAdminPassword(adminId, password) {
  await ensureAdminTableReady();
  const passwordHash = await hashPassword(password);
  await query(
    `
      UPDATE admin
      SET
        password = ?,
        failed_login_attempts = 0,
        last_failed_login_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = ?
    `,
    [passwordHash, adminId]
  );
}

async function countActiveSuperAdmins(connection) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM admin
      WHERE role = ? AND status = ?
    `,
    [ADMIN_ROLE_SUPER, ADMIN_STATUS_ACTIVE]
  );
  return Number(rows[0]?.total || 0);
}

async function updateAdminAccess(targetId, updates, actedById) {
  await ensureAdminTableReady();

  return withTransaction(async (connection) => {
    const [rows] = await connection.query("SELECT * FROM admin WHERE id = ? LIMIT 1", [targetId]);
    const target = rows[0];

    if (!target) {
      const error = new Error("Admin account not found.");
      error.status = 404;
      throw error;
    }

    const nextRole =
      updates.role !== undefined
        ? normalizeAdminRole(updates.role, normalizeAdminRole(target.role))
        : normalizeAdminRole(target.role);
    const nextStatus =
      updates.status !== undefined
        ? normalizeAdminStatus(updates.status, normalizeAdminStatus(target.status))
        : normalizeAdminStatus(target.status);
    const nextName =
      updates.name !== undefined ? normalizeAdminName(updates.name, target.email) : target.name;

    const isCurrentlyActiveSuperAdmin =
      normalizeAdminRole(target.role) === ADMIN_ROLE_SUPER &&
      normalizeAdminStatus(target.status) === ADMIN_STATUS_ACTIVE;
    const isStayingActiveSuperAdmin =
      nextRole === ADMIN_ROLE_SUPER && nextStatus === ADMIN_STATUS_ACTIVE;

    if (isCurrentlyActiveSuperAdmin && !isStayingActiveSuperAdmin) {
      const totalActiveSuperAdmins = await countActiveSuperAdmins(connection);
      if (totalActiveSuperAdmins <= 1) {
        const error = new Error("At least one active super admin must remain.");
        error.status = 400;
        throw error;
      }
    }

    const approveNow =
      nextStatus === ADMIN_STATUS_ACTIVE &&
      normalizeAdminStatus(target.status) !== ADMIN_STATUS_ACTIVE;

    await connection.query(
      `
        UPDATE admin
        SET
          name = ?,
          role = ?,
          status = ?,
          approved_by = CASE
            WHEN ? THEN ?
            ELSE approved_by
          END,
          approved_at = CASE
            WHEN ? THEN NOW()
            ELSE approved_at
          END,
          updated_at = NOW()
        WHERE id = ?
      `,
      [nextName, nextRole, nextStatus, approveNow, actedById, approveNow, targetId]
    );

    const [updatedRows] = await connection.query("SELECT * FROM admin WHERE id = ? LIMIT 1", [
      targetId,
    ]);
    return updatedRows[0] || null;
  });
}

module.exports = {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_STANDARD,
  ADMIN_ROLE_SUPER,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DISABLED,
  ADMIN_STATUS_PENDING,
  ensureAdminTableReady,
  createAdminAccount,
  getAdminByEmail,
  getAdminById,
  getAdminPermissions,
  hasAdminPermission,
  listAdmins,
  normalizeAdminRole,
  normalizeAdminStatus,
  sanitizeAdmin,
  updateAdminAccess,
  updateAdminLoginTimestamp,
  updateAdminPassword,
};
