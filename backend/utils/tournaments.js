const TOURNAMENT_STATUS_DRAFT = "draft";
const TOURNAMENT_STATUS_PUBLISHED = "published";
const TOURNAMENT_STATUS_CANCELLED = "cancelled";
const TOURNAMENT_STATUS_COMPLETED = "completed";

const TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS = "registrations";
const TOURNAMENT_OPERATIONS_STAGE_SEEDING = "seeding";
const TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS = "ready_for_brackets";

const TOURNAMENT_REGISTRATION_TYPE_SOLO = "solo";
const TOURNAMENT_REGISTRATION_TYPE_TEAM = "team";
const TOURNAMENT_REGISTRATION_STATUS_REGISTERED = "registered";
const TOURNAMENT_REGISTRATION_STATUS_WAITLISTED = "waitlisted";
const TOURNAMENT_REGISTRATION_STATUS_CANCELLED = "cancelled";
const TOURNAMENT_ATTENDANCE_STATUS_PENDING = "pending";
const TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN = "checked_in";
const TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW = "no_show";
const TOURNAMENT_MATCH_STATUS_PENDING = "pending";
const TOURNAMENT_MATCH_STATUS_COMPLETED = "completed";
const TOURNAMENT_MATCH_STATUS_WALKOVER = "walkover";

const TOURNAMENT_REGISTRATION_TYPES = new Set([
  TOURNAMENT_REGISTRATION_TYPE_SOLO,
  TOURNAMENT_REGISTRATION_TYPE_TEAM,
]);

const TOURNAMENT_REGISTRATION_STATUSES = new Set([
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
]);

const TOURNAMENT_ATTENDANCE_STATUSES = new Set([
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
]);

const TOURNAMENT_MATCH_STATUSES = new Set([
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_COMPLETED,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
]);

const TOURNAMENT_FORMAT_SOLO = "solo";
const TOURNAMENT_FORMAT_DUO = "duo";
const TOURNAMENT_FORMAT_SQUAD = "squad";
const TOURNAMENT_FORMAT_TEAM = "team";
const TOURNAMENT_REFUND_POLICY_NONE = "no_refunds";
const TOURNAMENT_REFUND_POLICY_FULL = "full_before_cutoff";
const TOURNAMENT_REFUND_POLICY_PARTIAL = "partial_before_cutoff";

const TOURNAMENT_STATUSES = new Set([
  TOURNAMENT_STATUS_DRAFT,
  TOURNAMENT_STATUS_PUBLISHED,
  TOURNAMENT_STATUS_CANCELLED,
  TOURNAMENT_STATUS_COMPLETED,
]);

const TOURNAMENT_OPERATIONS_STAGES = new Set([
  TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
  TOURNAMENT_OPERATIONS_STAGE_SEEDING,
  TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
]);

const TOURNAMENT_FORMATS = new Set([
  TOURNAMENT_FORMAT_SOLO,
  TOURNAMENT_FORMAT_DUO,
  TOURNAMENT_FORMAT_SQUAD,
  TOURNAMENT_FORMAT_TEAM,
]);

const TOURNAMENT_SKILL_LEVELS = new Set([
  "open",
  "beginner",
  "intermediate",
  "advanced",
]);

const TOURNAMENT_REFUND_POLICIES = new Set([
  TOURNAMENT_REFUND_POLICY_NONE,
  TOURNAMENT_REFUND_POLICY_FULL,
  TOURNAMENT_REFUND_POLICY_PARTIAL,
]);

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeTournamentStatus(value, fallback = TOURNAMENT_STATUS_DRAFT) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentFormat(value, fallback = TOURNAMENT_FORMAT_SOLO) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_FORMATS.has(normalized) ? normalized : fallback;
}

function normalizeTournamentSkillLevel(value, fallback = "open") {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_SKILL_LEVELS.has(normalized) ? normalized : fallback;
}

