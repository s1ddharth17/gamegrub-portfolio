const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isNextOrderStatus,
  normalizeEtaMinutes,
  toPublicOrderStatus,
  toStorageOrderStatus,
} = require("../utils/orderLifecycle");

test("order statuses preserve stored values while presenting the customer lifecycle", () => {
  assert.equal(toStorageOrderStatus("accepted"), "active");
  assert.equal(toStorageOrderStatus("ready"), "completed");
  assert.equal(toPublicOrderStatus("active"), "accepted");
  assert.equal(toPublicOrderStatus("completed"), "ready");
  assert.equal(toPublicOrderStatus("delivered"), "delivered");
});

test("food orders advance one authorized kitchen stage at a time", () => {
  assert.equal(isNextOrderStatus("active", "preparing"), true);
  assert.equal(isNextOrderStatus("preparing", "completed"), true);
  assert.equal(isNextOrderStatus("completed", "delivered"), true);
  assert.equal(isNextOrderStatus("active", "completed"), false);
  assert.equal(isNextOrderStatus("delivered", "preparing"), false);
});

test("kitchen preparation ETA is limited to 1 through 240 whole minutes", () => {
  assert.equal(normalizeEtaMinutes("25"), 25);
  assert.equal(normalizeEtaMinutes(1), 1);
  assert.equal(normalizeEtaMinutes(undefined), null);
  assert.ok(Number.isNaN(normalizeEtaMinutes(0)));
  assert.ok(Number.isNaN(normalizeEtaMinutes(240.5)));
  assert.ok(Number.isNaN(normalizeEtaMinutes(241)));
});
