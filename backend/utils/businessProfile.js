function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function nullableText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function readArray(value, label, { maxItems = 20, maxLength = 160 } = {}) {
  let values = value;
  if (typeof values === "string") {
    const text = values.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      values = Array.isArray(parsed) ? parsed : text.split(/\r?\n/);
    } catch (_) {
      values = text.split(/\r?\n/);
    }
  }
  if (values == null) return [];
  if (!Array.isArray(values)) fail(`${label} must be a list of values.`);

  const normalized = values
    .map((item) => String(item ?? "").trim().slice(0, maxLength))
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  if (unique.length > maxItems) fail(`${label} can contain at most ${maxItems} items.`);
  return unique;
}

function validateGalleryImage(value) {
  if (value.startsWith("/uploads/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return value;
  } catch (_) {
    // Reject anything that is not an absolute web URL or a GameGrub upload path.
  }
  fail("Gallery images must use HTTPS or a /uploads path.");
}

function normalizeCoordinate(value, label, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    fail(`${label} must be between ${min} and ${max}.`);
  }
  return Math.round(number * 10000000) / 10000000;
}

function normalizeBusinessProfileFields(body = {}, current = {}) {
  const value = (key) => body[key] === undefined ? current[key] : body[key];
  const latitude = normalizeCoordinate(value("latitude"), "Latitude", -90, 90);
  const longitude = normalizeCoordinate(value("longitude"), "Longitude", -180, 180);
  if ((latitude == null) !== (longitude == null)) {
    fail("Latitude and longitude must be provided together.");
  }

  const phone = nullableText(value("phone"), 30);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!/^\+?[()\d.\-\s]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
      fail("Enter a valid cafe phone number with 7 to 15 digits.");
    }
  }

  return {
    phone,
    address_line2: nullableText(value("address_line2"), 180),
    postal_code: nullableText(value("postal_code"), 20),
    latitude,
    longitude,
    amenities: readArray(value("amenities"), "Amenities", { maxItems: 30, maxLength: 100 }),
    equipment_highlights: readArray(value("equipment_highlights"), "Equipment highlights", { maxItems: 30, maxLength: 120 }),
    gallery_images: readArray(value("gallery_images"), "Gallery images", { maxItems: 12, maxLength: 500 }).map(validateGalleryImage),
    parking_info: nullableText(value("parking_info"), 1000),
    accessibility_info: nullableText(value("accessibility_info"), 1500),
    policies: nullableText(value("policies"), 6000),
  };
}

function ensurePublicListingComplete(payload) {
  const missing = [];
  if (!String(payload.address_line1 || "").trim()) missing.push("street address");
  if (!String(payload.city || "").trim()) missing.push("city");
  if (!String(payload.state || "").trim()) missing.push("state");
  if (!String(payload.phone || "").trim() && !String(payload.contact_email || "").trim()) {
    missing.push("phone or contact email");
  }
  if (!payload.opens_at || !payload.closes_at) missing.push("opening and closing hours");
  if (missing.length) {
    fail(`Complete the public cafe profile before listing it: ${missing.join(", ")}.`);
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

module.exports = {
  ensurePublicListingComplete,
  normalizeBusinessProfileFields,
  parseJsonArray,
};
