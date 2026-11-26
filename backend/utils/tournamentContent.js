const TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT = "draft";
const TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED = "published";
const TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED = "archived";

const TOURNAMENT_COMMUNITY_POST_STATUSES = new Set([
  TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT,
  TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED,
  TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED,
]);

const TOURNAMENT_COMMUNITY_POST_TYPE_SPOTLIGHT = "spotlight";
const TOURNAMENT_COMMUNITY_POST_TYPE_PROMO = "promo";
const TOURNAMENT_COMMUNITY_POST_TYPE_COMMUNITY_UPDATE = "community_update";
const TOURNAMENT_COMMUNITY_POST_TYPE_RECAP = "recap";

const TOURNAMENT_COMMUNITY_POST_TYPES = new Set([
  TOURNAMENT_COMMUNITY_POST_TYPE_SPOTLIGHT,
  TOURNAMENT_COMMUNITY_POST_TYPE_PROMO,
  TOURNAMENT_COMMUNITY_POST_TYPE_COMMUNITY_UPDATE,
  TOURNAMENT_COMMUNITY_POST_TYPE_RECAP,
]);

const TOURNAMENT_COMMUNITY_POST_TONE_ORANGE = "orange";
const TOURNAMENT_COMMUNITY_POST_TONE_TURQUOISE = "turquoise";
const TOURNAMENT_COMMUNITY_POST_TONE_GOLD = "gold";
const TOURNAMENT_COMMUNITY_POST_TONE_ROSE = "rose";

const TOURNAMENT_COMMUNITY_POST_TONES = new Set([
  TOURNAMENT_COMMUNITY_POST_TONE_ORANGE,
  TOURNAMENT_COMMUNITY_POST_TONE_TURQUOISE,
  TOURNAMENT_COMMUNITY_POST_TONE_GOLD,
  TOURNAMENT_COMMUNITY_POST_TONE_ROSE,
]);

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

function toNullableInteger(value) {
  const parsed = toInteger(value, 0);
  return parsed > 0 ? parsed : null;
}

