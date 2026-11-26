const { ADMIN_ROLE_SUPER } = require("./adminAccess");
const { roundCurrency } = require("./billing");
const { query, withTransaction } = require("./db");
const { parseJsonArray } = require("./businessProfile");

const BUSINESS_STATUS_DRAFT = "draft";
const BUSINESS_STATUS_PENDING = "pending";
const BUSINESS_STATUS_ACTIVE = "active";
const BUSINESS_STATUS_SUSPENDED = "suspended";
const BUSINESS_STATUSES = new Set([
  BUSINESS_STATUS_DRAFT,
  BUSINESS_STATUS_PENDING,
  BUSINESS_STATUS_ACTIVE,
  BUSINESS_STATUS_SUSPENDED,
]);

const BUSINESS_LISTING_STATUS_HIDDEN = "hidden";
const BUSINESS_LISTING_STATUS_LISTED = "listed";
const BUSINESS_LISTING_STATUS_COMING_SOON = "coming_soon";
const BUSINESS_LISTING_STATUSES = new Set([
  BUSINESS_LISTING_STATUS_HIDDEN,
  BUSINESS_LISTING_STATUS_LISTED,
  BUSINESS_LISTING_STATUS_COMING_SOON,
]);

const BUSINESS_MEMBER_ROLE_OWNER = "owner";
const BUSINESS_MEMBER_ROLE_MANAGER = "manager";
const BUSINESS_MEMBER_ROLE_KITCHEN = "kitchen";
const BUSINESS_MEMBER_ROLE_TOURNAMENT_MANAGER = "tournament_manager";
const BUSINESS_MEMBER_ROLES = new Set([
  BUSINESS_MEMBER_ROLE_OWNER,
  BUSINESS_MEMBER_ROLE_MANAGER,
  BUSINESS_MEMBER_ROLE_KITCHEN,
  BUSINESS_MEMBER_ROLE_TOURNAMENT_MANAGER,
]);

const BUSINESS_MEMBER_STATUS_INVITED = "invited";
const BUSINESS_MEMBER_STATUS_PENDING = "pending";
const BUSINESS_MEMBER_STATUS_ACTIVE = "active";
const BUSINESS_MEMBER_STATUS_DISABLED = "disabled";
const BUSINESS_MEMBER_STATUSES = new Set([
  BUSINESS_MEMBER_STATUS_INVITED,
  BUSINESS_MEMBER_STATUS_PENDING,
  BUSINESS_MEMBER_STATUS_ACTIVE,
  BUSINESS_MEMBER_STATUS_DISABLED,
]);

const BUSINESS_REVIEW_MIN_RATING = 1;
const BUSINESS_REVIEW_MAX_RATING = 5;
const BUSINESS_REVIEW_TITLE_MAX_LENGTH = 80;
const BUSINESS_REVIEW_TEXT_MAX_LENGTH = 480;

function selectRows(executor, sql, params = []) {
  if (executor && typeof executor.query === "function") {
    return executor.query(sql, params).then((result) =>
      Array.isArray(result?.[0]) ? result[0] : result
    );
  }

  return query(sql, params);
}

