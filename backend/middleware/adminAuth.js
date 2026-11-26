const {
  hasAdminPermission,
  ADMIN_ROLE_SUPER,
  ADMIN_STATUS_ACTIVE,
  ensureAdminTableReady,
  getAdminById,
  sanitizeAdmin,
} = require("../utils/adminAccess");
const { ACTOR_ADMIN, getActiveAuthSession } = require("../utils/authSessions");
const { verifyToken } = require("../utils/security");

function extractToken(req) {
  const authorization = req.headers.authorization || req.headers.Authorization;

  if (!authorization) {
    return "";
  }

  return authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization;
}

function buildAdminMiddleware({ requireSuperAdmin = false } = {}) {
  return async (req, res, next) => {
    try {
      await ensureAdminTableReady();

      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ message: "Admin token required." });
      }

      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (_) {
        return res.status(401).json({ message: "Invalid admin token." });
      }

      const adminId = Number(decoded?.id || 0);
      const sessionId = String(decoded?.sid || "").trim();
      if (!adminId || !["admin", "super_admin"].includes(String(decoded?.role || "").trim())) {
        return res.status(401).json({ message: "Admin access denied." });
      }

      if (!sessionId) {
        return res.status(401).json({ message: "Admin session expired." });
      }

      const session = await getActiveAuthSession({
        actorType: ACTOR_ADMIN,
        actorId: adminId,
        sessionId,
      });

      if (!session) {
        return res.status(401).json({ message: "Admin session expired." });
      }

      const admin = await getAdminById(adminId);
      if (!admin) {
        return res.status(401).json({ message: "Admin account not found." });
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

      if (requireSuperAdmin && safeAdmin.role !== ADMIN_ROLE_SUPER) {
        return res.status(403).json({ message: "Super admin access required." });
      }

      req.admin = safeAdmin;
      req.authSession = session;
      req.user = {
        id: safeAdmin.id,
        role: safeAdmin.role,
        permissions: safeAdmin.permissions,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAdminPermission(permission) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: "Admin token required." });
    }

    if (!hasAdminPermission(req.admin, permission)) {
      return res.status(403).json({ message: "You do not have access to this admin action." });
    }

    return next();
  };
}

module.exports = {
  requireActiveAdmin: buildAdminMiddleware(),
  requireAdminPermission,
  requireSuperAdmin: buildAdminMiddleware({ requireSuperAdmin: true }),
};
