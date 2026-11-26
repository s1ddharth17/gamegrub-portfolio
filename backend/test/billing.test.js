const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateBreakdown,
  getSessionClock,
  summarizeSlotUsage,
} = require("../utils/billing");

test("summarizeSlotUsage splits billable and future slots", () => {
  const usage = summarizeSlotUsage({
    bookingDate: "2026-04-13",
    slotHours: [9, 10, 11],
    referenceTime: new Date("2026-04-13T10:15:00"),
  });

  assert.deepEqual(usage.billableSlotHours, [9, 10]);
  assert.deepEqual(usage.futureSlotHours, [11]);
  assert.equal(usage.billableSlots, 2);
  assert.equal(usage.futureSlots, 1);
});

test("getSessionClock caps billing time to the booked window", () => {
  const sessionClock = getSessionClock({
    bookingDate: "2026-04-13",
    slotHours: [9, 10],
    startTime: "2026-04-13T09:00:00",
    fallbackEndTime: new Date("2026-04-13T12:00:00"),
  });

  assert.equal(sessionClock.minutes, 120);
  assert.equal(sessionClock.effectiveEndTime.getFullYear(), 2026);
  assert.equal(sessionClock.effectiveEndTime.getMonth(), 3);
  assert.equal(sessionClock.effectiveEndTime.getDate(), 13);
  assert.equal(sessionClock.effectiveEndTime.getHours(), 11);
  assert.equal(sessionClock.effectiveEndTime.getMinutes(), 0);
});

test("calculateBreakdown applies captured payments and loyalty before amount due", () => {
  const breakdown = calculateBreakdown({
    slotCount: 2,
    pricePerHour: 250,
    foodTotal: 145,
    loyaltyPoints: 100,
    capturedAmount: 200,
    useLoyalty: true,
  });

  assert.equal(breakdown.gamingCost, 500);
  assert.equal(breakdown.subtotal, 645);
  assert.equal(breakdown.openBalance, 445);
  assert.equal(breakdown.loyaltyUsed, 100);
  assert.equal(breakdown.finalAmount, 545);
  assert.equal(breakdown.amountDue, 345);
  assert.equal(breakdown.earnedLoyalty, 27);
});

test("calculateBreakdown carries booking loyalty into final session settlement", () => {
  const breakdown = calculateBreakdown({
    slotCount: 1,
    pricePerHour: 120,
    loyaltyPoints: 50,
    loyaltyApplied: 20,
    capturedAmount: 80,
    useLoyalty: true,
  });

  assert.equal(breakdown.capturedAmount, 80);
  assert.equal(breakdown.openBalance, 20);
  assert.equal(breakdown.loyaltyUsed, 20);
  assert.equal(breakdown.totalLoyaltyUsed, 40);
  assert.equal(breakdown.finalAmount, 80);
  assert.equal(breakdown.amountDue, 0);
});

test("calculateBreakdown honors manual overrides during settlement", () => {
  const breakdown = calculateBreakdown({
    slotCount: 3,
    pricePerHour: 250,
    foodTotal: 50,
    capturedAmount: 100,
    overrideAmount: 400,
    useLoyalty: false,
  });

  assert.equal(breakdown.subtotal, 400);
  assert.equal(breakdown.finalAmount, 400);
  assert.equal(breakdown.amountDue, 300);
});

test("calculateBreakdown keeps convenience fees outside loyalty while tracking commission", () => {
  const breakdown = calculateBreakdown({
    slotCount: 2,
    pricePerHour: 250,
    foodTotal: 100,
    loyaltyPoints: 150,
    capturedAmount: 200,
    useLoyalty: true,
    commissionRate: 10,
    convenienceFeeFlat: 20,
    convenienceFeeRate: 5,
  });

  assert.equal(breakdown.subtotal, 600);
  assert.equal(breakdown.convenienceFee, 50);
  assert.equal(breakdown.customerSubtotal, 650);
  assert.equal(breakdown.openBalance, 450);
  assert.equal(breakdown.loyaltyUsed, 150);
  assert.equal(breakdown.finalAmount, 450);
  assert.equal(breakdown.customerFinalAmount, 500);
  assert.equal(breakdown.amountDue, 300);
  assert.equal(breakdown.platformCommission, 45);
  assert.equal(breakdown.sellerNetAmount, 405);
});