function normalizeTournamentOperationsStage(
  value,
  fallback = TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_OPERATIONS_STAGES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentRegistrationStatus(
  value,
  fallback = TOURNAMENT_REGISTRATION_STATUS_REGISTERED
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_REGISTRATION_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentRegistrationType(
  value,
  fallback = TOURNAMENT_REGISTRATION_TYPE_SOLO
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_REGISTRATION_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentAttendanceStatus(
  value,
  fallback = TOURNAMENT_ATTENDANCE_STATUS_PENDING
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_ATTENDANCE_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentMatchStatus(value, fallback = TOURNAMENT_MATCH_STATUS_PENDING) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_MATCH_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentRefundPolicy(
  value,
  fallback = TOURNAMENT_REFUND_POLICY_NONE
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_REFUND_POLICIES.has(normalized) ? normalized : fallback;
}

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function isInlineImageData(value) {
  return String(value || "").trim().toLowerCase().startsWith("data:image/");
}

function normalizeSlug(value) {
  const source = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const slug = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

  return slug || "tournament";
}

function slugifyTournamentTitle(title, fallback = "tournament") {
  const slug = normalizeSlug(title);
  return slug || normalizeSlug(fallback);
}

function normalizeCurrency(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed * 100) / 100);
}

function normalizePositiveInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeDateTime(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getDefaultTeamSize(format) {
  switch (normalizeTournamentFormat(format)) {
    case TOURNAMENT_FORMAT_DUO:
      return 2;
    case TOURNAMENT_FORMAT_SQUAD:
      return 4;
    case TOURNAMENT_FORMAT_TEAM:
      return 5;
    default:
      return 1;
  }
}

function parseTournamentInput(input = {}, { partial = false, current = null } = {}) {
  const data = {};
  const errors = [];

  const existing = current || {};
  const nextTitle = hasOwn(input, "title") ? normalizeText(input.title) : normalizeText(existing.title);
  const nextGameTitle = hasOwn(input, "game_title")
    ? normalizeText(input.game_title)
    : normalizeText(existing.game_title);
  const nextFormat = hasOwn(input, "format")
    ? normalizeTournamentFormat(input.format)
    : normalizeTournamentFormat(existing.format, TOURNAMENT_FORMAT_SOLO);
  const nextSkillLevel = hasOwn(input, "skill_level")
    ? normalizeTournamentSkillLevel(input.skill_level, "")
    : normalizeTournamentSkillLevel(existing.skill_level);
  const defaultTeamSize = getDefaultTeamSize(nextFormat);

  if (!partial || hasOwn(input, "title")) {
    if (!nextTitle) {
      errors.push("Tournament title is required.");
    } else {
      data.title = nextTitle.slice(0, 160);
    }
  }

  if (!partial || hasOwn(input, "game_title")) {
    if (!nextGameTitle) {
      errors.push("Game title is required.");
    } else {
      data.game_title = nextGameTitle.slice(0, 120);
    }
  }

  if (!partial || hasOwn(input, "skill_level")) {
    if (!nextSkillLevel) {
      errors.push("Choose a valid tournament skill level.");
    } else {
      data.skill_level = nextSkillLevel;
    }
  }

  if (!partial || hasOwn(input, "summary")) {
    data.summary = normalizeText(
      hasOwn(input, "summary") ? input.summary : existing.summary,
      ""
    ).slice(0, 500);
  }

  if (!partial || hasOwn(input, "description")) {
    data.description = normalizeText(
      hasOwn(input, "description") ? input.description : existing.description,
      ""
    ).slice(0, 6000);
  }

  if (!partial || hasOwn(input, "rules")) {
    data.rules = normalizeText(hasOwn(input, "rules") ? input.rules : existing.rules, "").slice(
      0,
      6000
    );
  }

  if (!partial || hasOwn(input, "location_label")) {
    data.location_label = normalizeText(
      hasOwn(input, "location_label") ? input.location_label : existing.location_label,
      "GameGrub Arena"
    ).slice(0, 160);
  }

  if (!partial || hasOwn(input, "cover_image")) {
    const nextCoverImage = normalizeText(
      hasOwn(input, "cover_image") ? input.cover_image : existing.cover_image,
      ""
    );

    if (hasOwn(input, "cover_image") && isInlineImageData(nextCoverImage)) {
      errors.push(
        "Tournament cover image must be an uploaded file path or a normal hosted URL. Inline data URLs are not supported."
      );
    } else {
      data.cover_image = nextCoverImage.slice(0, 512);
    }
  }

  if (!partial || hasOwn(input, "slug")) {
    data.slug = slugifyTournamentTitle(
      hasOwn(input, "slug") ? input.slug : existing.slug || nextTitle || "tournament"
    );
  }

  if (!partial || hasOwn(input, "format")) {
    data.format = nextFormat;
  }

  if (!partial || hasOwn(input, "team_size")) {
    const teamSize = normalizePositiveInteger(
      hasOwn(input, "team_size") ? input.team_size : existing.team_size,
      defaultTeamSize
    );

    if (teamSize < 1) {
      errors.push("Team size must be at least 1.");
    } else {
      data.team_size = teamSize;
    }
  }

  if (!partial || hasOwn(input, "max_participants")) {
    const maxParticipants = normalizePositiveInteger(
      hasOwn(input, "max_participants") ? input.max_participants : existing.max_participants,
      16
    );

    if (maxParticipants < 2) {
      errors.push("Max participants must be at least 2.");
    } else {
      data.max_participants = maxParticipants;
    }
  }

  if (!partial || hasOwn(input, "registered_count")) {
    data.registered_count = normalizePositiveInteger(
      hasOwn(input, "registered_count") ? input.registered_count : existing.registered_count,
      0
    );
  }

  if (!partial || hasOwn(input, "entry_fee")) {
    data.entry_fee = normalizeCurrency(
      hasOwn(input, "entry_fee") ? input.entry_fee : existing.entry_fee,
      0
    );
  }

  if (!partial || hasOwn(input, "prize_pool")) {
    data.prize_pool = normalizeCurrency(
      hasOwn(input, "prize_pool") ? input.prize_pool : existing.prize_pool,
      0
    );
  }

  const nextIsSponsored = hasOwn(input, "is_sponsored")
    ? normalizeBooleanFlag(input.is_sponsored, false)
    : normalizeBooleanFlag(existing.is_sponsored, false);

  if (!partial || hasOwn(input, "is_sponsored")) {
    data.is_sponsored = nextIsSponsored;
  }

  if (
    !partial ||
    hasOwn(input, "sponsor_name") ||
    hasOwn(input, "is_sponsored")
  ) {
    const sponsorName = nextIsSponsored
      ? normalizeText(
          hasOwn(input, "sponsor_name") ? input.sponsor_name : existing.sponsor_name,
          ""
        ).slice(0, 120)
      : "";

    if (nextIsSponsored && !sponsorName) {
      errors.push("Sponsor name is required for sponsored tournaments.");
    }

    data.sponsor_name = sponsorName;
  }

  if (
    !partial ||
    hasOwn(input, "sponsor_tagline") ||
    hasOwn(input, "is_sponsored")
  ) {
    data.sponsor_tagline = nextIsSponsored
      ? normalizeText(
          hasOwn(input, "sponsor_tagline")
            ? input.sponsor_tagline
            : existing.sponsor_tagline,
          ""
        ).slice(0, 220)
      : "";
  }

  if (
    !partial ||
    hasOwn(input, "sponsor_prize_contribution") ||
    hasOwn(input, "is_sponsored")
  ) {
    data.sponsor_prize_contribution = nextIsSponsored
      ? normalizeCurrency(
          hasOwn(input, "sponsor_prize_contribution")
            ? input.sponsor_prize_contribution
            : existing.sponsor_prize_contribution,
          0
        )
      : 0;
  }

  const nextIsPremium = hasOwn(input, "is_premium")
    ? normalizeBooleanFlag(input.is_premium, false)
    : normalizeBooleanFlag(existing.is_premium, false);

  if (!partial || hasOwn(input, "is_premium")) {
    data.is_premium = nextIsPremium;
  }

  if (
    !partial ||
    hasOwn(input, "premium_entry_fee") ||
    hasOwn(input, "is_premium")
  ) {
    const premiumEntryFee = nextIsPremium
      ? normalizeCurrency(
          hasOwn(input, "premium_entry_fee")
            ? input.premium_entry_fee
            : existing.premium_entry_fee,
          0
        )
      : 0;

    if (nextIsPremium && premiumEntryFee <= 0) {
      errors.push("Premium tournaments must include a premium entry fee.");
    }

    data.premium_entry_fee = premiumEntryFee;
  }

  if (
    !partial ||
    hasOwn(input, "premium_label") ||
    hasOwn(input, "is_premium")
  ) {
    data.premium_label = nextIsPremium
      ? normalizeText(
          hasOwn(input, "premium_label") ? input.premium_label : existing.premium_label,
          "Premium access"
        ).slice(0, 64)
      : "";
  }

  if (
    !partial ||
    hasOwn(input, "premium_perks") ||
    hasOwn(input, "is_premium")
  ) {
    data.premium_perks = nextIsPremium
      ? normalizeText(
          hasOwn(input, "premium_perks") ? input.premium_perks : existing.premium_perks,
          ""
        ).slice(0, 500)
      : "";
  }

  if (!partial || hasOwn(input, "refund_policy")) {
    data.refund_policy = normalizeTournamentRefundPolicy(
      hasOwn(input, "refund_policy") ? input.refund_policy : existing.refund_policy,
      TOURNAMENT_REFUND_POLICY_NONE
    );
  }

  if (!partial || hasOwn(input, "refund_cutoff_hours")) {
    data.refund_cutoff_hours = normalizePositiveInteger(
      hasOwn(input, "refund_cutoff_hours")
        ? input.refund_cutoff_hours
        : existing.refund_cutoff_hours,
      24
    );
  }

  if (!partial || hasOwn(input, "refund_percentage")) {
    const refundPercentage = normalizePositiveInteger(
      hasOwn(input, "refund_percentage")
        ? input.refund_percentage
        : existing.refund_percentage,
      100
    );

    if (refundPercentage > 100) {
      errors.push("Refund percentage cannot exceed 100.");
    } else {
      data.refund_percentage = refundPercentage;
    }
  }

  if (!partial || hasOwn(input, "status")) {
    data.status = normalizeTournamentStatus(
      hasOwn(input, "status") ? input.status : existing.status,
      TOURNAMENT_STATUS_DRAFT
    );
  }

  if (!partial || hasOwn(input, "is_featured")) {
    data.is_featured = normalizeBooleanFlag(
      hasOwn(input, "is_featured") ? input.is_featured : existing.is_featured,
      false
    );
  }

  if (!partial || hasOwn(input, "start_at")) {
    data.start_at = normalizeDateTime(hasOwn(input, "start_at") ? input.start_at : existing.start_at);
    if (!data.start_at) {
      errors.push("Tournament start time is required.");
    }
  }

  if (!partial || hasOwn(input, "end_at")) {
    data.end_at = normalizeDateTime(hasOwn(input, "end_at") ? input.end_at : existing.end_at, null);
  }

  if (!partial || hasOwn(input, "registration_open_at")) {
    data.registration_open_at = normalizeDateTime(
      hasOwn(input, "registration_open_at")
        ? input.registration_open_at
        : existing.registration_open_at,
      null
    );
  }

  if (!partial || hasOwn(input, "registration_close_at")) {
    data.registration_close_at = normalizeDateTime(
      hasOwn(input, "registration_close_at")
        ? input.registration_close_at
        : existing.registration_close_at,
      null
    );
  }

  const merged = {
    ...existing,
    ...data,
  };

  if (merged.end_at && merged.start_at && merged.end_at < merged.start_at) {
    errors.push("Tournament end time must be after the start time.");
  }

  if (
    merged.registration_open_at &&
    merged.registration_close_at &&
    merged.registration_open_at > merged.registration_close_at
  ) {
    errors.push("Registration open time must be before registration close time.");
  }

  if (
    merged.registration_close_at &&
    merged.start_at &&
    merged.registration_close_at > merged.start_at
  ) {
    errors.push("Registration must close before the tournament starts.");
  }

  if (
    Number(merged.registered_count || 0) > 0 &&
    Number(merged.max_participants || 0) > 0 &&
    Number(merged.registered_count || 0) > Number(merged.max_participants || 0)
  ) {
    errors.push("Registered count cannot exceed max participants.");
  }

  if (
    normalizeTournamentRefundPolicy(merged.refund_policy, TOURNAMENT_REFUND_POLICY_NONE) ===
      TOURNAMENT_REFUND_POLICY_PARTIAL &&
    Number(merged.refund_percentage || 0) <= 0
  ) {
    errors.push("Partial refund policy requires a refund percentage greater than 0.");
  }

  return {
    data,
    errors,
  };
}

function toDateValue(value) {
  return normalizeDateTime(value, null);
}

function hasTournamentAvailableSlots(tournament) {
  return (
    Math.max(
      0,
      Number(tournament.max_participants || 0) - Number(tournament.registered_count || 0)
    ) > 0
  );
}

function isTournamentRegistrationWindowOpen(tournament, referenceTime = new Date()) {
  const now = normalizeDateTime(referenceTime, new Date());
  const startAt = toDateValue(tournament.start_at);
  const registrationOpenAt = toDateValue(tournament.registration_open_at);
  const registrationCloseAt = toDateValue(tournament.registration_close_at);

  if (normalizeTournamentStatus(tournament.status) !== TOURNAMENT_STATUS_PUBLISHED) {
    return false;
  }

  if (registrationOpenAt && now < registrationOpenAt) {
    return false;
  }

  if (registrationCloseAt && now > registrationCloseAt) {
    return false;
  }

  if (startAt && now >= startAt) {
    return false;
  }

  return true;
}

function canRegisterForTournament(tournament, referenceTime = new Date()) {
  return (
    isTournamentRegistrationWindowOpen(tournament, referenceTime) &&
    hasTournamentAvailableSlots(tournament)
  );
}

function canJoinTournamentWaitlist(tournament, referenceTime = new Date()) {
  return (
    isTournamentRegistrationWindowOpen(tournament, referenceTime) &&
    !hasTournamentAvailableSlots(tournament)
  );
}

function canHandoffTournamentToBrackets(
  tournament,
  activeRegistrationCount = Number(tournament.registered_count || 0),
  seededRegistrationCount = Number(tournament.seeded_count || 0)
) {
  const tournamentStatus = normalizeTournamentStatus(tournament.status);

  if (
    tournamentStatus !== TOURNAMENT_STATUS_PUBLISHED ||
    tournamentStatus === TOURNAMENT_STATUS_CANCELLED ||
    tournamentStatus === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  if (Number(activeRegistrationCount || 0) < 2) {
    return false;
  }

  return Number(seededRegistrationCount || 0) === Number(activeRegistrationCount || 0);
}

function canManageTournamentAttendance(tournament, registration = {}) {
  const tournamentStatus = normalizeTournamentStatus(tournament.status);
  const registrationStatus = normalizeTournamentRegistrationStatus(
    registration.status || registration.registration_status
  );

  if (
    tournamentStatus === TOURNAMENT_STATUS_CANCELLED ||
    tournamentStatus === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  return registrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED;
}

function isResolvedTournamentMatchStatus(status) {
  return normalizeTournamentMatchStatus(status) !== TOURNAMENT_MATCH_STATUS_PENDING;
}

function getSingleEliminationBracketSize(seedEntries = []) {
  const highestSeedNumber = (Array.isArray(seedEntries) ? seedEntries : []).reduce(
    (maximum, entry) => Math.max(maximum, normalizePositiveInteger(entry?.seed_number, 0)),
    0
  );
  const participantCount = Array.isArray(seedEntries) ? seedEntries.length : 0;
  const minimumTarget = Math.max(2, highestSeedNumber, participantCount);
  let size = 2;

  while (size < minimumTarget) {
    size *= 2;
  }

  return size;
}

function buildSingleEliminationSeedOrder(size) {
  const bracketSize = Math.max(2, normalizePositiveInteger(size, 2));
  let order = [1, 2];

  while (order.length < bracketSize) {
    const mirror = order.length * 2 + 1;
    const next = [];

    for (const seed of order) {
      next.push(seed);
      next.push(mirror - seed);
    }

    order = next;
  }

  return order.slice(0, bracketSize);
}

function buildBracketMatchKey(roundNumber, matchNumber) {
  return `r${normalizePositiveInteger(roundNumber, 1)}m${normalizePositiveInteger(matchNumber, 1)}`;
}

function createBracketMatch({
  roundNumber,
  matchNumber,
  slotOneEntry = null,
  slotTwoEntry = null,
  sourceMatchOneKey = null,
  sourceMatchTwoKey = null,
  sourceMatchOneResolved = true,
  sourceMatchTwoResolved = true,
}) {
  const slotOneRegistrationId = slotOneEntry?.registration_id
    ? Number(slotOneEntry.registration_id)
    : null;
  const slotTwoRegistrationId = slotTwoEntry?.registration_id
    ? Number(slotTwoEntry.registration_id)
    : null;
  const slotOneSeedNumber = slotOneEntry?.seed_number
    ? normalizePositiveInteger(slotOneEntry.seed_number, 0) || null
    : null;
  const slotTwoSeedNumber = slotTwoEntry?.seed_number
    ? normalizePositiveInteger(slotTwoEntry.seed_number, 0) || null
    : null;

  const match = {
    key: buildBracketMatchKey(roundNumber, matchNumber),
    round_number: normalizePositiveInteger(roundNumber, 1),
    match_number: normalizePositiveInteger(matchNumber, 1),
    source_match_one_key: sourceMatchOneKey || null,
    source_match_two_key: sourceMatchTwoKey || null,
    slot_one_registration_id: slotOneRegistrationId,
    slot_two_registration_id: slotTwoRegistrationId,
    slot_one_seed_number: slotOneSeedNumber,
    slot_two_seed_number: slotTwoSeedNumber,
    winner_registration_id: null,
    winner_seed_number: null,
    loser_registration_id: null,
    status: TOURNAMENT_MATCH_STATUS_PENDING,
  };

  if (slotOneRegistrationId && !slotTwoRegistrationId && sourceMatchTwoResolved) {
    match.status = TOURNAMENT_MATCH_STATUS_WALKOVER;
    match.winner_registration_id = slotOneRegistrationId;
    match.winner_seed_number = slotOneSeedNumber;
  } else if (!slotOneRegistrationId && slotTwoRegistrationId && sourceMatchOneResolved) {
    match.status = TOURNAMENT_MATCH_STATUS_WALKOVER;
    match.winner_registration_id = slotTwoRegistrationId;
    match.winner_seed_number = slotTwoSeedNumber;
  } else if (
    !slotOneRegistrationId &&
    !slotTwoRegistrationId &&
    sourceMatchOneResolved &&
    sourceMatchTwoResolved
  ) {
    match.status = TOURNAMENT_MATCH_STATUS_WALKOVER;
  }

  return match;
}

function createSingleEliminationBracket(seedEntries = []) {
  const normalizedSeeds = (Array.isArray(seedEntries) ? seedEntries : [])
    .map((entry) => ({
      registration_id: Number(entry?.registration_id || 0),
      seed_number: normalizePositiveInteger(entry?.seed_number, 0),
    }))
    .filter((entry) => entry.registration_id > 0 && entry.seed_number > 0)
    .sort((left, right) => {
      if (left.seed_number !== right.seed_number) {
        return left.seed_number - right.seed_number;
      }

      return left.registration_id - right.registration_id;
    });

  const seenRegistrationIds = new Set();
  const seenSeedNumbers = new Set();
  for (const entry of normalizedSeeds) {
    if (seenRegistrationIds.has(entry.registration_id)) {
      throw new Error("Each bracket participant can only appear once.");
    }

    if (seenSeedNumbers.has(entry.seed_number)) {
      throw new Error("Bracket seeds must be unique.");
    }

    seenRegistrationIds.add(entry.registration_id);
    seenSeedNumbers.add(entry.seed_number);
  }

  if (normalizedSeeds.length < 2) {
    return {
      bracket_size: normalizedSeeds.length,
      round_count: 0,
      matches: [],
    };
  }

  const bracketSize = getSingleEliminationBracketSize(normalizedSeeds);
  const roundCount = Math.log2(bracketSize);
  const seedOrder = buildSingleEliminationSeedOrder(bracketSize);
  const seedByNumber = new Map(
    normalizedSeeds.map((entry) => [entry.seed_number, entry])
  );
  const matches = [];
  let previousRoundMatches = [];

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const matchTotal = bracketSize / Math.pow(2, roundNumber);
    const currentRoundMatches = [];

    for (let matchIndex = 0; matchIndex < matchTotal; matchIndex += 1) {
      let match;

      if (roundNumber === 1) {
        const slotOneSeed = seedOrder[matchIndex * 2];
        const slotTwoSeed = seedOrder[matchIndex * 2 + 1];

        match = createBracketMatch({
          roundNumber,
          matchNumber: matchIndex + 1,
          slotOneEntry: seedByNumber.get(slotOneSeed) || null,
          slotTwoEntry: seedByNumber.get(slotTwoSeed) || null,
        });
      } else {
        const sourceMatchOne = previousRoundMatches[matchIndex * 2] || null;
        const sourceMatchTwo = previousRoundMatches[matchIndex * 2 + 1] || null;

        match = createBracketMatch({
          roundNumber,
          matchNumber: matchIndex + 1,
          slotOneEntry: sourceMatchOne?.winner_registration_id
            ? {
                registration_id: sourceMatchOne.winner_registration_id,
                seed_number: sourceMatchOne.winner_seed_number,
              }
            : null,
          slotTwoEntry: sourceMatchTwo?.winner_registration_id
            ? {
                registration_id: sourceMatchTwo.winner_registration_id,
                seed_number: sourceMatchTwo.winner_seed_number,
              }
            : null,
          sourceMatchOneKey: sourceMatchOne?.key || null,
          sourceMatchTwoKey: sourceMatchTwo?.key || null,
          sourceMatchOneResolved: sourceMatchOne
            ? isResolvedTournamentMatchStatus(sourceMatchOne.status)
            : true,
          sourceMatchTwoResolved: sourceMatchTwo
            ? isResolvedTournamentMatchStatus(sourceMatchTwo.status)
            : true,
        });
      }

      currentRoundMatches.push(match);
      matches.push(match);
    }

    previousRoundMatches = currentRoundMatches;
  }

  return {
    bracket_size: bracketSize,
    round_count: roundCount,
    matches,
  };
}

function canWithdrawTournamentRegistration(tournament, referenceTime = new Date()) {
  const now = normalizeDateTime(referenceTime, new Date());
  const startAt = toDateValue(tournament.start_at);
  const registrationStatus = normalizeTournamentRegistrationStatus(
    tournament.registration_status
  );

  if (
    registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_REGISTERED &&
    registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
  ) {
    return false;
  }

  if (
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_CANCELLED ||
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  if (!startAt) {
    return true;
  }

  return now < startAt;
}

function isActiveTournamentRegistrationStatus(status) {
  const normalizedStatus = normalizeTournamentRegistrationStatus(status);
  return (
    normalizedStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED ||
    normalizedStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
  );
}

function serializeTournamentRosterMember(row) {
  return {
    member_id: Number(row.member_id || 0),
    slot_number: normalizePositiveInteger(row.slot_number, 1),
    member_name: row.member_name || "",
    member_email: row.member_email || "",
    member_mobile: row.member_mobile || "",
    is_captain: normalizeBooleanFlag(row.is_captain, false),
  };
}

function canReinstateTournamentRegistration(
  tournament,
  activeRegistrationCount = Number(tournament.registered_count || 0),
  referenceTime = new Date()
) {
  const now = normalizeDateTime(referenceTime, new Date());
  const startAt = toDateValue(tournament.start_at);
  const registrationStatus = normalizeTournamentRegistrationStatus(
    tournament.registration_status,
    TOURNAMENT_REGISTRATION_STATUS_CANCELLED
  );

  if (registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_CANCELLED) {
    return false;
  }

  if (
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_CANCELLED ||
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  if (startAt && now >= startAt) {
    return false;
  }

  if (
    Number(tournament.max_participants || 0) > 0 &&
    Number(activeRegistrationCount || 0) >= Number(tournament.max_participants || 0)
  ) {
    return false;
  }

  return true;
}

function canPlaceTournamentRegistrationOnWaitlist(tournament, referenceTime = new Date()) {
  const now = normalizeDateTime(referenceTime, new Date());
  const startAt = toDateValue(tournament.start_at);
  const registrationStatus = normalizeTournamentRegistrationStatus(
    tournament.registration_status,
    TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
  );

  if (registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
    return false;
  }

  if (
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_CANCELLED ||
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  if (startAt && now >= startAt) {
    return false;
  }

  return true;
}

function canPromoteWaitlistedTournamentRegistration(
  tournament,
  activeRegistrationCount = Number(tournament.registered_count || 0),
  referenceTime = new Date()
) {
  const now = normalizeDateTime(referenceTime, new Date());
  const startAt = toDateValue(tournament.start_at);
  const registrationStatus = normalizeTournamentRegistrationStatus(
    tournament.registration_status,
    TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
  );

  if (registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
    return false;
  }

  if (
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_CANCELLED ||
    normalizeTournamentStatus(tournament.status) === TOURNAMENT_STATUS_COMPLETED
  ) {
    return false;
  }

  if (startAt && now >= startAt) {
    return false;
  }

  if (
    Number(tournament.max_participants || 0) > 0 &&
    Number(activeRegistrationCount || 0) >= Number(tournament.max_participants || 0)
  ) {
    return false;
  }

  return true;
}

function serializeTournamentRegistration(row) {
  const status = normalizeTournamentRegistrationStatus(row.status || row.registration_status);
  const attendanceStatus = normalizeTournamentAttendanceStatus(row.attendance_status);
  const roster = Array.isArray(row.roster)
    ? row.roster.map(serializeTournamentRosterMember)
    : [];

  return {
    registration_id: Number(row.registration_id || 0),
    tournament_id: Number(row.tournament_id || 0),
    user_id: row.user_id ? Number(row.user_id) : null,
    team_id: row.team_id ? Number(row.team_id) : null,
    registration_type: normalizeTournamentRegistrationType(row.registration_type),
    status,
    participant_name: row.participant_name || "",
    participant_email: row.participant_email || "",
    participant_mobile: row.participant_mobile || "",
    team_name: row.team_name || "",
    roster_count: roster.length,
    roster,
    attendance_status: attendanceStatus,
    checked_in_at: row.checked_in_at || null,
    no_show_marked_at: row.no_show_marked_at || null,
    waitlisted_at: row.waitlisted_at || null,
    waitlist_promoted_at: row.waitlist_promoted_at || null,
    waitlist_position:
      row.waitlist_position === undefined || row.waitlist_position === null
        ? null
        : normalizePositiveInteger(row.waitlist_position, 0) || null,
    seed_number:
      row.seed_number === undefined || row.seed_number === null
        ? null
        : normalizePositiveInteger(row.seed_number, 0) || null,
    registered_at: row.registered_at || row.created_at || null,
    cancelled_at: row.cancelled_at || null,
    payment_status: row.payment_status || null,
    payment_method: row.payment_method || "",
    payment_reference: row.payment_reference || "",
    payment_notes: row.payment_notes || "",
    premium_access: normalizeBooleanFlag(row.premium_access, false),
    premium_access_fee: normalizeCurrency(row.premium_access_fee, 0),
    premium_access_label: row.premium_access_label || "",
    amount_due: normalizeCurrency(row.amount_due, 0),
    amount_paid: normalizeCurrency(row.amount_paid, 0),
    outstanding_amount: normalizeCurrency(row.outstanding_amount, 0),
    paid_at: row.paid_at || null,
    refund_status: row.refund_status || null,
    refund_requested_amount: normalizeCurrency(row.refund_requested_amount, 0),
    refund_processed_amount: normalizeCurrency(row.refund_processed_amount, 0),
    refund_requested_at: row.refund_requested_at || null,
    refund_processed_at: row.refund_processed_at || null,
    refund_notes: row.refund_notes || "",
    refund_eligible: normalizeBooleanFlag(row.refund_eligible, false),
    refundable_amount: normalizeCurrency(row.refundable_amount, 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_active: isActiveTournamentRegistrationStatus(status),
    is_checked_in: attendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
    is_waitlisted: status === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
    can_manage_attendance: canManageTournamentAttendance(row, {
      status,
      attendance_status: attendanceStatus,
    }),
  };
}

function serializeTournament(row, { referenceTime = new Date() } = {}) {
  const normalizedReferenceTime = normalizeDateTime(referenceTime, new Date());
  const registrationStatus = row.registration_status
    ? normalizeTournamentRegistrationStatus(row.registration_status)
    : null;
  const tournament = {
    tournament_id: Number(row.tournament_id || row.id || 0),
    business_id: Number(row.business_id || 0),
    business_name: row.business_name || "",
    business_slug: row.business_slug || "",
    business_tagline: row.business_tagline || "",
    business_city: row.business_city || "",
    business_state: row.business_state || "",
    business_address_line1: row.business_address_line1 || "",
    business_timezone: row.business_timezone || "Asia/Kolkata",
    slug: row.slug || "",
    title: row.title || "",
    game_title: row.game_title || "",
    skill_level: normalizeTournamentSkillLevel(row.skill_level),
    format: normalizeTournamentFormat(row.format),
    team_size: normalizePositiveInteger(row.team_size, 1),
    max_participants: normalizePositiveInteger(row.max_participants, 0),
    registered_count: normalizePositiveInteger(row.registered_count, 0),
    entry_fee: normalizeCurrency(row.entry_fee, 0),
    prize_pool: normalizeCurrency(row.prize_pool, 0),
    is_sponsored: normalizeBooleanFlag(row.is_sponsored, false),
    sponsor_name: row.sponsor_name || "",
    sponsor_tagline: row.sponsor_tagline || "",
    sponsor_prize_contribution: normalizeCurrency(row.sponsor_prize_contribution, 0),
    is_premium: normalizeBooleanFlag(row.is_premium, false),
    premium_entry_fee: normalizeCurrency(row.premium_entry_fee, 0),
    premium_label: row.premium_label || "",
    premium_perks: row.premium_perks || "",
    refund_policy: normalizeTournamentRefundPolicy(row.refund_policy),
    refund_cutoff_hours: normalizePositiveInteger(row.refund_cutoff_hours, 24),
    refund_percentage: normalizePositiveInteger(row.refund_percentage, 100),
    location_label: row.location_label || "",
    summary: row.summary || "",
    description: row.description || "",
    rules: row.rules || "",
    cover_image: row.cover_image || "",
    status: normalizeTournamentStatus(row.status),
    is_featured: normalizeBooleanFlag(row.is_featured, false),
    start_at: row.start_at || null,
    end_at: row.end_at || null,
    registration_open_at: row.registration_open_at || null,
    registration_close_at: row.registration_close_at || null,
    published_at: row.published_at || null,
    operations_stage: normalizeTournamentOperationsStage(row.operations_stage),
    bracket_handoff_at: row.bracket_handoff_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    seeded_count: normalizePositiveInteger(row.seeded_count, 0),
    bracket_match_count: normalizePositiveInteger(row.bracket_match_count, 0),
    completed_bracket_match_count: normalizePositiveInteger(
      row.completed_bracket_match_count,
      0
    ),
    checked_in_count: normalizePositiveInteger(row.checked_in_count, 0),
    no_show_count: normalizePositiveInteger(row.no_show_count, 0),
    waitlist_count: normalizePositiveInteger(row.waitlist_count, 0),
    registration_id: row.registration_id ? Number(row.registration_id) : null,
    team_id: row.team_id ? Number(row.team_id) : null,
    registration_type: row.registration_type
      ? normalizeTournamentRegistrationType(row.registration_type)
      : null,
    registration_status: registrationStatus,
    attendance_status: normalizeTournamentAttendanceStatus(row.attendance_status),
    registered_at: row.registered_at || null,
    team_name: row.team_name || "",
    roster_count: Array.isArray(row.roster)
      ? row.roster.length
      : normalizePositiveInteger(row.roster_count, 0),
    roster: Array.isArray(row.roster)
      ? row.roster.map(serializeTournamentRosterMember)
      : [],
    seed_number:
      row.seed_number === undefined || row.seed_number === null
        ? null
        : normalizePositiveInteger(row.seed_number, 0) || null,
    checked_in_at: row.checked_in_at || null,
    no_show_marked_at: row.no_show_marked_at || null,
    waitlisted_at: row.waitlisted_at || null,
    waitlist_promoted_at: row.waitlist_promoted_at || null,
    waitlist_position:
      row.waitlist_position === undefined || row.waitlist_position === null
        ? null
        : normalizePositiveInteger(row.waitlist_position, 0) || null,
    payment_status: row.payment_status || null,
    payment_method: row.payment_method || "",
    payment_reference: row.payment_reference || "",
    payment_notes: row.payment_notes || "",
    premium_access: normalizeBooleanFlag(row.premium_access, false),
    premium_access_fee: normalizeCurrency(row.premium_access_fee, 0),
    premium_access_label: row.premium_access_label || "",
    amount_due: normalizeCurrency(row.amount_due, 0),
    amount_paid: normalizeCurrency(row.amount_paid, 0),
    outstanding_amount: normalizeCurrency(row.outstanding_amount, 0),
    paid_at: row.paid_at || null,
    refund_status: row.refund_status || null,
    refund_requested_amount: normalizeCurrency(row.refund_requested_amount, 0),
    refund_processed_amount: normalizeCurrency(row.refund_processed_amount, 0),
    refund_requested_at: row.refund_requested_at || null,
    refund_processed_at: row.refund_processed_at || null,
    refund_notes: row.refund_notes || "",
    refund_eligible: normalizeBooleanFlag(row.refund_eligible, false),
    refundable_amount: normalizeCurrency(row.refundable_amount, 0),
  };

  const hasRegistration =
    registrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED ||
    registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED;

  return {
    ...tournament,
    available_slots: Math.max(0, tournament.max_participants - tournament.registered_count),
    has_available_slots: hasTournamentAvailableSlots(tournament),
    pending_check_in_count: Math.max(
      0,
      tournament.registered_count - tournament.checked_in_count - tournament.no_show_count
    ),
    can_register:
      !hasRegistration && canRegisterForTournament(tournament, normalizedReferenceTime),
    can_join_waitlist:
      !hasRegistration && canJoinTournamentWaitlist(tournament, normalizedReferenceTime),
    can_handoff_to_brackets: canHandoffTournamentToBrackets(
      tournament,
      tournament.registered_count,
      tournament.seeded_count
    ),
    effective_prize_pool: normalizeCurrency(
      tournament.prize_pool + tournament.sponsor_prize_contribution,
      0
    ),
    has_bracket: tournament.bracket_match_count > 0,
    has_registration: hasRegistration,
    is_registered: registrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
    is_waitlisted: registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
    can_withdraw_registration: canWithdrawTournamentRegistration(
      tournament,
      normalizedReferenceTime
    ),
    is_checked_in: tournament.attendance_status === TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  };
}

module.exports = {
  TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_ATTENDANCE_STATUSES,
  TOURNAMENT_MATCH_STATUS_COMPLETED,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
  TOURNAMENT_MATCH_STATUSES,
  TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
  TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
  TOURNAMENT_OPERATIONS_STAGE_SEEDING,
  TOURNAMENT_OPERATIONS_STAGES,
  TOURNAMENT_REGISTRATION_TYPES,
  TOURNAMENT_REGISTRATION_STATUSES,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_TYPE_SOLO,
  TOURNAMENT_REGISTRATION_TYPE_TEAM,
  TOURNAMENT_FORMAT_DUO,
  TOURNAMENT_FORMAT_SOLO,
  TOURNAMENT_FORMAT_SQUAD,
  TOURNAMENT_FORMAT_TEAM,
  TOURNAMENT_FORMATS,
  TOURNAMENT_SKILL_LEVELS,
  TOURNAMENT_REFUND_POLICY_FULL,
  TOURNAMENT_REFUND_POLICY_NONE,
  TOURNAMENT_REFUND_POLICY_PARTIAL,
  TOURNAMENT_REFUND_POLICIES,
  canManageTournamentAttendance,
  canJoinTournamentWaitlist,
  canPlaceTournamentRegistrationOnWaitlist,
  canPromoteWaitlistedTournamentRegistration,
  canWithdrawTournamentRegistration,
  TOURNAMENT_STATUS_CANCELLED,
  TOURNAMENT_STATUS_COMPLETED,
  TOURNAMENT_STATUS_DRAFT,
  TOURNAMENT_STATUS_PUBLISHED,
  TOURNAMENT_STATUSES,
  canReinstateTournamentRegistration,
  canHandoffTournamentToBrackets,
  canRegisterForTournament,
  hasTournamentAvailableSlots,
  isTournamentRegistrationWindowOpen,
  normalizeBooleanFlag,
  normalizeCurrency,
  normalizeDateTime,
  normalizePositiveInteger,
  normalizeSlug,
  normalizeTournamentAttendanceStatus,
  normalizeTournamentFormat,
  normalizeTournamentSkillLevel,
  normalizeTournamentMatchStatus,
  normalizeTournamentOperationsStage,
  normalizeTournamentRefundPolicy,
  normalizeTournamentRegistrationStatus,
  normalizeTournamentRegistrationType,
  normalizeTournamentStatus,
  parseTournamentInput,
  createSingleEliminationBracket,
  buildSingleEliminationSeedOrder,
  serializeTournament,
  serializeTournamentRegistration,
  serializeTournamentRosterMember,
  slugifyTournamentTitle,
  isActiveTournamentRegistrationStatus,
  isResolvedTournamentMatchStatus,
};
