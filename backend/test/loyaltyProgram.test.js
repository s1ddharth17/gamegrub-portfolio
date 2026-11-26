const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMonthlyChallenge,
  createReferralClaim,
  getIndiaDateKey,
  getMembershipTier,
  getMonthPeriod,
  grantLoyaltyReward,
  isBirthdayOnDate,
  isValidDateOfBirth,
  normalizeDateOfBirth,
  summarizeVisitStreaks,
} = require("../utils/loyaltyProgram");

test("membership tiers personalize monthly visit challenges", () => {
  const period = getMonthPeriod("2026-10-25");
  assert.equal(getMembershipTier(499), "Starter");
  assert.equal(getMembershipTier(500), "Regular");
  assert.equal(getMembershipTier(2000), "Pro");
  assert.equal(getMembershipTier(5000), "Legend");
  assert.deepEqual(
    [0, 500, 2000, 5000].map((points) => {
      const challenge = buildMonthlyChallenge(points, period);
      return [challenge.target_visits, challenge.reward_points];
    }),
    [[2, 40], [3, 75], [4, 120], [5, 180]],
  );
  assert.equal(period.challengeKey, "monthly:2026-10");
  assert.equal(period.periodEnd, "2026-10-31");
});

test("India date keys, birthday checks, and date-of-birth validation are calendar-safe", () => {
  assert.equal(getIndiaDateKey(new Date("2026-10-25T18:30:00.000Z")), "2026-10-26");
  assert.equal(normalizeDateOfBirth("2013-02-29"), "");
  assert.equal(isValidDateOfBirth("2013-10-25", "2026-10-25"), true);
  assert.equal(isValidDateOfBirth("2013-10-26", "2026-10-25"), false);
  assert.equal(isValidDateOfBirth("1906-10-25", "2026-10-25"), true);
  assert.equal(isValidDateOfBirth("1905-10-25", "2026-10-25"), false);
  assert.equal(isValidDateOfBirth("2027-01-01", "2026-10-25"), false);
  assert.equal(isBirthdayOnDate("2000-10-25", "2026-10-25"), true);
  assert.equal(isBirthdayOnDate("2000-10-24", "2026-10-25"), false);
});

test("streak summaries count distinct consecutive days and allow yesterday to remain current", () => {
  assert.deepEqual(
    summarizeVisitStreaks(
      ["2026-10-20", "2026-10-21", "2026-10-23", "2026-10-24"],
      "2026-10-25",
    ),
    { current: 2, best: 2, last_visit_date: "2026-10-24" },
  );
  assert.deepEqual(
    summarizeVisitStreaks(["2026-10-20", "2026-10-21"], "2026-10-25"),
    { current: 0, best: 2, last_visit_date: "2026-10-21" },
  );
});

test("reward grant keys prevent duplicate balance, ledger, and notification writes", async () => {
  const grants = new Set();
  const calls = [];
  let balanceDelta = 0;
  let ledgerWrites = 0;
  let notificationWrites = 0;
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/INSERT IGNORE INTO loyalty_reward_grants/.test(sql)) {
        const key = `${params[0]}:${params[1]}`;
        if (grants.has(key)) return [{ affectedRows: 0 }];
        grants.add(key);
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE users SET loyalty_points = loyalty_points \+/.test(sql)) {
        balanceDelta += Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO loyalty_transactions/.test(sql)) {
        ledgerWrites += 1;
        return [{ insertId: ledgerWrites }];
      }
      if (/INSERT IGNORE INTO customer_notifications/.test(sql)) {
        notificationWrites += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected loyalty query: ${sql}`);
    },
  };

  assert.equal(await grantLoyaltyReward(connection, {
    userId: 42,
    rewardKey: "badge:first_visit",
    rewardType: "badge",
    points: 25,
    note: "First Session badge earned.",
  }), true);
  assert.equal(await grantLoyaltyReward(connection, {
    userId: 42,
    rewardKey: "badge:first_visit",
    rewardType: "badge",
    points: 25,
    note: "First Session badge earned.",
  }), false);

  assert.equal(balanceDelta, 25);
  assert.equal(ledgerWrites, 1);
  assert.equal(notificationWrites, 1);
  assert.equal(calls.filter(({ sql }) => /loyalty_reward_grants/.test(sql)).length, 2);
});

function referralConnection({ userId = 11, referrerId = 12, priorVisits = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT uid FROM users WHERE uid = \?/.test(sql)) {
        return [[{ uid: userId }]];
      }
      if (/SELECT uid FROM users WHERE referral_code = \?/.test(sql)) {
        return referrerId ? [[{ uid: referrerId }]] : [[]];
      }
      if (/FROM loyalty_referrals WHERE referred_user_id/.test(sql)) return [[]];
      if (/FROM bills/.test(sql) && /visit_count/.test(sql)) {
        return [[{ visit_count: priorVisits }]];
      }
      if (/INSERT INTO loyalty_referrals/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected referral query: ${sql}`);
    },
  };
}

