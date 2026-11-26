const { randomBytes } = require("node:crypto");

const { createCustomerNotification } = require("./customerNotifications");

const REFERRAL_REWARD_POINTS = 150;
const BIRTHDAY_REWARD_POINTS = 100;
const BADGES = Object.freeze([
  {
    code: "first_visit",
    name: "First Session",
    description: "Complete your first paid café session.",
    visits: 1,
    points: 25,
  },
  {
    code: "five_visit_days",
    name: "Regular Player",
    description: "Visit on five different days.",
    visits: 5,
    points: 50,
  },
  {
    code: "ten_visit_days",
    name: "Local Legend",
    description: "Visit on ten different days.",
    visits: 10,
    points: 100,
  },
  {
    code: "three_day_streak",
    name: "Three-Day Streak",
    description: "Visit on three consecutive days.",
    streak: 3,
    points: 50,
  },
  {
    code: "seven_day_streak",
    name: "Weeklong Streak",
    description: "Visit on seven consecutive days.",
    streak: 7,
    points: 150,
  },
]);

function getIndiaDateKey(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateKey(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function shiftDateKey(value, amount) {
  const day = normalizeDateKey(value);
  if (!day) return "";
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

function getMonthPeriod(dateValue = getIndiaDateKey()) {
  const dateKey = normalizeDateKey(dateValue);
  if (!dateKey) throw new Error("A valid date is required.");
  const [year, month] = dateKey.split("-").map(Number);
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return {
    challengeKey: `monthly:${year}-${String(month).padStart(2, "0")}`,
    periodStart,
    periodEnd,
  };
}

function getMembershipTier(points) {
  const balance = Math.max(0, Math.floor(Number(points || 0)));
  if (balance >= 5000) return "Legend";
  if (balance >= 2000) return "Pro";
  if (balance >= 500) return "Regular";
  return "Starter";
}

function buildMonthlyChallenge(points, period = getMonthPeriod()) {
  const balance = Math.max(0, Math.floor(Number(points || 0)));
  const challengeByTier = [
    { max: 499, tier: "Starter", target: 2, reward: 40 },
    { max: 1999, tier: "Regular", target: 3, reward: 75 },
    { max: 4999, tier: "Pro", target: 4, reward: 120 },
    { max: Infinity, tier: "Legend", target: 5, reward: 180 },
  ];
  const tier = challengeByTier.find((entry) => balance <= entry.max);
  return {
    challenge_key: period.challengeKey,
    title: `${tier.tier} monthly challenge`,
    description: `Visit a café on ${tier.target} different days this month to earn ${tier.reward} bonus points.`,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    target_visits: tier.target,
    reward_points: tier.reward,
  };
}

function countStreakEndingAt(visitDates, endingDate) {
  const days = new Set(visitDates.map(normalizeDateKey).filter(Boolean));
  let cursor = normalizeDateKey(endingDate);
  let streak = 0;
  while (cursor && days.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function summarizeVisitStreaks(visitDates, today = getIndiaDateKey()) {
  const sortedDays = [...new Set(visitDates.map(normalizeDateKey).filter(Boolean))].sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let previousDay = "";

  for (const day of sortedDays) {
    runningStreak = previousDay && shiftDateKey(previousDay, 1) === day
      ? runningStreak + 1
      : 1;
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDay = day;
  }

  const latestDay = sortedDays.at(-1) || "";
  const isCurrent = latestDay === today || latestDay === shiftDateKey(today, -1);
  return {
    current: isCurrent ? countStreakEndingAt(sortedDays, latestDay) : 0,
    best: bestStreak,
    last_visit_date: latestDay || null,
  };
}

function normalizeDateOfBirth(value) {
  const dateKey = normalizeDateKey(value);
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey
    ? dateKey
    : "";
}

function isValidDateOfBirth(value, today = getIndiaDateKey()) {
  const dateOfBirth = normalizeDateOfBirth(value);
  if (!dateOfBirth) return false;
  const currentDay = normalizeDateKey(today);
  if (!currentDay) return false;
  const [todayYear, todayMonth, todayDate] = currentDay.split("-").map(Number);
  const [birthYear, birthMonth, birthDate] = dateOfBirth.split("-").map(Number);
  let age = todayYear - birthYear;
  if (
    birthMonth > todayMonth ||
    (birthMonth === todayMonth && birthDate > todayDate)
  ) {
    age -= 1;
  }
  return age >= 13 && age <= 120;
}

function isBirthdayOnDate(dateOfBirth, dateValue = getIndiaDateKey()) {
  const birthDate = normalizeDateOfBirth(dateOfBirth);
  const today = normalizeDateKey(dateValue);
  if (!birthDate || !today) return false;
  return birthDate.slice(5) === today.slice(5);
}

function normalizeReferralCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]/g, "");
}

function createLoyaltyError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function ensureReferralCode(connection, userId, currentCode = null) {
  if (currentCode) return String(currentCode).toUpperCase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = `GG${randomBytes(4).toString("hex").toUpperCase()}`;
    try {
      const [result] = await connection.query(
        `UPDATE users SET referral_code = ? WHERE uid = ? AND referral_code IS NULL`,
        [referralCode, userId]
      );
      if (Number(result?.affectedRows || 0) > 0) return referralCode;
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
    }

    const [rows] = await connection.query(
      "SELECT referral_code FROM users WHERE uid = ? LIMIT 1",
      [userId]
    );
    if (rows[0]?.referral_code) return String(rows[0].referral_code).toUpperCase();
  }

  throw new Error("Unable to create a referral code. Please try again.");
}

async function grantLoyaltyReward(connection, {
  userId,
  rewardKey,
  rewardType,
  points,
  note,
  sourceUserId = null,
}) {
  const normalizedPoints = Math.floor(Number(points || 0));
  const normalizedNote = String(note || "Reward points earned.").trim().slice(0, 255);
  const normalizedKey = String(rewardKey || "").trim().slice(0, 120);
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId || !normalizedKey || normalizedPoints <= 0) return false;

  const [grantResult] = await connection.query(
    `
      INSERT IGNORE INTO loyalty_reward_grants (
        user_id, reward_key, reward_type, points, note, source_user_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [normalizedUserId, normalizedKey, String(rewardType || "bonus").slice(0, 32), normalizedPoints, normalizedNote, sourceUserId]
  );
  if (Number(grantResult?.affectedRows || 0) === 0) return false;

  await connection.query(
    "UPDATE users SET loyalty_points = loyalty_points + ? WHERE uid = ?",
    [normalizedPoints, normalizedUserId]
  );
  await connection.query(
    `
      INSERT INTO loyalty_transactions (
        user_id, booking_id, points, transaction_type, note
      ) VALUES (?, NULL, ?, 'bonus', ?)
    `,
    [normalizedUserId, normalizedPoints, normalizedNote]
  );
  await createCustomerNotification(connection, {
    userId: normalizedUserId,
    category: "payments",
    eventType: "loyalty_reward",
    title: "You earned loyalty points",
    message: `${normalizedNote} +${normalizedPoints} points.`,
    deepLink: "/profile",
    entityType: "account",
    entityId: String(normalizedUserId),
    idempotencyKey: `loyalty:${normalizedUserId}:${normalizedKey}`,
  });
  return true;
}

async function awardBadge(connection, userId, badge) {
  const [result] = await connection.query(
    `
      INSERT IGNORE INTO loyalty_user_badges (
        user_id, badge_code, badge_name, description, reward_points
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [userId, badge.code, badge.name, badge.description, badge.points]
  );
  if (Number(result?.affectedRows || 0) === 0) return false;

  await grantLoyaltyReward(connection, {
    userId,
    rewardKey: `badge:${badge.code}`,
    rewardType: "badge",
    points: badge.points,
    note: `${badge.name} badge earned.`,
  });
  return true;
}

async function ensureMonthlyChallenge(connection, { userId, today, balance }) {
  const period = getMonthPeriod(today);
  const [existing] = await connection.query(
    `SELECT * FROM loyalty_challenges WHERE user_id = ? AND challenge_key = ? LIMIT 1`,
    [userId, period.challengeKey]
  );
  if (existing[0]) return existing[0];

  const challenge = buildMonthlyChallenge(balance, period);
  await connection.query(
    `
      INSERT IGNORE INTO loyalty_challenges (
        user_id, challenge_key, title, description, period_start, period_end,
        target_visits, reward_points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      challenge.challenge_key,
      challenge.title,
      challenge.description,
      challenge.period_start,
      challenge.period_end,
      challenge.target_visits,
      challenge.reward_points,
    ]
  );
  const [rows] = await connection.query(
    `SELECT * FROM loyalty_challenges WHERE user_id = ? AND challenge_key = ? LIMIT 1`,
    [userId, period.challengeKey]
  );
  return rows[0] || null;
}

async function completeChallengeIfEarned(connection, { userId, challenge, progress }) {
  if (!challenge || Number(progress || 0) < Number(challenge.target_visits || 0)) return false;
  if (challenge.completed_at) return false;

  const [result] = await connection.query(
    `
      UPDATE loyalty_challenges SET completed_at = NOW()
      WHERE challenge_id = ? AND completed_at IS NULL
    `,
    [challenge.challenge_id]
  );
  if (Number(result?.affectedRows || 0) === 0) return false;

  await grantLoyaltyReward(connection, {
    userId,
    rewardKey: `challenge:${challenge.challenge_key}`,
    rewardType: "challenge",
    points: challenge.reward_points,
    note: `${challenge.title} completed.`,
  });
  return true;
}

async function awardReferralIfEligible(connection, { userId, bookingId }) {
  const [referrals] = await connection.query(
    `
      SELECT referral_id, referrer_user_id
      FROM loyalty_referrals
      WHERE referred_user_id = ? AND status = 'pending'
      LIMIT 1 FOR UPDATE
    `,
    [userId]
  );
  const referral = referrals[0];
  if (!referral) return false;

  const [priorVisits] = await connection.query(
    `
      SELECT COUNT(*) AS visit_count
      FROM bills
      WHERE user_id = ? AND booking_id <> ?
      AND COALESCE(subtotal, 0) + COALESCE(loyalty_used, 0) > 0
    `,
    [userId, bookingId]
  );
  if (Number(priorVisits[0]?.visit_count || 0) > 0) return false;

  const referralId = Number(referral.referral_id);
  const referrerUserId = Number(referral.referrer_user_id);
  await grantLoyaltyReward(connection, {
    userId,
    rewardKey: `referral:${referralId}:invitee`,
    rewardType: "referral",
    points: REFERRAL_REWARD_POINTS,
    note: "Your first paid café visit through a referral.",
    sourceUserId: referrerUserId,
  });
  await grantLoyaltyReward(connection, {
    userId: referrerUserId,
    rewardKey: `referral:${referralId}:referrer`,
    rewardType: "referral",
    points: REFERRAL_REWARD_POINTS,
    note: "Your friend completed their first paid café visit.",
    sourceUserId: userId,
  });
  await connection.query(
    `UPDATE loyalty_referrals SET status = 'rewarded', rewarded_at = NOW() WHERE referral_id = ? AND status = 'pending'`,
    [referralId]
  );
  return true;
}

async function awardSettledVisit(connection, {
  userId,
  bookingId,
  visitDate,
  eligibleAmount,
}) {
  const normalizedUserId = Number(userId || 0);
  const normalizedBookingId = Number(bookingId || 0);
  const visitDay = normalizeDateKey(visitDate);
  if (
    !normalizedUserId ||
    !normalizedBookingId ||
    !visitDay ||
    Number(eligibleAmount || 0) <= 0
  ) {
    return { visitDays: 0, streak: 0, referralRewarded: false };
  }

  await connection.query(
    `INSERT IGNORE INTO loyalty_visit_days (user_id, visit_date, booking_id) VALUES (?, ?, ?)`,
    [normalizedUserId, visitDay, normalizedBookingId]
  );
  const [visitCounts] = await connection.query(
    `SELECT COUNT(*) AS visit_count FROM loyalty_visit_days WHERE user_id = ?`,
    [normalizedUserId]
  );
  const visitDays = Number(visitCounts[0]?.visit_count || 0);

  for (const badge of BADGES) {
    if (badge.visits && visitDays >= badge.visits) {
      await awardBadge(connection, normalizedUserId, badge);
    }
  }

  const [recentVisitRows] = await connection.query(
    `
      SELECT DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date
      FROM loyalty_visit_days
      WHERE user_id = ? AND visit_date <= ?
      ORDER BY visit_date DESC
      LIMIT 8
    `,
    [normalizedUserId, visitDay]
  );
  const visitDates = recentVisitRows.map((row) => normalizeDateKey(row.visit_date));
  const streak = countStreakEndingAt(visitDates, visitDay);
  for (const badge of BADGES) {
    if (badge.streak && streak >= badge.streak) {
      await awardBadge(connection, normalizedUserId, badge);
    }
  }

  const today = getIndiaDateKey();
  const currentPeriod = getMonthPeriod(today);
  if (visitDay >= currentPeriod.periodStart && visitDay <= currentPeriod.periodEnd) {
    const [userRows] = await connection.query(
      `SELECT loyalty_points FROM users WHERE uid = ? LIMIT 1`,
      [normalizedUserId]
    );
    const challenge = await ensureMonthlyChallenge(connection, {
      userId: normalizedUserId,
      today,
      balance: Number(userRows[0]?.loyalty_points || 0),
    });
    const [challengeVisits] = await connection.query(
      `
        SELECT COUNT(*) AS visit_count FROM loyalty_visit_days
        WHERE user_id = ? AND visit_date BETWEEN ? AND ?
      `,
      [normalizedUserId, currentPeriod.periodStart, currentPeriod.periodEnd]
    );
    await completeChallengeIfEarned(connection, {
      userId: normalizedUserId,
      challenge,
      progress: Number(challengeVisits[0]?.visit_count || 0),
    });
  }

  const referralRewarded = await awardReferralIfEligible(connection, {
    userId: normalizedUserId,
    bookingId: normalizedBookingId,
  });
  return { visitDays, streak, referralRewarded };
}

async function createReferralClaim(connection, { userId, referralCode }) {
  const normalizedUserId = Number(userId || 0);
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedUserId || !/^GG[A-F0-9]{8}$/.test(normalizedCode)) {
    throw createLoyaltyError("Enter a valid GameGrub referral code.", 400);
  }

  const [userRows] = await connection.query(
    `SELECT uid FROM users WHERE uid = ? LIMIT 1 FOR UPDATE`,
    [normalizedUserId]
  );
  if (!userRows[0]) throw createLoyaltyError("User not found.", 404);

  const [referrerRows] = await connection.query(
    `SELECT uid FROM users WHERE referral_code = ? LIMIT 1 FOR UPDATE`,
    [normalizedCode]
  );
  const referrerUserId = Number(referrerRows[0]?.uid || 0);
  if (!referrerUserId) throw createLoyaltyError("That referral code was not found.", 404);
  if (referrerUserId === normalizedUserId) {
    throw createLoyaltyError("You cannot use your own referral code.", 400);
  }

  const [existingReferrals] = await connection.query(
    `SELECT referral_id FROM loyalty_referrals WHERE referred_user_id = ? LIMIT 1`,
    [normalizedUserId]
  );
  if (existingReferrals.length) {
    throw createLoyaltyError("A referral code has already been applied to this account.", 409);
  }

  const [priorVisits] = await connection.query(
    `
      SELECT COUNT(*) AS visit_count FROM bills
      WHERE user_id = ?
      AND COALESCE(subtotal, 0) + COALESCE(loyalty_used, 0) > 0
    `,
    [normalizedUserId]
  );
  if (Number(priorVisits[0]?.visit_count || 0) > 0) {
    throw createLoyaltyError("Referral codes must be applied before your first paid café visit.", 409);
  }

  await connection.query(
    `
      INSERT INTO loyalty_referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (?, ?, ?)
    `,
    [referrerUserId, normalizedUserId, normalizedCode]
  );
  return {
    referrerUserId,
    referredUserId: normalizedUserId,
    referralCode: normalizedCode,
    rewardPoints: REFERRAL_REWARD_POINTS,
  };
}

async function buildLoyaltySummary(connection, userId) {
  const [userRows] = await connection.query(
    `
      SELECT uid, name, loyalty_points, referral_code,
        DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth
      FROM users WHERE uid = ? LIMIT 1 FOR UPDATE
    `,
    [userId]
  );
  const user = userRows[0];
  if (!user) throw createLoyaltyError("User not found.", 404);

  const referralCode = await ensureReferralCode(
    connection,
    Number(user.uid),
    user.referral_code
  );
  const today = getIndiaDateKey();
  const birthdayToday = isBirthdayOnDate(user.date_of_birth, today);
  if (birthdayToday) {
    await grantLoyaltyReward(connection, {
      userId: Number(user.uid),
      rewardKey: `birthday:${today.slice(0, 4)}`,
      rewardType: "birthday",
      points: BIRTHDAY_REWARD_POINTS,
      note: `Annual birthday reward for ${today.slice(0, 4)}.`,
    });
  }

  const balanceBeforeChallenge = Number(user.loyalty_points || 0) +
    (birthdayToday ? BIRTHDAY_REWARD_POINTS : 0);
  const period = getMonthPeriod(today);
  const challenge = await ensureMonthlyChallenge(connection, {
    userId: Number(user.uid),
    today,
    balance: balanceBeforeChallenge,
  });
  const [challengeVisitRows] = await connection.query(
    `
      SELECT COUNT(*) AS visit_count FROM loyalty_visit_days
      WHERE user_id = ? AND visit_date BETWEEN ? AND ?
    `,
    [user.uid, period.periodStart, period.periodEnd]
  );
  const challengeProgress = Number(challengeVisitRows[0]?.visit_count || 0);
  await completeChallengeIfEarned(connection, {
    userId: Number(user.uid),
    challenge,
    progress: challengeProgress,
  });

  const [freshUserRows] = await connection.query(
    `SELECT loyalty_points FROM users WHERE uid = ? LIMIT 1`,
    [user.uid]
  );
  const [visitRows] = await connection.query(
    `
      SELECT DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date
      FROM loyalty_visit_days WHERE user_id = ?
      ORDER BY visit_date DESC LIMIT 5000
    `,
    [user.uid]
  );
  const streaks = summarizeVisitStreaks(
    visitRows.map((row) => row.visit_date),
    today
  );
  const [historyRows] = await connection.query(
    `
      SELECT id, booking_id, points, transaction_type, note, created_at
      FROM loyalty_transactions WHERE user_id = ?
      ORDER BY id DESC LIMIT 40
    `,
    [user.uid]
  );
  const [badgeRows] = await connection.query(
    `
      SELECT badge_code, badge_name, description, reward_points, awarded_at
      FROM loyalty_user_badges WHERE user_id = ?
      ORDER BY awarded_at DESC, badge_id DESC
    `,
    [user.uid]
  );
  const [referralRows] = await connection.query(
    `
      SELECT COUNT(*) AS referral_count,
        SUM(status = 'rewarded') AS rewarded_count
      FROM loyalty_referrals WHERE referrer_user_id = ?
    `,
    [user.uid]
  );

  return {
    balance: Number(freshUserRows[0]?.loyalty_points || 0),
    tier: getMembershipTier(Number(freshUserRows[0]?.loyalty_points || 0)),
    date_of_birth: user.date_of_birth || null,
    referral: {
      code: referralCode,
      referral_count: Number(referralRows[0]?.referral_count || 0),
      rewarded_count: Number(referralRows[0]?.rewarded_count || 0),
      reward_points_per_person: REFERRAL_REWARD_POINTS,
      rule: "You and your friend each earn 150 points after their first paid café visit.",
    },
    streak: streaks,
    challenge: challenge
      ? {
          challenge_key: challenge.challenge_key,
          title: challenge.title,
          description: challenge.description,
          period_start: normalizeDateKey(challenge.period_start),
          period_end: normalizeDateKey(challenge.period_end),
          target_visits: Number(challenge.target_visits || 0),
          progress: Math.min(challengeProgress, Number(challenge.target_visits || 0)),
          reward_points: Number(challenge.reward_points || 0),
          completed:
            Boolean(challenge.completed_at) ||
            challengeProgress >= Number(challenge.target_visits || 0),
        }
      : null,
    birthday_offer: {
      birthday_today: birthdayToday,
      reward_points: BIRTHDAY_REWARD_POINTS,
      credited: birthdayToday,
      rule: user.date_of_birth
        ? "Your annual birthday reward is credited once on your birthday."
        : "Add your birthday to your profile to receive the annual reward.",
    },
    badges: badgeRows.map((row) => ({
      code: String(row.badge_code),
      name: String(row.badge_name),
      description: String(row.description),
      reward_points: Number(row.reward_points || 0),
      awarded_at: row.awarded_at || null,
    })),
    history: historyRows.map((row) => ({
      id: Number(row.id || 0),
      booking_id: row.booking_id == null ? null : Number(row.booking_id),
      points: Number(row.points || 0),
      transaction_type: String(row.transaction_type || "adjusted"),
      note: String(row.note || "Loyalty account update."),
      created_at: row.created_at || null,
    })),
    rules: {
      earning: "Earn 5% of the eligible session amount in points after settlement.",
      redemption: "1 point equals ₹1 and can cover the service subtotal; fees may remain due.",
      expiration: "Points do not expire automatically. Refunds and corrections appear in history.",
    },
  };
}

module.exports = {
  BADGES,
  BIRTHDAY_REWARD_POINTS,
  REFERRAL_REWARD_POINTS,
  awardSettledVisit,
  buildLoyaltySummary,
  buildMonthlyChallenge,
  countStreakEndingAt,
  createReferralClaim,
  ensureReferralCode,
  getIndiaDateKey,
  getMembershipTier,
  getMonthPeriod,
  grantLoyaltyReward,
  isBirthdayOnDate,
  isValidDateOfBirth,
  normalizeDateKey,
  normalizeDateOfBirth,
  normalizeReferralCode,
  shiftDateKey,
  summarizeVisitStreaks,
};
