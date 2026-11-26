const { ADMIN_ROLE_SUPER } = require("./adminAccess");
const { query } = require("./db");
const { normalizeBusinessId } = require("./businesses");

function getAdminRole(admin) {
  return String(admin?.role || "").trim().toLowerCase();
}

function isSuperAdmin(admin) {
  return getAdminRole(admin) === ADMIN_ROLE_SUPER;
}

function extractBusinessIdFromSource(source) {
  return normalizeBusinessId(source?.business_id, 0);
}

function readRequestedBusinessId(req, sources = ["query", "body", "params"]) {
  for (const sourceName of sources) {
    const businessId = extractBusinessIdFromSource(req?.[sourceName]);
    if (businessId) {
      return businessId;
    }
  }

  return 0;
}

async function getBusinessById(businessId) {
  const rows = await query(
    `
      SELECT business_id, name, status, listing_status
      FROM businesses
      WHERE business_id = ?
      LIMIT 1
    `,
    [normalizeBusinessId(businessId, 0)]
  );

  return rows[0] || null;
}

async function requireAdminBusinessAccess(admin, businessId) {
  const safeBusinessId = normalizeBusinessId(businessId, 0);

  if (!safeBusinessId) {
    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  const business = await getBusinessById(safeBusinessId);

  if (!business) {
    const error = new Error("Business not found.");
    error.statusCode = 404;
    throw error;
  }

  if (isSuperAdmin(admin)) {
    return business;
  }

  const rows = await query(
    `
      SELECT membership_id, status
      FROM business_admin_memberships
      WHERE admin_id = ?
      AND business_id = ?
      LIMIT 1
    `,
    [Number(admin?.id || 0), safeBusinessId]
  );

  if (!rows.length) {
    const error = new Error("You do not have access to this business.");
    error.statusCode = 403;
    throw error;
  }

  if (String(rows[0].status || "").trim().toLowerCase() !== "active") {
    const error = new Error("This business membership is not active.");
    error.statusCode = 403;
    throw error;
  }

  return business;
}

async function resolveScopedAdminBusinessId(
  req,
  { sources = ["query", "body", "params"], allowAllForSuperAdmin = false } = {}
) {
  const businessId = readRequestedBusinessId(req, sources);

  if (!businessId) {
    if (allowAllForSuperAdmin && isSuperAdmin(req?.admin)) {
      return null;
    }

    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  await requireAdminBusinessAccess(req?.admin, businessId);
  return businessId;
}

module.exports = {
  getBusinessById,
  isSuperAdmin,
  readRequestedBusinessId,
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
};
