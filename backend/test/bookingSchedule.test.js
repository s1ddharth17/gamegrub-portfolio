const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSlotDate,
  determineConfirmedBookingAction,
  shouldCancelNoShowBooking,
  shouldFinishRunningBooking,
} = require("../utils/bookingSchedule");

test("buildSlotDate builds a booking slot timestamp", () => {
  const slotDate = buildSlotDate("2026-04-13", 21);
  assert.equal(slotDate.getFullYear(), 2026);
  assert.equal(slotDate.getMonth(), 3);
  assert.equal(slotDate.getDate(), 13);
  assert.equal(slotDate.getHours(), 21);
  assert.equal(slotDate.getMinutes(), 0);
});

test("determineConfirmedBookingAction starts confirmed bookings at slot start", () => {
  const action = determineConfirmedBookingAction({
    bookingDate: "2026-04-13",
    startHour: 14,
    endHour: 16,
    referenceTime: new Date("2026-04-13T14:05:00"),
  });

  assert.equal(action, "start");
});

test("determineConfirmedBookingAction catch-up closes overdue confirmed bookings", () => {
  const action = determineConfirmedBookingAction({
    bookingDate: "2026-04-13",
    startHour: 14,
    endHour: 16,
    referenceTime: new Date("2026-04-13T16:00:00"),
  });

  assert.equal(action, "catch_up_close");
});

test("shouldFinishRunningBooking ends running bookings at scheduled end", () => {
  const shouldFinish = shouldFinishRunningBooking({
    bookingDate: "2026-04-13",
    endHour: 17,
    referenceTime: new Date("2026-04-13T17:00:00"),
  });

  assert.equal(shouldFinish, true);
});

test("shouldCancelNoShowBooking respects the grace period boundary", () => {
  assert.equal(
    shouldCancelNoShowBooking({
      startHour: 10,
      graceMinutes: 15,
      referenceTime: new Date("2026-04-13T10:15:00"),
    }),
    false
  );

  assert.equal(
    shouldCancelNoShowBooking({
      startHour: 10,
      graceMinutes: 15,
      referenceTime: new Date("2026-04-13T10:16:00"),
    }),
    true
  );
});

test("shouldCancelNoShowBooking evaluates the grace window in the cafe timezone", () => {
  assert.equal(
    shouldCancelNoShowBooking({
      bookingDate: "2026-10-25",
      startHour: 10,
      timezone: "Asia/Kolkata",
      graceMinutes: 15,
      referenceTime: new Date("2026-10-25T04:44:59.000Z"),
    }),
    false
  );
  assert.equal(
    shouldCancelNoShowBooking({
      bookingDate: "2026-10-25",
      startHour: 10,
      timezone: "Asia/Kolkata",
      graceMinutes: 15,
      referenceTime: new Date("2026-10-25T04:45:01.000Z"),
    }),
    true
  );
});
