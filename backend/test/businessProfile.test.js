const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ensurePublicListingComplete,
  normalizeBusinessProfileFields,
  parseJsonArray,
} = require("../utils/businessProfile");

test("business profile fields normalize amenities, equipment, gallery, and coordinates", () => {
  const profile = normalizeBusinessProfileFields({
    phone: "+91 98765 43210",
    latitude: "18.5204300",
    longitude: "73.8567400",
    amenities: "Air conditioning\nWi-Fi\nAir conditioning",
    equipment_highlights: ["240 Hz monitors", "Mechanical keyboards"],
    gallery_images: ["https://cdn.example.com/cafe.jpg", "/uploads/cafe-interior.webp"],
    parking_info: "Two wheeler parking at the entrance.",
    accessibility_info: "Step-free entry and accessible restroom.",
    policies: "Outside food is not allowed.",
  });

  assert.equal(profile.phone, "+91 98765 43210");
  assert.equal(profile.latitude, 18.52043);
  assert.equal(profile.longitude, 73.85674);
  assert.deepEqual(profile.amenities, ["Air conditioning", "Wi-Fi"]);
  assert.deepEqual(profile.equipment_highlights, ["240 Hz monitors", "Mechanical keyboards"]);
  assert.deepEqual(profile.gallery_images, ["https://cdn.example.com/cafe.jpg", "/uploads/cafe-interior.webp"]);
  assert.equal(profile.parking_info, "Two wheeler parking at the entrance.");
  assert.equal(profile.accessibility_info, "Step-free entry and accessible restroom.");
  assert.equal(profile.policies, "Outside food is not allowed.");
});

test("business profile rejects invalid phone, coordinates, and gallery URLs", () => {
  assert.throws(() => normalizeBusinessProfileFields({ phone: "call me" }), /valid cafe phone number/);
  assert.throws(() => normalizeBusinessProfileFields({ latitude: 91, longitude: 10 }), /Latitude must be between/);
  assert.throws(() => normalizeBusinessProfileFields({ latitude: 10 }), /provided together/);
  assert.throws(() => normalizeBusinessProfileFields({ gallery_images: ["javascript:alert(1)"] }), /must use HTTPS/);
});

test("listed cafes require a full address, contact method, and operating hours", () => {
  assert.throws(() => ensurePublicListingComplete({}), /street address, city, state, phone or contact email, opening and closing hours/);
  assert.doesNotThrow(() => ensurePublicListingComplete({
    address_line1: "12 Arena Road",
    city: "Pune",
    state: "Maharashtra",
    phone: "+91 98765 43210",
    contact_email: null,
    opens_at: "09:00:00",
    closes_at: "23:00:00",
  }));
});

test("admin listing payloads enforce public contact and operating-hour fields", () => {
  const { normalizeBusinessPayload } = require("../routes/businessAdmin");
  assert.throws(() => normalizeBusinessPayload({
    name: "Pixel Cafe",
    status: "active",
    listing_status: "listed",
  }), /Complete the public cafe profile before listing it/);

  const payload = normalizeBusinessPayload({
    name: "Pixel Cafe",
    status: "active",
    listing_status: "listed",
    address_line1: "12 Arena Road",
    city: "Pune",
    state: "Maharashtra",
    phone: "+91 98765 43210",
    opens_at: "09:00",
    closes_at: "23:00",
    amenities: ["Wi-Fi"],
  });
  assert.equal(payload.opens_at, "09:00:00");
  assert.deepEqual(payload.amenities, ["Wi-Fi"]);
});

test("JSON profile arrays tolerate strings, buffers, and invalid values", () => {
  assert.deepEqual(parseJsonArray('["Wi-Fi", "Food"]'), ["Wi-Fi", "Food"]);
  assert.deepEqual(parseJsonArray(Buffer.from('["Parking"]')), ["Parking"]);
  assert.deepEqual(parseJsonArray("invalid"), []);
});