function normalizeBusinessId(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function slugifyBusinessName(value, fallback = "business") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function normalizeBusinessStatus(value, fallback = BUSINESS_STATUS_PENDING) {
  const normalized = String(value || "").trim().toLowerCase();
  return BUSINESS_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeBusinessListingStatus(value, fallback = BUSINESS_LISTING_STATUS_HIDDEN) {
  const normalized = String(value || "").trim().toLowerCase();
  return BUSINESS_LISTING_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeBusinessRole(value, fallback = BUSINESS_MEMBER_ROLE_MANAGER) {
  const normalized = String(value || "").trim().toLowerCase();
  return BUSINESS_MEMBER_ROLES.has(normalized) ? normalized : fallback;
}

function normalizeBusinessMembershipStatus(value, fallback = BUSINESS_MEMBER_STATUS_ACTIVE) {
  const normalized = String(value || "").trim().toLowerCase();
  return BUSINESS_MEMBER_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeBusinessReviewRating(value, fallback = 0) {
  const parsed = Math.floor(Number(value));

  if (parsed < BUSINESS_REVIEW_MIN_RATING || parsed > BUSINESS_REVIEW_MAX_RATING) {
    return fallback;
  }

  return parsed;
}

function normalizeBusinessReviewTitle(value, fallback = "") {
  return String(value || fallback)
    .trim()
    .slice(0, BUSINESS_REVIEW_TITLE_MAX_LENGTH);
}

function normalizeBusinessReviewText(value, fallback = "") {
  return String(value || fallback)
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, BUSINESS_REVIEW_TEXT_MAX_LENGTH);
}

function parseClockMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isBusinessOpenNow(row, now = new Date()) {
  const opensAt = parseClockMinutes(row?.opens_at);
  const closesAt = parseClockMinutes(row?.closes_at);
  if (opensAt == null || closesAt == null) return false;
  const timezone = String(row?.timezone || "Asia/Kolkata");
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const current = hour * 60 + minute;
    return closesAt <= opensAt
      ? current >= opensAt || current < closesAt
      : current >= opensAt && current < closesAt;
  } catch (_) {
    return false;
  }
}

function splitSummaryList(value, delimiter = ",") {
  return String(value || "").split(delimiter).map((part) => part.trim()).filter(Boolean);
}

function publicProfileRequirements(alias = "b") {
  const prefix = alias ? `${alias}.` : "";
  return `
    AND TRIM(COALESCE(${prefix}address_line1, '')) <> ''
    AND TRIM(COALESCE(${prefix}city, '')) <> ''
    AND TRIM(COALESCE(${prefix}state, '')) <> ''
    AND (TRIM(COALESCE(${prefix}phone, '')) <> '' OR TRIM(COALESCE(${prefix}contact_email, '')) <> '')
    AND ${prefix}opens_at IS NOT NULL
    AND ${prefix}closes_at IS NOT NULL
  `;
}

function serializeBusiness(row) {
  if (!row) {
    return null;
  }

  return {
    business_id: normalizeBusinessId(row.business_id),
    slug: row.slug || "",
    name: row.name || "",
    tagline: row.tagline || "",
    description: row.description || "",
    city: row.city || "",
    state: row.state || "",
    timezone: row.timezone || "Asia/Kolkata",
    address_line1: row.address_line1 || "",
    address_line2: row.address_line2 || "",
    postal_code: row.postal_code || "",
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    phone: row.phone || "",
    contact_email: row.contact_email || "",
    status: normalizeBusinessStatus(row.status),
    listing_status: normalizeBusinessListingStatus(row.listing_status),
    is_featured: Number(row.is_featured || 0) === 1,
    opens_at: row.opens_at || null,
    closes_at: row.closes_at || null,
    logo_image: row.logo_image || null,
    cover_image: row.cover_image || null,
    amenities: parseJsonArray(row.amenities),
    equipment_highlights: parseJsonArray(row.equipment_highlights),
    gallery_images: parseJsonArray(row.gallery_images),
    parking_info: row.parking_info || "",
    accessibility_info: row.accessibility_info || "",
    policies: row.policies || "",
    commission_rate: roundCurrency(row.commission_rate || 0),
    convenience_fee_flat: roundCurrency(row.convenience_fee_flat || 0),
    convenience_fee_rate: roundCurrency(row.convenience_fee_rate || 0),
    average_rating: roundCurrency(row.average_rating || 0),
    review_count: Number(row.review_count || 0),
    total_rigs: Number(row.total_rigs || 0),
    active_rigs: Number(row.active_rigs || 0),
    available_rigs: Number(row.available_rigs || 0),
    min_price_per_hour: row.min_price_per_hour == null ? null : roundCurrency(row.min_price_per_hour),
    max_price_per_hour: row.max_price_per_hour == null ? null : roundCurrency(row.max_price_per_hour),
    station_categories: splitSummaryList(row.station_categories),
    game_titles: splitSummaryList(row.game_titles, "||"),
    is_open_now: isBusinessOpenNow(row),
    menu_item_count: Number(row.menu_item_count || 0),
    featured_menu_item_count: Number(row.featured_menu_item_count || 0),
    published_tournament_count: Number(row.published_tournament_count || 0),
    approved_at: row.approved_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function serializeBusinessReview(row, { viewerUserId = 0 } = {}) {
  if (!row) {
    return null;
  }

  const normalizedViewerUserId = normalizeBusinessId(viewerUserId, 0);
  const reviewUserId = normalizeBusinessId(row.user_id, 0);

  return {
    review_id: normalizeBusinessId(row.review_id, 0),
    business_id: normalizeBusinessId(row.business_id, 0),
    user_id: reviewUserId,
    bill_id: normalizeBusinessId(row.bill_id, 0) || null,
    rating: normalizeBusinessReviewRating(row.rating),
    review_title: row.review_title || "",
    review_text: row.review_text || "",
    author_name: row.author_name || "Verified player",
    author_avatar: row.author_avatar || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_mine: normalizedViewerUserId > 0 && reviewUserId === normalizedViewerUserId,
  };
}

function serializeBusinessMembership(row) {
  const business = serializeBusiness(row);

  return {
    ...business,
    membership_role: normalizeBusinessRole(row.membership_role),
    membership_status: normalizeBusinessMembershipStatus(row.membership_status),
    is_platform_admin: Number(row.is_platform_admin || 0) === 1,
  };
}

function buildBusinessSummarySelect(alias = "b") {
  const prefix = alias ? `${alias}.` : "";

  return `
    ${prefix}business_id,
    ${prefix}slug,
    ${prefix}name,
    ${prefix}tagline,
    ${prefix}description,
    ${prefix}city,
    ${prefix}state,
    ${prefix}timezone,
    ${prefix}address_line1,
    ${prefix}address_line2,
    ${prefix}postal_code,
    ${prefix}latitude,
    ${prefix}longitude,
    ${prefix}phone,
    ${prefix}contact_email,
    ${prefix}status,
    ${prefix}listing_status,
    ${prefix}is_featured,
    ${prefix}opens_at,
    ${prefix}closes_at,
    ${prefix}logo_image,
    ${prefix}cover_image,
    ${prefix}amenities,
    ${prefix}equipment_highlights,
    ${prefix}gallery_images,
    ${prefix}parking_info,
    ${prefix}accessibility_info,
    ${prefix}policies,
    ${prefix}commission_rate,
    ${prefix}convenience_fee_flat,
    ${prefix}convenience_fee_rate,
    (
      SELECT COALESCE(ROUND(AVG(br.rating), 2), 0)
      FROM business_reviews br
      WHERE br.business_id = ${prefix}business_id
    ) AS average_rating,
    (
      SELECT COUNT(*)
      FROM business_reviews br
      WHERE br.business_id = ${prefix}business_id
    ) AS review_count,
    ${prefix}approved_at,
    ${prefix}created_at,
    ${prefix}updated_at,
    (
      SELECT COUNT(*)
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
    ) AS total_rigs,
    (
      SELECT COUNT(*)
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
      AND LOWER(COALESCE(p.status, '')) <> 'inactive'
    ) AS active_rigs,
    (
      SELECT COUNT(*)
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
      AND LOWER(COALESCE(p.status, '')) = 'active'
    ) AS available_rigs,
    (
      SELECT MIN(p.price_per_hour)
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
      AND LOWER(COALESCE(p.status, '')) = 'active'
    ) AS min_price_per_hour,
    (
      SELECT MAX(p.price_per_hour)
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
      AND LOWER(COALESCE(p.status, '')) = 'active'
    ) AS max_price_per_hour,
    (
      SELECT GROUP_CONCAT(DISTINCT p.category ORDER BY p.category SEPARATOR ',')
      FROM pc p
      WHERE p.business_id = ${prefix}business_id
      AND LOWER(COALESCE(p.status, '')) = 'active'
    ) AS station_categories,
    (
      SELECT GROUP_CONCAT(DISTINCT t.game_title ORDER BY t.game_title SEPARATOR '||')
      FROM tournaments t
      WHERE t.business_id = ${prefix}business_id
      AND LOWER(COALESCE(t.status, '')) = 'published'
      AND t.start_at >= NOW()
    ) AS game_titles,
    (
      SELECT COUNT(*)
      FROM menu m
      WHERE m.business_id = ${prefix}business_id
      AND COALESCE(m.is_available, 0) = 1
    ) AS menu_item_count,
    (
      SELECT COUNT(*)
      FROM menu m
      WHERE m.business_id = ${prefix}business_id
      AND COALESCE(m.is_available, 0) = 1
      AND COALESCE(m.is_featured, 0) = 1
    ) AS featured_menu_item_count,
    (
      SELECT COUNT(*)
      FROM tournaments t
      WHERE t.business_id = ${prefix}business_id
      AND LOWER(COALESCE(t.status, '')) = 'published'
      AND t.start_at >= NOW()
    ) AS published_tournament_count
  `;
}

async function listPublicBusinesses({ limit = 24 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 24));
  const rows = await query(
    `
      SELECT ${buildBusinessSummarySelect("b")}
      FROM businesses b
      WHERE b.status = ?
      AND b.listing_status = ?
      ${publicProfileRequirements("b")}
      ORDER BY b.is_featured DESC, b.name ASC, b.business_id ASC
      LIMIT ?
    `,
    [BUSINESS_STATUS_ACTIVE, BUSINESS_LISTING_STATUS_LISTED, safeLimit]
  );

  return rows.map(serializeBusiness);
}

async function listPublicCafeDiscovery({ date, startHour, durationHours }) {
  const safeDate = String(date || "").trim();
  const parsedDate = new Date(`${safeDate}T00:00:00.000Z`);
  const safeStartHour = Number(startHour);
  const safeDuration = Number(durationHours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== safeDate ||
      !Number.isInteger(safeStartHour) || safeStartHour < 9 || safeStartHour >= 23 ||
      !Number.isInteger(safeDuration) || safeDuration < 1 || safeDuration > 14 ||
      safeStartHour + safeDuration > 23) {
    const error = new Error("Choose a valid date, start time, and session duration.");
    error.statusCode = 400;
    throw error;
  }

  const businesses = await listPublicBusinesses({ limit: 100 });
  if (!businesses.length) return [];

  const businessIds = businesses.map((business) => business.business_id);
  const slotHours = Array.from({ length: safeDuration }, (_, index) => safeStartHour + index);
  const businessPlaceholders = businessIds.map(() => "?").join(", ");
  const hourPlaceholders = slotHours.map(() => "?").join(", ");
  const rows = await query(
    `SELECT p.pc_id, p.business_id, p.specs, p.category, p.price_per_hour
     FROM pc p
     WHERE p.business_id IN (${businessPlaceholders})
       AND LOWER(COALESCE(p.status, ''))='active'
       AND NOT EXISTS (
         SELECT 1 FROM booking_slots bs
         JOIN booking b ON b.booking_id=bs.booking_id
         WHERE bs.pc_id=p.pc_id AND bs.booking_date=? AND bs.hour IN (${hourPlaceholders})
           AND b.status NOT IN ('cancelled', 'closed', 'completed')
           AND (b.status <> 'pending_payment' OR b.payment_expires_at > NOW())
       )
       AND NOT EXISTS (
         SELECT 1 FROM station_waitlist_openings op
         WHERE op.pc_id=p.pc_id AND op.booking_date=?
           AND op.status IN ('open', 'offered')
           AND (op.status='open' OR op.expires_at IS NULL OR op.expires_at > NOW())
           AND op.start_hour < ? AND op.end_hour > ?
       )
     ORDER BY p.business_id, p.price_per_hour ASC, p.pc_id ASC`,
    [...businessIds, safeDate, ...slotHours, safeDate, safeStartHour + safeDuration, safeStartHour]
  );

  const setupsByBusiness = new Map();
  for (const row of rows) {
    const businessId = normalizeBusinessId(row.business_id);
    const setups = setupsByBusiness.get(businessId) || [];
    setups.push({
      pc_id: normalizeBusinessId(row.pc_id),
      business_id: businessId,
      specs: row.specs || "Gaming setup",
      category: String(row.category || "esports_pc").toLowerCase(),
      price_per_hour: roundCurrency(row.price_per_hour || 0),
    });
    setupsByBusiness.set(businessId, setups);
  }

  return businesses.map((business) => ({
    ...business,
    available_setups: setupsByBusiness.get(business.business_id) || [],
    availability_window: {
      date: safeDate,
      start_hour: safeStartHour,
      duration_hours: safeDuration,
    },
  }));
}

async function getPublicBusinessDetails(slugOrId) {
  const rawIdentifier = String(slugOrId || "").trim();
  const numericId = normalizeBusinessId(rawIdentifier);

  if (!rawIdentifier && !numericId) {
    return null;
  }

  const rows = await query(
    `
      SELECT ${buildBusinessSummarySelect("b")}
      FROM businesses b
      WHERE b.status = ?
      AND b.listing_status = ?
      ${publicProfileRequirements("b")}
      AND (b.slug = ? OR b.business_id = ?)
      LIMIT 1
    `,
    [
      BUSINESS_STATUS_ACTIVE,
      BUSINESS_LISTING_STATUS_LISTED,
      rawIdentifier,
      numericId || 0,
    ]
  );

  return rows[0] ? serializeBusiness(rows[0]) : null;
}

async function listPublicBusinessReviews(slugOrId, { limit = 6, viewerUserId = 0 } = {}) {
  const business = await getPublicBusinessDetails(slugOrId);

  if (!business) {
    return null;
  }

  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 6));
  const rows = await query(
    `
      SELECT
        br.review_id,
        br.business_id,
        br.user_id,
        br.bill_id,
        br.rating,
        br.review_title,
        br.review_text,
        br.created_at,
        br.updated_at,
        COALESCE(NULLIF(u.gamer_tag, ''), NULLIF(u.name, ''), 'Verified player') AS author_name,
        COALESCE(u.avatar, '') AS author_avatar
      FROM business_reviews br
      LEFT JOIN users u ON u.uid = br.user_id
      WHERE br.business_id = ?
      ORDER BY br.updated_at DESC, br.review_id DESC
      LIMIT ?
    `,
    [business.business_id, safeLimit]
  );

  return {
    business_id: business.business_id,
    business_slug: business.slug,
    business_name: business.name,
    average_rating: business.average_rating,
    review_count: business.review_count,
    reviews: rows.map((row) =>
      serializeBusinessReview(row, { viewerUserId })
    ),
  };
}

async function getUserBusinessReviewState({ businessId, userId }) {
  const normalizedBusinessId = normalizeBusinessId(businessId, 0);
  const normalizedUserId = normalizeBusinessId(userId, 0);

  if (!normalizedBusinessId || !normalizedUserId) {
    return null;
  }

  const businessRows = await query(
    `
      SELECT ${buildBusinessSummarySelect("b")}
      FROM businesses b
      WHERE b.business_id = ?
      AND b.status = ?
      AND b.listing_status = ?
      ${publicProfileRequirements("b")}
      LIMIT 1
    `,
    [normalizedBusinessId, BUSINESS_STATUS_ACTIVE, BUSINESS_LISTING_STATUS_LISTED]
  );

  const business = businessRows[0] ? serializeBusiness(businessRows[0]) : null;

  if (!business) {
    return null;
  }

  const [proofRows, reviewRows] = await Promise.all([
    query(
      `
        SELECT bill_id, created_at
        FROM bills
        WHERE business_id = ?
        AND user_id = ?
        ORDER BY created_at DESC, bill_id DESC
        LIMIT 1
      `,
      [normalizedBusinessId, normalizedUserId]
    ),
    query(
      `
        SELECT
          br.review_id,
          br.business_id,
          br.user_id,
          br.bill_id,
          br.rating,
          br.review_title,
          br.review_text,
          br.created_at,
          br.updated_at,
          COALESCE(NULLIF(u.gamer_tag, ''), NULLIF(u.name, ''), 'Verified player') AS author_name,
          COALESCE(u.avatar, '') AS author_avatar
        FROM business_reviews br
        LEFT JOIN users u ON u.uid = br.user_id
        WHERE br.business_id = ?
        AND br.user_id = ?
        LIMIT 1
      `,
      [normalizedBusinessId, normalizedUserId]
    ),
  ]);

  const proof = proofRows[0] || null;
  const review = reviewRows[0]
    ? serializeBusinessReview(reviewRows[0], {
        viewerUserId: normalizedUserId,
      })
    : null;
  const canReview = Boolean(proof || review);

  return {
    business,
    business_id: business.business_id,
    can_review: canReview,
    eligibility_reason: canReview ? null : "complete_a_purchase",
    proof_bill_id: normalizeBusinessId(proof?.bill_id, 0) || null,
    proof_bill_created_at: proof?.created_at || null,
    review,
  };
}

async function upsertUserBusinessReview({
  businessId,
  userId,
  rating,
  reviewTitle = "",
  reviewText = "",
}) {
  const normalizedBusinessId = normalizeBusinessId(businessId, 0);
  const normalizedUserId = normalizeBusinessId(userId, 0);
  const normalizedRating = normalizeBusinessReviewRating(rating, 0);
  const normalizedTitle = normalizeBusinessReviewTitle(reviewTitle);
  const normalizedText = normalizeBusinessReviewText(reviewText);

  if (!normalizedBusinessId) {
    const error = new Error("business_id required");
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedUserId) {
    const error = new Error("User session invalid.");
    error.statusCode = 401;
    throw error;
  }

  if (!normalizedRating) {
    const error = new Error("Rating must be between 1 and 5.");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedText.length < 8) {
    const error = new Error("Write a short review before submitting.");
    error.statusCode = 400;
    throw error;
  }

  const reviewState = await getUserBusinessReviewState({
    businessId: normalizedBusinessId,
    userId: normalizedUserId,
  });

  if (!reviewState?.business) {
    const error = new Error("Business not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!reviewState.can_review) {
    const error = new Error(
      "Complete a booking or checkout at this cafe before leaving a review."
    );
    error.statusCode = 403;
    throw error;
  }

  return withTransaction(async (connection) => {
    const existingRows = await selectRows(
      connection,
      `
        SELECT review_id
        FROM business_reviews
        WHERE business_id = ?
        AND user_id = ?
        LIMIT 1
      `,
      [normalizedBusinessId, normalizedUserId]
    );

    const existingReview = existingRows[0] || null;

    if (existingReview) {
      await connection.query(
        `
          UPDATE business_reviews
          SET
            bill_id = ?,
            rating = ?,
            review_title = ?,
            review_text = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE review_id = ?
        `,
        [
          reviewState.proof_bill_id,
          normalizedRating,
          normalizedTitle,
          normalizedText,
          existingReview.review_id,
        ]
      );
    } else {
      await connection.query(
        `
          INSERT INTO business_reviews (
            business_id,
            user_id,
            bill_id,
            rating,
            review_title,
            review_text
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          normalizedBusinessId,
          normalizedUserId,
          reviewState.proof_bill_id,
          normalizedRating,
          normalizedTitle,
          normalizedText,
        ]
      );
    }

    const reviewRows = await selectRows(
      connection,
      `
        SELECT
          br.review_id,
          br.business_id,
          br.user_id,
          br.bill_id,
          br.rating,
          br.review_title,
          br.review_text,
          br.created_at,
          br.updated_at,
          COALESCE(NULLIF(u.gamer_tag, ''), NULLIF(u.name, ''), 'Verified player') AS author_name,
          COALESCE(u.avatar, '') AS author_avatar
        FROM business_reviews br
        LEFT JOIN users u ON u.uid = br.user_id
        WHERE br.business_id = ?
        AND br.user_id = ?
        LIMIT 1
      `,
      [normalizedBusinessId, normalizedUserId]
    );

    const aggregateRows = await selectRows(
      connection,
      `
        SELECT
          COALESCE(ROUND(AVG(rating), 2), 0) AS average_rating,
          COUNT(*) AS review_count
        FROM business_reviews
        WHERE business_id = ?
      `,
      [normalizedBusinessId]
    );

    return {
      message: existingReview ? "Review updated." : "Review published.",
      review: serializeBusinessReview(reviewRows[0], {
        viewerUserId: normalizedUserId,
      }),
      summary: {
        business_id: normalizedBusinessId,
        average_rating: roundCurrency(aggregateRows[0]?.average_rating || 0),
        review_count: Number(aggregateRows[0]?.review_count || 0),
      },
    };
  });
}

async function listAccessibleBusinessesForAdmin(admin) {
  const adminId = normalizeBusinessId(admin?.id);

  if (!adminId) {
    return [];
  }

  if (String(admin?.role || "").trim().toLowerCase() === ADMIN_ROLE_SUPER) {
    const rows = await query(
      `
        SELECT
          ${buildBusinessSummarySelect("b")},
          'owner' AS membership_role,
          'active' AS membership_status,
          1 AS is_platform_admin
        FROM businesses b
        ORDER BY
          CASE
            WHEN b.status = 'active' THEN 0
            WHEN b.status = 'pending' THEN 1
            ELSE 2
          END,
          b.name ASC,
          b.business_id ASC
      `
    );

    return rows.map(serializeBusinessMembership);
  }

  const rows = await query(
    `
      SELECT
        ${buildBusinessSummarySelect("b")},
        bam.role AS membership_role,
        bam.status AS membership_status,
        0 AS is_platform_admin
      FROM business_admin_memberships bam
      JOIN businesses b ON b.business_id = bam.business_id
      WHERE bam.admin_id = ?
      AND bam.status IN (?, ?)
      ORDER BY
        CASE
          WHEN b.status = 'active' THEN 0
          WHEN b.status = 'pending' THEN 1
          ELSE 2
        END,
        b.name ASC,
        b.business_id ASC
    `,
    [adminId, BUSINESS_MEMBER_STATUS_ACTIVE, BUSINESS_MEMBER_STATUS_PENDING]
  );

  return rows.map(serializeBusinessMembership);
}

module.exports = {
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
  BUSINESS_REVIEW_MAX_RATING,
  BUSINESS_REVIEW_MIN_RATING,
  BUSINESS_REVIEW_TEXT_MAX_LENGTH,
  BUSINESS_REVIEW_TITLE_MAX_LENGTH,
  BUSINESS_STATUS_ACTIVE,
  BUSINESS_STATUS_DRAFT,
  BUSINESS_STATUS_PENDING,
  BUSINESS_STATUS_SUSPENDED,
  buildBusinessSummarySelect,
  getPublicBusinessDetails,
  isBusinessOpenNow,
  listPublicCafeDiscovery,
  getUserBusinessReviewState,
  listAccessibleBusinessesForAdmin,
  listPublicBusinesses,
  listPublicBusinessReviews,
  normalizeBusinessId,
  normalizeBusinessListingStatus,
  normalizeBusinessMembershipStatus,
  normalizeBusinessReviewRating,
  normalizeBusinessReviewText,
  normalizeBusinessReviewTitle,
  normalizeBusinessRole,
  normalizeBusinessStatus,
  publicProfileRequirements,
  serializeBusiness,
  serializeBusinessReview,
  serializeBusinessMembership,
  slugifyBusinessName,
  upsertUserBusinessReview,
};
