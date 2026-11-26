const ORDER_STATUS_TO_STORAGE = Object.freeze({
  accepted: "active",
  active: "active",
  preparing: "preparing",
  ready: "completed",
  completed: "completed",
  delivered: "delivered",
});

const ORDER_STATUS_TO_PUBLIC = Object.freeze({
  active: "accepted",
  accepted: "accepted",
  preparing: "preparing",
  completed: "ready",
  ready: "ready",
  delivered: "delivered",
  closed: "closed",
});

const NEXT_ORDER_STATUS = Object.freeze({
  active: "preparing",
  preparing: "completed",
  completed: "delivered",
});

const ORDER_STATUS_TIMESTAMPS = Object.freeze({
  preparing: "preparing_at",
  completed: "ready_at",
  delivered: "delivered_at",
});

function normalizeOrderStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toStorageOrderStatus(value) {
  return ORDER_STATUS_TO_STORAGE[normalizeOrderStatus(value)] || "";
}

function toPublicOrderStatus(value) {
  const normalized = normalizeOrderStatus(value);
  return ORDER_STATUS_TO_PUBLIC[normalized] || normalized || "accepted";
}

function isNextOrderStatus(currentStatus, nextStatus) {
  return NEXT_ORDER_STATUS[normalizeOrderStatus(currentStatus)] ===
    normalizeOrderStatus(nextStatus);
}

function normalizeEtaMinutes(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const etaMinutes = Number(value);
  return Number.isInteger(etaMinutes) && etaMinutes >= 1 && etaMinutes <= 240
    ? etaMinutes
    : NaN;
}

module.exports = {
  NEXT_ORDER_STATUS,
  ORDER_STATUS_TIMESTAMPS,
  isNextOrderStatus,
  normalizeEtaMinutes,
  normalizeOrderStatus,
  toPublicOrderStatus,
  toStorageOrderStatus,
};
