const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { query, withTransaction } = require("../utils/db");
const {
  ensurePublicListingComplete,
  normalizeBusinessProfileFields,
  parseJsonArray,
} = require("../utils/businessProfile");
const {
  BUSINESS_LISTING_STATUS_COMING_SOON,
  BUSINESS_LISTING_STATUS_HIDDEN,
  BUSINESS_LISTING_STATUS_LISTED,
  BUSINESS_MEMBER_ROLE_KITCHEN,
  BUSINESS_MEMBER_ROLE_MANAGER,
  BUSINESS_MEMBER_ROLE_OWNER,
  BUSINESS_MEMBER_ROLE_TOURNAMENT_MANAGER,
  BUSINESS_MEMBER_STATUS_ACTIVE,
  BUSINESS_MEMBER_STATUS_DISABLED,
  BUSINESS_MEMBER_STATUS_INVITED,
  BUSINESS_MEMBER_STATUS_PENDING,
  BUSINESS_STATUS_ACTIVE,
  BUSINESS_STATUS_DRAFT,
  BUSINESS_STATUS_PENDING,
  BUSINESS_STATUS_SUSPENDED,
  normalizeBusinessId,
  slugifyBusinessName,
} = require("../utils/businesses");

const router = express.Router();
const PAYOUT_METHODS = new Set(["manual", "bank_transfer", "upi"]);
const PAYOUT_SCHEDULES = new Set(["manual", "weekly", "monthly"]);
const STATUSES = new Set([
  BUSINESS_STATUS_DRAFT,
  BUSINESS_STATUS_PENDING,
  BUSINESS_STATUS_ACTIVE,
  BUSINESS_STATUS_SUSPENDED,
]);
const LISTING_STATUSES = new Set([
  BUSINESS_LISTING_STATUS_HIDDEN,
  BUSINESS_LISTING_STATUS_LISTED,
  BUSINESS_LISTING_STATUS_COMING_SOON,
]);
const MEMBER_ROLES = new Set([
  BUSINESS_MEMBER_ROLE_OWNER,
  BUSINESS_MEMBER_ROLE_MANAGER,
  BUSINESS_MEMBER_ROLE_KITCHEN,
  BUSINESS_MEMBER_ROLE_TOURNAMENT_MANAGER,
]);
const MEMBER_STATUSES = new Set([
  BUSINESS_MEMBER_STATUS_INVITED,
  BUSINESS_MEMBER_STATUS_PENDING,
  BUSINESS_MEMBER_STATUS_ACTIVE,
  BUSINESS_MEMBER_STATUS_DISABLED,
]);

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function numberInRange(value, label, min, max = Number.MAX_SAFE_INTEGER) {
  if (value === "" || value === null || value === undefined) return min === 0 ? 0 : null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    fail(`${label} must be between ${min} and ${max}.`);
  }
  return Math.round(number * 100) / 100;
}

function nullableText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeTime(value, label) {
  const time = String(value ?? "").trim();
  if (!time) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
    fail(`${label} must use 24-hour time.`);
  }
  return time.length === 5 ? `${time}:00` : time;
}

