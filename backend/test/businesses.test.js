const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUSINESS_LISTING_STATUS_LISTED,
  BUSINESS_MEMBER_ROLE_MANAGER,
  BUSINESS_MEMBER_STATUS_ACTIVE,
  BUSINESS_REVIEW_MAX_RATING,
  BUSINESS_STATUS_ACTIVE,
  normalizeBusinessId,
  normalizeBusinessReviewRating,
  publicProfileRequirements,
  serializeBusiness,
  serializeBusinessReview,
  serializeBusinessMembership,
  slugifyBusinessName,
} = require("../utils/businesses");

test("slugifyBusinessName creates stable business slugs", () => {
  assert.equal(slugifyBusinessName("  GG Arena & Cafe  "), "gg-arena-cafe");
  assert.equal(slugifyBusinessName("###", "fallback-cafe"), "fallback-cafe");
});

test("normalizeBusinessId accepts positive integers only", () => {
  assert.equal(normalizeBusinessId("7"), 7);
  assert.equal(normalizeBusinessId("0", 1), 1);
  assert.equal(normalizeBusinessId("not-a-number", 5), 5);
});

test("serializeBusiness normalizes marketplace-facing business data", () => {
  const business = serializeBusiness({
    business_id: "3",
    slug: "night-shift-gaming",
    name: "Night Shift Gaming",
    status: "ACTIVE",
    listing_status: "listed",
    is_featured: 1,
    commission_rate: "12.5",
    convenience_fee_flat: "19.999",
    convenience_fee_rate: "3.5",
    average_rating: "4.247",
    review_count: "11",
    total_rigs: "18",
    active_rigs: "16",
    available_rigs: "9",
    menu_item_count: "24",
    featured_menu_item_count: "6",
    published_tournament_count: "2",
    amenities: '["Wi-Fi", "Air conditioning"]',
    equipment_highlights: Buffer.from('["240 Hz monitors"]'),
    gallery_images: '["https://cdn.example.com/cafe.jpg"]',
    latitude: "18.5204300",
    longitude: "73.8567400",
    parking_info: "Two wheeler parking at the entrance.",
  });

  assert.equal(business.business_id, 3);
  assert.equal(business.slug, "night-shift-gaming");
  assert.equal(business.status, BUSINESS_STATUS_ACTIVE);
  assert.equal(business.listing_status, BUSINESS_LISTING_STATUS_LISTED);
  assert.equal(business.is_featured, true);
  assert.equal(business.commission_rate, 12.5);
  assert.equal(business.convenience_fee_flat, 20);
  assert.equal(business.average_rating, 4.25);
  assert.equal(business.review_count, 11);
  assert.equal(business.available_rigs, 9);
  assert.equal(business.featured_menu_item_count, 6);
  assert.deepEqual(business.amenities, ["Wi-Fi", "Air conditioning"]);
  assert.deepEqual(business.equipment_highlights, ["240 Hz monitors"]);
  assert.deepEqual(business.gallery_images, ["https://cdn.example.com/cafe.jpg"]);
  assert.equal(business.latitude, 18.52043);
  assert.equal(business.longitude, 73.85674);
  assert.equal(business.parking_info, "Two wheeler parking at the entrance.");
});

test("public cafe query requirements include a complete address, contact, and hours", () => {
  const sql = publicProfileRequirements("cafe");
  assert.match(sql, /cafe\.address_line1/);
  assert.match(sql, /cafe\.city/);
  assert.match(sql, /cafe\.state/);
  assert.match(sql, /cafe\.phone/);
  assert.match(sql, /cafe\.contact_email/);
  assert.match(sql, /cafe\.opens_at IS NOT NULL/);
  assert.match(sql, /cafe\.closes_at IS NOT NULL/);
});

test("review helpers normalize ratings and ownership safely", () => {
  assert.equal(normalizeBusinessReviewRating("6", 3), 3);

  const review = serializeBusinessReview(
    {
      review_id: "14",
      business_id: "8",
      user_id: "42",
      bill_id: "103",
      rating: BUSINESS_REVIEW_MAX_RATING,
      review_title: "Great late-night setup",
      review_text: "The rigs were smooth and the snacks landed fast.",
      author_name: "ClutchAce",
      author_avatar: "/uploads/avatar.png",
    },
    { viewerUserId: 42 }
  );

  assert.equal(review.review_id, 14);
  assert.equal(review.business_id, 8);
  assert.equal(review.user_id, 42);
  assert.equal(review.bill_id, 103);
  assert.equal(review.rating, 5);
  assert.equal(review.author_name, "ClutchAce");
  assert.equal(review.is_mine, true);
});

test("serializeBusinessMembership falls back to safe membership defaults", () => {
  const membership = serializeBusinessMembership({
    business_id: 8,
    name: "Pixel Port",
    membership_role: "unknown-role",
    membership_status: null,
    is_platform_admin: 0,
  });

  assert.equal(membership.business_id, 8);
  assert.equal(membership.membership_role, BUSINESS_MEMBER_ROLE_MANAGER);
  assert.equal(membership.membership_status, BUSINESS_MEMBER_STATUS_ACTIVE);
  assert.equal(membership.is_platform_admin, false);
});
