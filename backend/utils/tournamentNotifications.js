const TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT = "announcement";
const TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED = "tournament_published";
const TOURNAMENT_NOTIFICATION_EVENT_CANCELLED = "tournament_cancelled";
const TOURNAMENT_NOTIFICATION_EVENT_BRACKET_READY = "bracket_ready";
const TOURNAMENT_NOTIFICATION_EVENT_MATCH_RESULT = "match_result";
const TOURNAMENT_NOTIFICATION_EVENT_CHAMPION = "champion_declared";
const TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED = "waitlist_joined";
const TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_PROMOTED = "waitlist_promoted";

const TOURNAMENT_NOTIFICATION_EVENTS = new Set([
  TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
  TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED,
  TOURNAMENT_NOTIFICATION_EVENT_CANCELLED,
  TOURNAMENT_NOTIFICATION_EVENT_BRACKET_READY,
  TOURNAMENT_NOTIFICATION_EVENT_MATCH_RESULT,
  TOURNAMENT_NOTIFICATION_EVENT_CHAMPION,
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_PROMOTED,
]);

const TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED = "all_registered";
const TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN = "checked_in";
const TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET = "eligible_bracket";
const TOURNAMENT_NOTIFICATION_SCOPE_MATCH_PLAYERS = "match_players";
const TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED = "waitlisted";

const TOURNAMENT_NOTIFICATION_SCOPES = new Set([
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN,
  TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET,
  TOURNAMENT_NOTIFICATION_SCOPE_MATCH_PLAYERS,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
]);

const TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING = "pending";
const TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT = "sent";
const TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED = "skipped";
const TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED = "failed";

const TOURNAMENT_NOTIFICATION_EMAIL_STATUSES = new Set([
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED,
]);

function normalizeTournamentNotificationEvent(
  value,
  fallback = TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_NOTIFICATION_EVENTS.has(normalized) ? normalized : fallback;
}

function normalizeTournamentNotificationScope(
  value,
  fallback = TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_NOTIFICATION_SCOPES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentNotificationEmailStatus(
  value,
  fallback = TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED
) {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_NOTIFICATION_EMAIL_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback = false) {
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

function filterTournamentNotificationRecipients(recipients, scope) {
  const normalizedScope = normalizeTournamentNotificationScope(scope);
  const source = Array.isArray(recipients) ? recipients : [];

  switch (normalizedScope) {
    case TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN:
      return source.filter(
        (recipient) =>
          String(recipient?.status || "").trim().toLowerCase() === "registered" &&
          String(recipient?.attendance_status || "").trim().toLowerCase() === "checked_in"
      );
    case TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET:
      return source.filter(
        (recipient) =>
          String(recipient?.status || "").trim().toLowerCase() === "registered" &&
          String(recipient?.attendance_status || "").trim().toLowerCase() !== "no_show"
      );
    case TOURNAMENT_NOTIFICATION_SCOPE_MATCH_PLAYERS:
      return source.filter((recipient) => Number(recipient?.user_id || 0) > 0);
    case TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED:
      return source.filter(
        (recipient) =>
          String(recipient?.status || "").trim().toLowerCase() === "waitlisted"
      );
    default:
      return source.filter(
        (recipient) =>
          String(recipient?.status || "").trim().toLowerCase() === "registered"
      );
  }
}

function serializeTournamentNotificationCampaign(row) {
  return {
    campaign_id: Number(row.campaign_id || 0),
    tournament_id: Number(row.tournament_id || 0),
    event_type: normalizeTournamentNotificationEvent(row.event_type),
    recipient_scope: normalizeTournamentNotificationScope(row.recipient_scope),
    title: row.title || "",
    message: row.message || "",
    send_email: normalizeBoolean(row.send_email, false),
    delivery_count: Number(row.delivery_count || 0),
    read_count: Number(row.read_count || 0),
    emailed_count: Number(row.emailed_count || 0),
    email_failed_count: Number(row.email_failed_count || 0),
    created_by: row.created_by ? Number(row.created_by) : null,
    created_at: row.created_at || null,
  };
}

function serializeTournamentNotification(row) {
  return {
    notification_id: Number(row.notification_id || 0),
    campaign_id: Number(row.campaign_id || 0),
    tournament_id: Number(row.tournament_id || 0),
    registration_id: row.registration_id ? Number(row.registration_id) : null,
    user_id: Number(row.user_id || 0),
    event_type: normalizeTournamentNotificationEvent(row.event_type),
    title: row.title || "",
    message: row.message || "",
    email_status: normalizeTournamentNotificationEmailStatus(row.email_status),
    email_attempted_at: row.email_attempted_at || null,
    emailed_at: row.emailed_at || null,
    email_error: row.email_error || null,
    read_at: row.read_at || null,
    is_read: Boolean(row.read_at),
    created_at: row.created_at || null,
    tournament: {
      tournament_id: Number(row.tournament_id || 0),
      slug: row.slug || "",
      title: row.tournament_title || row.title || "",
      game_title: row.game_title || "",
      status: row.tournament_status || "",
      start_at: row.start_at || null,
    },
  };
}

module.exports = {
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUSES,
  TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
  TOURNAMENT_NOTIFICATION_EVENT_BRACKET_READY,
  TOURNAMENT_NOTIFICATION_EVENT_CANCELLED,
  TOURNAMENT_NOTIFICATION_EVENT_CHAMPION,
  TOURNAMENT_NOTIFICATION_EVENT_MATCH_RESULT,
  TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED,
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_PROMOTED,
  TOURNAMENT_NOTIFICATION_EVENTS,
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN,
  TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET,
  TOURNAMENT_NOTIFICATION_SCOPE_MATCH_PLAYERS,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
  TOURNAMENT_NOTIFICATION_SCOPES,
  filterTournamentNotificationRecipients,
  normalizeTournamentNotificationEmailStatus,
  normalizeTournamentNotificationEvent,
  normalizeTournamentNotificationScope,
  serializeTournamentNotification,
  serializeTournamentNotificationCampaign,
};