function normalizeBusinessPayload(body, current = {}) {
  const name = String(body.name ?? current.name ?? "").trim();
  if (!name) fail("Cafe name is required.");
  const status = String(body.status ?? current.status ?? BUSINESS_STATUS_PENDING).trim().toLowerCase();
  const listingStatus = String(
    body.listing_status ?? current.listing_status ?? BUSINESS_LISTING_STATUS_HIDDEN
  ).trim().toLowerCase();
  if (!STATUSES.has(status)) fail("Choose a valid cafe status.");
  if (!LISTING_STATUSES.has(listingStatus)) fail("Choose a valid listing status.");

  const timezone = String(body.timezone ?? current.timezone ?? "Asia/Kolkata").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch (_) {
    fail("Choose a valid time zone.");
  }

  const contactEmail = String(body.contact_email ?? current.contact_email ?? "").trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    fail("Enter a valid contact email.");
  }
  if (contactEmail.length > 191) fail("Contact email must be 191 characters or fewer.");
  const profileFields = normalizeBusinessProfileFields(body, current);

  const submittedSlug = String(body.slug ?? current.slug ?? "").trim();
  const slug = slugifyBusinessName(submittedSlug || name).slice(0, 140).replace(/-+$/g, "");
  const payload = {
    slug,
    name: name.slice(0, 140),
    tagline: nullableText(body.tagline ?? current.tagline, 180),
    description: nullableText(body.description ?? current.description, 6000),
    city: nullableText(body.city ?? current.city, 120),
    state: nullableText(body.state ?? current.state, 120),
    address_line1: nullableText(body.address_line1 ?? current.address_line1, 180),
    ...profileFields,
    contact_email: contactEmail || null,
    timezone,
    status,
    listing_status: listingStatus,
    is_featured: body.is_featured === true || body.is_featured === 1 || body.is_featured === "1" ? 1 : 0,
    opens_at: normalizeTime(body.opens_at ?? current.opens_at, "Opening time"),
    closes_at: normalizeTime(body.closes_at ?? current.closes_at, "Closing time"),
    logo_image: nullableText(body.logo_image ?? current.logo_image, 255),
    cover_image: nullableText(body.cover_image ?? current.cover_image, 255),
    commission_rate: numberInRange(body.commission_rate ?? current.commission_rate, "Commission rate", 0, 100),
    convenience_fee_flat: numberInRange(body.convenience_fee_flat ?? current.convenience_fee_flat, "Flat fee", 0, 1000000),
    convenience_fee_rate: numberInRange(body.convenience_fee_rate ?? current.convenience_fee_rate, "Fee rate", 0, 100),
  };
  if (payload.status === BUSINESS_STATUS_ACTIVE && payload.listing_status === BUSINESS_LISTING_STATUS_LISTED) {
    ensurePublicListingComplete(payload);
  }
  return payload;
}

function normalizePayoutSettings(body, current = {}) {
  const payoutMethod = String(body.payout_method ?? current.payout_method ?? "manual").trim().toLowerCase();
  const payoutSchedule = String(body.payout_schedule ?? current.payout_schedule ?? "manual").trim().toLowerCase();
  if (!PAYOUT_METHODS.has(payoutMethod)) fail("Choose a valid payout method.");
  if (!PAYOUT_SCHEDULES.has(payoutSchedule)) fail("Choose a valid payout schedule.");
  return {
    payout_method: payoutMethod,
    payout_schedule: payoutSchedule,
    minimum_payout_amount: numberInRange(
      body.minimum_payout_amount ?? current.minimum_payout_amount,
      "Minimum payout amount",
      0,
      100000000
    ),
  };
}

function toBusiness(row) {
  if (!row) return null;
  return {
    ...row,
    business_id: Number(row.business_id),
    is_featured: Boolean(Number(row.is_featured || 0)),
    commission_rate: Number(row.commission_rate || 0),
    convenience_fee_flat: Number(row.convenience_fee_flat || 0),
    convenience_fee_rate: Number(row.convenience_fee_rate || 0),
    amenities: parseJsonArray(row.amenities),
    equipment_highlights: parseJsonArray(row.equipment_highlights),
    gallery_images: parseJsonArray(row.gallery_images),
  };
}

function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function toPayoutSettings(row = {}) {
  return {
    payout_method: row.payout_method || "manual",
    payout_schedule: row.payout_schedule || "manual",
    minimum_payout_amount: Number(row.minimum_payout_amount || 0),
  };
}

async function selectRows(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return rows;
}

