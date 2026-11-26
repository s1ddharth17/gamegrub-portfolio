const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../utils/db");
const {
  HOLD_MINUTES,
  claimOffer,
  createOpeningsFromCancelledBooking,
  expireOffers,
  groupContiguousHours,
  isCompatible,
  markOfferClaimed,
  promoteOpening,
} = require("../utils/stationWaitlist");

test("station waitlist creates separate openings for future contiguous cancellation hours", async () => {
  const calls = [];
  let nextOpeningId = 50;
  const connection = {
    async beginTransaction() {},
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT b\.booking_id/.test(sql)) {
        return [[
          { booking_id: 700, business_id: 3, pc_id: 7, booking_date: "2099-06-15", hour: 10, timezone: "Asia/Kolkata" },
          { booking_id: 700, business_id: 3, pc_id: 7, booking_date: "2099-06-15", hour: 11, timezone: "Asia/Kolkata" },
          { booking_id: 700, business_id: 3, pc_id: 7, booking_date: "2099-06-15", hour: 13, timezone: "Asia/Kolkata" },
          { booking_id: 700, business_id: 3, pc_id: 7, booking_date: "2099-06-15", hour: 14, timezone: "Asia/Kolkata" },
        ]];
      }
      if (/INSERT IGNORE INTO station_waitlist_openings/.test(sql)) {
        return [{ affectedRows: 1, insertId: nextOpeningId++ }];
      }
      if (/SELECT opening_id, business_id, pc_id/.test(sql)) {
        const [openingId] = params;
        return [[{
          opening_id: openingId,
          business_id: 3,
          pc_id: 7,
          booking_date: "2099-06-15",
          start_hour: openingId === 50 ? 10 : 13,
          end_hour: openingId === 50 ? 12 : 15,
          status: "open",
        }]];
      }
      if (/SELECT category FROM pc/.test(sql)) return [[{ category: "esports_pc" }]];
      if (/FROM station_waitlist_entries e/.test(sql)) return [[]];
      if (/UPDATE station_waitlist_openings/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected opening query: ${sql}`);
    },
  };

  const openings = await createOpeningsFromCancelledBooking(connection, 700);
  assert.deepEqual(openings, [50, 51]);
  const inserts = calls.filter(({ sql }) => /INSERT IGNORE INTO station_waitlist_openings/.test(sql));
  assert.deepEqual(inserts.map(({ params }) => params.slice(4)), [[10, 12], [13, 15]]);
  assert.equal(calls.filter(({ sql }) => /UPDATE station_waitlist_openings SET status = 'closed'/.test(sql)).length, 2);
});

test("promotion chooses the oldest exact match and creates a ten-minute offer notification", async () => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT opening_id, business_id, pc_id/.test(sql)) {
        return [[{ opening_id: 9, business_id: 3, pc_id: 7, booking_date: "2099-06-15", start_hour: 12, end_hour: 14, status: "open" }]];
      }
      if (/SELECT category FROM pc/.test(sql)) return [[{ category: "esports_pc" }]];
      if (/FROM station_waitlist_entries e/.test(sql)) {
        assert.match(sql, /ORDER BY e\.created_at ASC, e\.waitlist_id ASC/);
        return [[{ waitlist_id: 101, user_id: 11 }]];
      }
      if (/INSERT INTO station_waitlist_offers/.test(sql)) return [{ insertId: 801 }];
      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) return [{ affectedRows: 1 }];
      if (/UPDATE station_waitlist_openings/.test(sql) || /UPDATE station_waitlist_entries/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected promotion query: ${sql}`);
    },
  };

  const result = await promoteOpening(connection, 9);
  assert.deepEqual(result, { offerId: 801, waitlistId: 101 });
  assert.equal(HOLD_MINUTES, 10);
  const notification = calls.find(({ sql }) => /INSERT IGNORE INTO customer_notifications/.test(sql));
  assert.equal(notification.params[1], "waitlist");
  assert.equal(notification.params[5], "/waitlist/offers/801");
  assert.equal(notification.params[8], "station-waitlist-offer:801");
});

