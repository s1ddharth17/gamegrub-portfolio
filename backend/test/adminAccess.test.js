const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADMIN_PERMISSIONS,
  getAdminPermissions,
  hasAdminPermission,
  sanitizeAdmin,
} = require("../utils/adminAccess");

test("standard admins receive the scoped operational permissions only", () => {
  const permissions = getAdminPermissions("admin");

  assert.equal(permissions.includes(ADMIN_PERMISSIONS.DASHBOARD_READ), true);
  assert.equal(permissions.includes(ADMIN_PERMISSIONS.ORDERS_MANAGE), true);
  assert.equal(permissions.includes(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE), true);
  assert.equal(permissions.includes(ADMIN_PERMISSIONS.LOYALTY_MANAGE), false);
  assert.equal(permissions.includes(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE), false);
});

test("super admins receive every declared admin permission", () => {
  const permissions = getAdminPermissions("super_admin");

  assert.deepEqual(
    [...permissions].sort(),
    [...Object.values(ADMIN_PERMISSIONS)].sort()
  );
});

test("sanitizeAdmin attaches normalized role, status, and permissions", () => {
  const admin = sanitizeAdmin({
    id: 7,
    name: "Ops Lead",
    email: "ops@example.com",
    role: "admin",
    status: "active",
  });

  assert.equal(admin.role, "admin");
  assert.equal(admin.status, "active");
  assert.equal(admin.permissions.includes(ADMIN_PERMISSIONS.BILLING_READ), true);
  assert.equal(admin.permissions.includes(ADMIN_PERMISSIONS.LOYALTY_MANAGE), false);
});

test("hasAdminPermission falls back to role-based permissions when profile permissions are absent", () => {
  assert.equal(hasAdminPermission({ role: "super_admin" }, ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE), true);
  assert.equal(hasAdminPermission({ role: "admin" }, ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE), false);
});