function toBoolean(value, fallback = false) {
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
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeTournamentCommunityPostStatus(
  value,
  fallback = TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT
) {
  const normalized = normalizeText(value).toLowerCase();
  return TOURNAMENT_COMMUNITY_POST_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentCommunityPostType(
  value,
  fallback = TOURNAMENT_COMMUNITY_POST_TYPE_SPOTLIGHT
) {
  const normalized = normalizeText(value).toLowerCase();
  return TOURNAMENT_COMMUNITY_POST_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentCommunityPostTone(
  value,
  fallback = TOURNAMENT_COMMUNITY_POST_TONE_ORANGE
) {
  const normalized = normalizeText(value).toLowerCase();
  return TOURNAMENT_COMMUNITY_POST_TONES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentCommunityDateTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return {
      value: null,
      parsedAt: null,
      error: null,
    };
  }

  const candidate = normalized.replace(" ", "T");
  const parsedAt = new Date(candidate);

  if (Number.isNaN(parsedAt.getTime())) {
    return {
      value: null,
      parsedAt: null,
      error: `Invalid date value: ${normalized}`,
    };
  }

  let sqlValue = candidate.replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(sqlValue)) {
    sqlValue = `${sqlValue}:00`;
  }

  return {
    value: sqlValue.slice(0, 19),
    parsedAt,
    error: null,
  };
}

function parseTournamentCommunityPostInput(input = {}) {
  const title = normalizeText(input.title).slice(0, 160);
  const subtitle = normalizeText(input.subtitle).slice(0, 220);
  const summary = normalizeText(input.summary).slice(0, 420);
  const body = normalizeText(input.body).slice(0, 2400);
  const badgeLabel = normalizeText(input.badge_label).slice(0, 48);
  const ctaLabel = normalizeText(input.cta_label).slice(0, 64);
  const priority = Math.max(0, Math.min(999, toInteger(input.priority, 0)));
  const linkedTournamentId = toNullableInteger(input.linked_tournament_id);
  const startsAt = normalizeTournamentCommunityDateTime(input.starts_at);
  const endsAt = normalizeTournamentCommunityDateTime(input.ends_at);
  const errors = [];

  if (!title) {
    errors.push("Post title is required.");
  }

  if (!summary) {
    errors.push("Post summary is required.");
  }

  if (startsAt.error) {
    errors.push("Start time is invalid.");
  }

  if (endsAt.error) {
    errors.push("End time is invalid.");
  }

  if (startsAt.parsedAt && endsAt.parsedAt && endsAt.parsedAt < startsAt.parsedAt) {
    errors.push("End time must be after the start time.");
  }

  return {
    errors,
    data: {
      linked_tournament_id: linkedTournamentId,
      content_type: normalizeTournamentCommunityPostType(input.content_type),
      status: normalizeTournamentCommunityPostStatus(input.status),
      accent_tone: normalizeTournamentCommunityPostTone(input.accent_tone),
      title,
      subtitle,
      summary,
      body,
      badge_label: badgeLabel,
      cta_label: ctaLabel,
      priority,
      starts_at: startsAt.value,
      ends_at: endsAt.value,
    },
  };
}

function isTournamentCommunityPostActiveNow(row = {}) {
  const status = normalizeTournamentCommunityPostStatus(row.status);
  if (status !== TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED) {
    return false;
  }

  const now = Date.now();
  const startsAt = row.starts_at ? new Date(row.starts_at).getTime() : null;
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : null;

  if (Number.isFinite(startsAt) && startsAt > now) {
    return false;
  }

  if (Number.isFinite(endsAt) && endsAt < now) {
    return false;
  }

  return true;
}

function buildLinkedTournament(row = {}) {
  const linkedTournamentId =
    toNullableInteger(row.linked_tournament_tournament_id) ||
    toNullableInteger(row.linked_tournament_id);

  if (!linkedTournamentId) {
    return null;
  }

  return {
    tournament_id: linkedTournamentId,
    slug: normalizeText(row.linked_tournament_slug || row.slug),
    title: normalizeText(row.linked_tournament_title || row.title),
    game_title: normalizeText(row.linked_tournament_game_title || row.game_title),
    status: normalizeText(row.linked_tournament_status || row.tournament_status),
    start_at: row.linked_tournament_start_at || row.start_at || null,
    is_featured: toBoolean(row.linked_tournament_is_featured, false),
  };
}

function serializeTournamentCommunityPost(row = {}) {
  return {
    post_id: toInteger(row.post_id),
    linked_tournament_id: toNullableInteger(row.linked_tournament_id),
    content_type: normalizeTournamentCommunityPostType(row.content_type),
    status: normalizeTournamentCommunityPostStatus(row.status),
    accent_tone: normalizeTournamentCommunityPostTone(row.accent_tone),
    title: normalizeText(row.title),
    subtitle: normalizeText(row.subtitle),
    summary: normalizeText(row.summary),
    body: normalizeText(row.body),
    badge_label: normalizeText(row.badge_label),
    cta_label: normalizeText(row.cta_label),
    priority: Math.max(0, toInteger(row.priority, 0)),
    reaction_count: Math.max(0, toInteger(row.reaction_count, 0)),
    starts_at: row.starts_at || null,
    ends_at: row.ends_at || null,
    published_at: row.published_at || null,
    created_by: toNullableInteger(row.created_by),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_active_now: toBoolean(row.is_active_now, isTournamentCommunityPostActiveNow(row)),
    linked_tournament: buildLinkedTournament(row),
  };
}

module.exports = {
  TOURNAMENT_COMMUNITY_POST_STATUSES,
  TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED,
  TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT,
  TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED,
  TOURNAMENT_COMMUNITY_POST_TONES,
  TOURNAMENT_COMMUNITY_POST_TONE_GOLD,
  TOURNAMENT_COMMUNITY_POST_TONE_ORANGE,
  TOURNAMENT_COMMUNITY_POST_TONE_ROSE,
  TOURNAMENT_COMMUNITY_POST_TONE_TURQUOISE,
  TOURNAMENT_COMMUNITY_POST_TYPES,
  TOURNAMENT_COMMUNITY_POST_TYPE_COMMUNITY_UPDATE,
  TOURNAMENT_COMMUNITY_POST_TYPE_PROMO,
  TOURNAMENT_COMMUNITY_POST_TYPE_RECAP,
  TOURNAMENT_COMMUNITY_POST_TYPE_SPOTLIGHT,
  isTournamentCommunityPostActiveNow,
  normalizeTournamentCommunityPostStatus,
  normalizeTournamentCommunityPostTone,
  normalizeTournamentCommunityPostType,
  parseTournamentCommunityPostInput,
  serializeTournamentCommunityPost,
};