test("station waitlist claim validates owner, station, and the exact offered window", async () => {
  const connection = {
    async query(sql, params = []) {
      if (/SELECT opening_id, waitlist_id FROM station_waitlist_offers/.test(sql)) return [[{ opening_id: 9, waitlist_id: 101 }]];
      if (/SELECT opening_id FROM station_waitlist_openings/.test(sql)) return [[]];
      if (/SELECT opening_id, pc_id/.test(sql)) {
        return [[{ opening_id: 9, pc_id: 7, booking_date: "2099-06-15", start_hour: 12, end_hour: 14, opening_status: "offered" }]];
      }
      if (/SELECT waitlist_id, user_id, status AS entry_status/.test(sql)) return [[{ waitlist_id: 101, user_id: 11, entry_status: "offered" }]];
      if (/SELECT offer_id, waitlist_id, opening_id/.test(sql)) {
        return [[{ offer_id: 801, opening_id: 9, waitlist_id: 101, offer_status: "offered", offer_live: 1 }]];
      }
      throw new Error(`Unexpected claim query: ${sql}`);
    },
  };
  const claim = await claimOffer(connection, {
    offerId: 801,
    userId: 11,
    pcId: 7,
    bookingDate: "2099-06-15",
    slots: [12, 13],
  });
  assert.deepEqual(claim, { offerId: 801, openingId: 9, waitlistId: 101 });

  await assert.rejects(
    claimOffer(connection, { offerId: 801, userId: 12, pcId: 7, bookingDate: "2099-06-15", slots: [12, 13] }),
    { statusCode: 403 }
  );
  await assert.rejects(
    claimOffer(connection, { offerId: 801, userId: 11, pcId: 7, bookingDate: "2099-06-15", slots: [12] }),
    { statusCode: 400 }
  );
});

test("waitlist compatibility requires the exact time and matching station preference", () => {
  const opening = {
    business_id: 3,
    pc_id: 7,
    category: "esports_pc",
    booking_date: "2099-06-15",
    start_hour: 12,
    end_hour: 14,
  };
  assert.equal(isCompatible({ ...opening, preferred_pc_id: null, preferred_category: "esports_pc" }, opening), true);
  assert.equal(isCompatible({ ...opening, preferred_pc_id: 8, preferred_category: null }, opening), false);
  assert.equal(isCompatible({ ...opening, preferred_pc_id: null, preferred_category: "console" }, opening), false);
  assert.equal(isCompatible({ ...opening, preferred_pc_id: null, preferred_category: null, end_hour: 15 }, opening), false);
  assert.deepEqual(groupContiguousHours([12, 10, 11, 14, 14]), [
    { start_hour: 10, end_hour: 13 },
    { start_hour: 14, end_hour: 15 },
  ]);
});

test("expired offers end the old request and promote the opening", async (t) => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT opening_id, waitlist_id FROM station_waitlist_offers/.test(sql)) return [[{ opening_id: 9, waitlist_id: 101 }]];
      if (/SELECT opening_id FROM station_waitlist_openings/.test(sql)) return [[]];
      if (/SELECT waitlist_id, user_id FROM station_waitlist_entries/.test(sql)) return [[{ waitlist_id: 101, user_id: 11 }]];
      if (/SELECT o\.offer_id, o\.waitlist_id, o\.opening_id/.test(sql)) return [[{ offer_id: 801, waitlist_id: 101, opening_id: 9 }]];
      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) return [{ affectedRows: 1 }];
      if (/SELECT opening_id, business_id, pc_id/.test(sql)) {
        return [[{ opening_id: 9, business_id: 3, pc_id: 7, booking_date: "2099-06-15", start_hour: 12, end_hour: 14, status: "open" }]];
      }
      if (/SELECT category FROM pc/.test(sql)) return [[{ category: "esports_pc" }]];
      if (/FROM station_waitlist_entries e/.test(sql)) return [[]];
      if (/UPDATE station_waitlist/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected expiry query: ${sql}`);
    },
  };
  t.mock.method(db, "query", async () => [{ offer_id: 801 }]);
  t.mock.method(db, "withTransaction", async (work) => work(connection));

  const result = await expireOffers();
  assert.deepEqual(result, { expired: 1, checked: 1 });
  assert.ok(calls.some(({ sql }) => /status = 'expired' WHERE waitlist_id/.test(sql)));
  assert.ok(calls.some(({ sql }) => /status = 'closed'/.test(sql)));
  assert.ok(calls.some(({ sql }) => /INSERT IGNORE INTO customer_notifications/.test(sql)));
});

test("claimed offers are recorded against one booking", async () => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  await markOfferClaimed(connection, { offerId: 801, openingId: 9, waitlistId: 101 }, 700);
  assert.match(calls[0].sql, /status = 'claimed'/);
  assert.deepEqual(calls[0].params, [700, 801]);
  assert.equal(calls.length, 3);
});