async function getBusiness(businessId, connection = null) {
  const executor = connection || { query: async (sql, params) => [await query(sql, params)] };
  const rows = await selectRows(
    executor,
    `
      SELECT b.*, s.payout_method, s.payout_schedule, s.minimum_payout_amount
      FROM businesses b
      LEFT JOIN business_payout_settings s ON s.business_id = b.business_id
      WHERE b.business_id = ? LIMIT 1
    `,
    [businessId]
  );
  if (!rows[0]) return null;
  const { payout_method, payout_schedule, minimum_payout_amount, ...business } = rows[0];
  return {
    business: toBusiness(business),
    payout_settings: toPayoutSettings({ payout_method, payout_schedule, minimum_payout_amount }),
  };
}

async function writeAudit(connection, { businessId, actorId, action, before, after }) {
  await connection.query(
    `
      INSERT INTO business_audit_logs (business_id, actor_admin_id, action, before_json, after_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    [businessId, actorId, action, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]
  );
}

async function findAvailableSlug(slug, exceptBusinessId = null) {
  const base = slugifyBusinessName(slug);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const rows = await query(
      `SELECT business_id FROM businesses WHERE slug = ? ${exceptBusinessId ? "AND business_id <> ?" : ""} LIMIT 1`,
      exceptBusinessId ? [candidate, exceptBusinessId] : [candidate]
    );
    if (!rows.length) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

const superAdminOnly = [
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE),
  adminAuth.requireSuperAdmin,
];

router.get("/", ...superAdminOnly, async (req, res) => {
  try {
    const rows = await query(`
      SELECT b.business_id, b.slug, b.name, b.city, b.state, b.status, b.listing_status,
        b.is_featured, b.updated_at, COUNT(DISTINCT bam.admin_id) AS staff_count,
        COUNT(DISTINCT pc.pc_id) AS station_count, COUNT(DISTINCT m.id) AS menu_item_count
      FROM businesses b
      LEFT JOIN business_admin_memberships bam ON bam.business_id = b.business_id
      LEFT JOIN pc ON pc.business_id = b.business_id
      LEFT JOIN menu m ON m.business_id = b.business_id
      GROUP BY b.business_id
      ORDER BY b.name ASC, b.business_id ASC
    `);
    res.json(rows.map((row) => ({
      ...row,
      business_id: Number(row.business_id),
      is_featured: Boolean(Number(row.is_featured || 0)),
      staff_count: Number(row.staff_count || 0),
      station_count: Number(row.station_count || 0),
      menu_item_count: Number(row.menu_item_count || 0),
    })));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.post("/", ...superAdminOnly, async (req, res) => {
  try {
    const payload = normalizeBusinessPayload(req.body || {});
    payload.slug = await findAvailableSlug(payload.slug);
    const payout = normalizePayoutSettings(req.body?.payout_settings || {});
    const created = await withTransaction(async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO businesses (
          slug, name, tagline, description, city, state, address_line1, phone, contact_email,
          timezone, status, listing_status, is_featured, opens_at, closes_at, logo_image,
          cover_image, commission_rate, convenience_fee_flat, convenience_fee_rate,
          created_by_admin_id, approved_by_admin_id, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [payload.slug, payload.name, payload.tagline, payload.description, payload.city, payload.state,
          payload.address_line1, payload.phone, payload.contact_email, payload.timezone, payload.status,
          payload.listing_status, payload.is_featured, payload.opens_at, payload.closes_at,
          payload.logo_image, payload.cover_image, payload.commission_rate, payload.convenience_fee_flat,
          payload.convenience_fee_rate, req.admin.id, payload.status === BUSINESS_STATUS_ACTIVE ? req.admin.id : null,
          payload.status === BUSINESS_STATUS_ACTIVE ? new Date() : null]
      );
      const businessId = Number(result.insertId);
      await connection.query(
        `UPDATE businesses SET address_line2=?, postal_code=?, latitude=?, longitude=?, amenities=?,
          equipment_highlights=?, gallery_images=?, parking_info=?, accessibility_info=?, policies=?
         WHERE business_id=?`,
        [payload.address_line2, payload.postal_code, payload.latitude, payload.longitude,
          jsonArray(payload.amenities), jsonArray(payload.equipment_highlights), jsonArray(payload.gallery_images),
          payload.parking_info, payload.accessibility_info, payload.policies, businessId]
      );
      await connection.query(
        `INSERT INTO business_payout_settings (business_id, payout_method, payout_schedule, minimum_payout_amount, updated_by_admin_id)
         VALUES (?, ?, ?, ?, ?)`,
        [businessId, payout.payout_method, payout.payout_schedule, payout.minimum_payout_amount, req.admin.id]
      );
      const after = await getBusiness(businessId, connection);
      await writeAudit(connection, { businessId, actorId: req.admin.id, action: "business.created", after });
      return after;
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(error.statusCode || (error.code === "ER_DUP_ENTRY" ? 409 : 500)).json({ message: error.message });
  }
});

router.get("/:businessId", ...superAdminOnly, async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.params.businessId, 0);
    if (!businessId) fail("Valid business id required.");
    const detail = await getBusiness(businessId);
    if (!detail) fail("Cafe not found.", 404);
    res.json(detail);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.put("/:businessId", ...superAdminOnly, async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.params.businessId, 0);
    if (!businessId) fail("Valid business id required.");
    const before = await getBusiness(businessId);
    if (!before) fail("Cafe not found.", 404);
    const payload = normalizeBusinessPayload(req.body || {}, { ...before.business, ...req.body });
    payload.slug = await findAvailableSlug(payload.slug, businessId);
    const payout = normalizePayoutSettings(req.body?.payout_settings || {}, before.payout_settings);
    const becomingActive = payload.status === BUSINESS_STATUS_ACTIVE && before.business.status !== BUSINESS_STATUS_ACTIVE;
    const after = await withTransaction(async (connection) => {
      await connection.query(
        `UPDATE businesses SET
          approved_by_admin_id=CASE WHEN ?=1 THEN ? ELSE approved_by_admin_id END,
          approved_at=CASE WHEN ?=1 THEN NOW() ELSE approved_at END,
          slug=?, name=?, tagline=?, description=?, city=?, state=?, address_line1=?,
          address_line2=?, postal_code=?, latitude=?, longitude=?, phone=?, contact_email=?, timezone=?, status=?,
          listing_status=?, is_featured=?, opens_at=?, closes_at=?, logo_image=?, cover_image=?, amenities=?,
          equipment_highlights=?, gallery_images=?, parking_info=?, accessibility_info=?, policies=?,
          commission_rate=?, convenience_fee_flat=?, convenience_fee_rate=?
         WHERE business_id=?`,
        [becomingActive ? 1 : 0, req.admin.id, becomingActive ? 1 : 0,
          payload.slug, payload.name, payload.tagline, payload.description, payload.city, payload.state,
          payload.address_line1, payload.address_line2, payload.postal_code, payload.latitude, payload.longitude,
          payload.phone, payload.contact_email, payload.timezone, payload.status, payload.listing_status,
          payload.is_featured, payload.opens_at, payload.closes_at, payload.logo_image, payload.cover_image,
          jsonArray(payload.amenities), jsonArray(payload.equipment_highlights), jsonArray(payload.gallery_images),
          payload.parking_info, payload.accessibility_info, payload.policies,
          payload.commission_rate, payload.convenience_fee_flat, payload.convenience_fee_rate, businessId]
      );
      await connection.query(
        `INSERT INTO business_payout_settings (business_id, payout_method, payout_schedule, minimum_payout_amount, updated_by_admin_id)
         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE payout_method=VALUES(payout_method),
         payout_schedule=VALUES(payout_schedule), minimum_payout_amount=VALUES(minimum_payout_amount), updated_by_admin_id=VALUES(updated_by_admin_id)`,
        [businessId, payout.payout_method, payout.payout_schedule, payout.minimum_payout_amount, req.admin.id]
      );
      const next = await getBusiness(businessId, connection);
      await writeAudit(connection, { businessId, actorId: req.admin.id, action: "business.updated", before, after: next });
      return next;
    });
    res.json(after);
  } catch (error) {
    res.status(error.statusCode || (error.code === "ER_DUP_ENTRY" ? 409 : 500)).json({ message: error.message });
  }
});

router.get("/:businessId/staff", ...superAdminOnly, async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.params.businessId, 0);
    if (!businessId) fail("Valid business id required.");
    const rows = await query(
      `SELECT a.id, a.name, a.email, a.role AS admin_role, a.status AS admin_status,
        bam.membership_id, bam.role AS membership_role, bam.status AS membership_status
       FROM admin a LEFT JOIN business_admin_memberships bam
         ON bam.admin_id = a.id AND bam.business_id = ?
       ORDER BY a.name ASC, a.id ASC`,
      [businessId]
    );
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), membership_id: row.membership_id ? Number(row.membership_id) : null })));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.put("/:businessId/staff/:adminId", ...superAdminOnly, async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.params.businessId, 0);
    const adminId = normalizeBusinessId(req.params.adminId, 0);
    if (!businessId || !adminId) fail("Valid cafe and admin ids are required.");
    const role = String(req.body?.role || "").trim().toLowerCase();
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!MEMBER_ROLES.has(role)) fail("Choose a valid staff role.");
    if (!MEMBER_STATUSES.has(status)) fail("Choose a valid membership status.");
    const result = await withTransaction(async (connection) => {
      const business = await selectRows(connection, "SELECT business_id FROM businesses WHERE business_id=? LIMIT 1", [businessId]);
      const admin = await selectRows(connection, "SELECT id, name, email FROM admin WHERE id=? LIMIT 1", [adminId]);
      if (!business.length) fail("Cafe not found.", 404);
      if (!admin.length) fail("Admin account not found.", 404);
      const currentRows = await selectRows(connection,
        "SELECT membership_id, role, status FROM business_admin_memberships WHERE business_id=? AND admin_id=? LIMIT 1",
        [businessId, adminId]);
      const before = currentRows[0] || null;
      await connection.query(
        `INSERT INTO business_admin_memberships (business_id, admin_id, role, status, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role=VALUES(role), status=VALUES(status), updated_at=NOW()`,
        [businessId, adminId, role, status, req.admin.id]
      );
      const after = { admin_id: adminId, name: admin[0].name, email: admin[0].email, role, status };
      await writeAudit(connection, { businessId, actorId: req.admin.id, action: "staff.membership.updated", before, after });
      return after;
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.get("/:businessId/audit", ...superAdminOnly, async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.params.businessId, 0);
    if (!businessId) fail("Valid business id required.");
    const businessRows = await query("SELECT business_id FROM businesses WHERE business_id=? LIMIT 1", [businessId]);
    if (!businessRows.length) fail("Cafe not found.", 404);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = await query(
      `SELECT log.audit_id, log.business_id, log.actor_admin_id, log.action, log.before_json,
        log.after_json, log.created_at, a.name AS actor_name, a.email AS actor_email
       FROM business_audit_logs log LEFT JOIN admin a ON a.id=log.actor_admin_id
       WHERE log.business_id=? ORDER BY log.audit_id DESC LIMIT ?`,
      [businessId, limit]
    );
    res.json(rows.map((row) => ({
      ...row,
      audit_id: Number(row.audit_id),
      business_id: Number(row.business_id),
      actor_admin_id: row.actor_admin_id ? Number(row.actor_admin_id) : null,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      before_json: undefined,
      after_json: undefined,
    })));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.normalizeBusinessPayload = normalizeBusinessPayload;
module.exports = router;