test("referral claim validates code, blocks self-referrals and prior visits, then inserts one pending claim", async () => {
  const invalid = referralConnection();
  await assert.rejects(
    createReferralClaim(invalid, { userId: 11, referralCode: "bad-code" }),
    { statusCode: 400 },
  );
  assert.equal(invalid.calls.length, 0);

  await assert.rejects(
    createReferralClaim(referralConnection({ userId: 11, referrerId: 11 }), {
      userId: 11,
      referralCode: "GG1234ABCD",
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    createReferralClaim(referralConnection({ priorVisits: 1 }), {
      userId: 11,
      referralCode: "gg-1234-abcd",
    }),
    { statusCode: 409 },
  );

  const connection = referralConnection();
  const claim = await createReferralClaim(connection, {
    userId: 11,
    referralCode: " gg-1234-abcd ",
  });
  assert.deepEqual(claim, {
    referrerUserId: 12,
    referredUserId: 11,
    referralCode: "GG1234ABCD",
    rewardPoints: 150,
  });
  assert.equal(connection.calls.filter(({ sql }) => /INSERT INTO loyalty_referrals/.test(sql)).length, 1);
});

test("profile birthday updates use a database guard against concurrent rewrites", async (t) => {
  const db = require("../utils/db");
  const uploadStorage = require("../utils/uploadStorage");
  const tournamentCommunity = require("../utils/tournamentCommunity");
  const calls = [];
  t.mock.method(db, "query", async (sql, params = []) => {
    calls.push({ sql, params });
    if (/SELECT uid, email, mobile\s+FROM users/.test(sql)) return [];
    if (/DATE_FORMAT\(date_of_birth/.test(sql)) {
      return [{
        uid: 11,
        name: "Player One",
        email: "player@example.com",
        mobile: "9876543210",
        loyalty_points: 0,
        date_of_birth: null,
      }];
    }
    if (/UPDATE users SET/.test(sql)) return { affectedRows: 0 };
    throw new Error(`Unexpected profile query: ${sql}`);
  });
  t.mock.method(uploadStorage, "createUploadMiddleware", () => ({
    single: () => (_req, _res, callback) => { void callback(); },
  }));
  t.mock.method(tournamentCommunity, "attachTournamentProfilesToUsers", async (rows) => rows);

  const routePath = require.resolve("../routes/user");
  delete require.cache[routePath];
  t.after(() => delete require.cache[routePath]);
  const router = require("../routes/user");
  const route = router.stack.find((layer) => layer.route?.path === "/profile" && layer.route.methods?.put);
  assert.ok(route, "profile update route is registered");
  const handler = route.route.stack.at(-1).handle;
  let resolveResponse;
  const responseReady = new Promise((resolve) => { resolveResponse = resolve; });
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; resolveResponse(this); return this; },
  };

  handler({
    user: { id: 11 },
    body: {
      name: "Player One",
      email: "player@example.com",
      mobile: "9876543210",
      date_of_birth: "2000-04-12",
    },
  }, res);
  await responseReady;

  const update = calls.find(({ sql }) => /UPDATE users SET/.test(sql));
  assert.match(update.sql, /AND date_of_birth IS NULL/);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "A birthday can only be set once. Contact support if it needs correction.");
  assert.equal(calls.some(({ sql }) => /UPDATE users SET date_of_birth/.test(sql)), false);
});
