const TOKEN_KEY = "token";
const PROFILE_KEY = "admin_profile";

export const ADMIN_PERMISSIONS = Object.freeze({
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

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return window.atob(`${normalized}${padding}`);
}

export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function getDefaultPermissions(role) {
  return role === "super_admin" ? [...SUPER_ADMIN_PERMISSIONS] : [...STANDARD_ADMIN_PERMISSIONS];
}

function normalizePermissions(value, role) {
  if (Array.isArray(value) && value.length) {
    return [...new Set(value.map((permission) => String(permission || "").trim()).filter(Boolean))];
  }

  return getDefaultPermissions(role);
}

export function decodeAdminToken(token = getAdminToken()) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload));
  } catch (_) {
    return null;
  }
}

export function getStoredAdminProfile() {
  try {
    const rawValue = sessionStorage.getItem(PROFILE_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (_) {
    return null;
  }
}

export function getAdminProfile() {
  const tokenPayload = decodeAdminToken();
  const storedProfile = getStoredAdminProfile();

  if (!tokenPayload && !storedProfile) {
    return null;
  }

  const role = storedProfile?.role ?? tokenPayload?.role ?? null;

  return {
    ...tokenPayload,
    ...storedProfile,
    id: storedProfile?.id ?? tokenPayload?.id ?? null,
    role,
    name: storedProfile?.name ?? tokenPayload?.name ?? null,
    email: storedProfile?.email ?? tokenPayload?.email ?? null,
    status: storedProfile?.status ?? tokenPayload?.status ?? null,
    permissions: normalizePermissions(storedProfile?.permissions, role),
  };
}

export function hasAdminPermission(permission, admin = getAdminProfile()) {
  if (!permission) {
    return true;
  }

  const role = admin?.role ?? null;
  if (role === "super_admin") {
    return true;
  }

  return normalizePermissions(admin?.permissions, role).includes(permission);
}

export function setAdminSession({ token, admin }) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  if (admin) {
    sessionStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        ...admin,
        permissions: normalizePermissions(admin.permissions, admin.role),
      })
    );
  } else {
    sessionStorage.removeItem(PROFILE_KEY);
  }
}

export function clearAdminSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
}
