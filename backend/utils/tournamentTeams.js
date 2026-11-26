const MAX_PERSISTENT_TEAM_SIZE = 6;
const TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN = "captain";
const TOURNAMENT_TEAM_MEMBER_STATUS_PENDING = "pending";
const TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED = "accepted";
const TOURNAMENT_TEAM_MEMBER_STATUS_DECLINED = "declined";

const TOURNAMENT_TEAM_MEMBER_STATUSES = new Set([
  TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN,
  TOURNAMENT_TEAM_MEMBER_STATUS_PENDING,
  TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_MEMBER_STATUS_DECLINED,
]);

const TOURNAMENT_TEAM_INVITE_STATUS_PENDING = "pending";
const TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED = "accepted";
const TOURNAMENT_TEAM_INVITE_STATUS_DECLINED = "declined";
const TOURNAMENT_TEAM_INVITE_STATUS_CANCELLED = "cancelled";

const TOURNAMENT_TEAM_INVITE_STATUSES = new Set([
  TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
  TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_INVITE_STATUS_DECLINED,
  TOURNAMENT_TEAM_INVITE_STATUS_CANCELLED,
]);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.max(0, Math.round(toNumber(value, fallback)));
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeTournamentTeamTag(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);
}

function normalizeTournamentTeamMemberStatus(
  value,
  fallback = TOURNAMENT_TEAM_MEMBER_STATUS_PENDING
) {
  const normalized = normalizeText(value).toLowerCase();
  return TOURNAMENT_TEAM_MEMBER_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeTournamentTeamInviteStatus(
  value,
  fallback = TOURNAMENT_TEAM_INVITE_STATUS_PENDING
) {
  const normalized = normalizeText(value).toLowerCase();
  return TOURNAMENT_TEAM_INVITE_STATUSES.has(normalized) ? normalized : fallback;
}

function serializePersistentTournamentTeamMember(row = {}) {
  const membershipStatus = normalizeTournamentTeamMemberStatus(
    row.membership_status,
    toBoolean(row.is_captain, false)
      ? TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN
      : TOURNAMENT_TEAM_MEMBER_STATUS_PENDING
  );

  return {
    team_member_id: toInteger(row.team_member_id),
    team_id: toInteger(row.team_id),
    user_id: row.user_id ? toInteger(row.user_id) : null,
    slot_number: Math.max(1, toInteger(row.slot_number, 1)),
    member_name: normalizeText(row.member_name),
    member_email: normalizeText(row.member_email),
    member_mobile: normalizeText(row.member_mobile),
    is_captain: toBoolean(row.is_captain, false),
    membership_status: membershipStatus,
    is_linked:
      membershipStatus === TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN ||
      membershipStatus === TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
  };
}

function serializePersistentTournamentTeamInvite(row = {}) {
  return {
    invite_id: toInteger(row.invite_id),
    team_id: toInteger(row.team_id),
    team_member_id: toInteger(row.team_member_id),
    invited_email: normalizeText(row.invited_email),
    invited_user_id: row.invited_user_id ? toInteger(row.invited_user_id) : null,
    invited_by_user_id: row.invited_by_user_id ? toInteger(row.invited_by_user_id) : null,
    status: normalizeTournamentTeamInviteStatus(row.status),
    message: normalizeText(row.message),
    responded_at: row.responded_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    team: row.team
      ? {
          team_id: toInteger(row.team.team_id),
          team_name: normalizeText(row.team.team_name),
          team_tag: normalizeTournamentTeamTag(row.team.team_tag),
          preferred_game: normalizeText(row.team.preferred_game),
        }
      : null,
    member: row.member
      ? serializePersistentTournamentTeamMember(row.member)
      : null,
    inviter: row.inviter
      ? {
          user_id: row.inviter.user_id ? toInteger(row.inviter.user_id) : null,
          name: normalizeText(row.inviter.name, "Team captain"),
          email: normalizeText(row.inviter.email),
        }
      : null,
  };
}

function serializePersistentTournamentTeamHistoryEntry(row = {}) {
  const placement = normalizeText(row.placement).toLowerCase();

  return {
    registration_id: toInteger(row.registration_id),
    tournament_id: toInteger(row.tournament_id),
    tournament_slug: normalizeText(row.tournament_slug),
    tournament_title: normalizeText(row.tournament_title, "Tournament"),
    game_title: normalizeText(row.game_title),
    tournament_status: normalizeText(row.tournament_status),
    registration_status: normalizeText(row.registration_status),
    attendance_status: normalizeText(row.attendance_status),
    team_name: normalizeText(row.team_name),
    seed_number:
      row.seed_number === undefined || row.seed_number === null
        ? null
        : toInteger(row.seed_number),
    placement:
      placement === "champion" || placement === "runner_up" ? placement : "",
    registered_at: row.registered_at || null,
    waitlisted_at: row.waitlisted_at || null,
    waitlist_promoted_at: row.waitlist_promoted_at || null,
    start_at: row.start_at || null,
  };
}

function buildPersistentTournamentTeamMembers({ captain = {}, roster = [] } = {}) {
  const teammates = Array.isArray(roster) ? roster : [];
  const errors = [];
  const captainName = normalizeText(captain.name);
  const captainEmail = normalizeText(captain.email);
  const captainMobile = normalizeText(captain.mobile);

  if (!captainName || !captainEmail) {
    errors.push("Captain profile is incomplete. Update your account details first.");
  }

  if (teammates.length < 1) {
    errors.push("Add at least one teammate to create a reusable team.");
  }

  if (teammates.length > MAX_PERSISTENT_TEAM_SIZE - 1) {
    errors.push(`Reusable teams support up to ${MAX_PERSISTENT_TEAM_SIZE} total players.`);
  }

  const members = [
    {
      slot_number: 1,
      member_name: captainName.slice(0, 120),
      member_email: captainEmail.slice(0, 191),
      member_mobile: captainMobile.slice(0, 32) || null,
      is_captain: 1,
    },
  ];

  teammates.forEach((entry, index) => {
    const memberName = normalizeText(entry?.member_name || entry?.name);
    const memberEmail = normalizeText(entry?.member_email || entry?.email);
    const memberMobile = normalizeText(entry?.member_mobile || entry?.mobile);

    if (!memberName) {
      errors.push(`Teammate ${index + 2} name is required.`);
      return;
    }

    members.push({
      slot_number: index + 2,
      member_name: memberName.slice(0, 120),
      member_email: memberEmail.slice(0, 191),
      member_mobile: memberMobile.slice(0, 32) || null,
      is_captain: 0,
    });
  });

  return {
    errors,
    members,
  };
}

function parsePersistentTournamentTeamInput(input = {}, { captain = {} } = {}) {
  const teamName = normalizeText(input.team_name || input.name).slice(0, 160);
  const teamTag = normalizeTournamentTeamTag(input.team_tag || input.tag);
  const preferredGame = normalizeText(
    input.preferred_game || input.favorite_game
  ).slice(0, 120);
  const teamBio = normalizeText(input.team_bio || input.bio).slice(0, 500);
  const rosterInput = Array.isArray(input.roster) ? input.roster : [];
  const errors = [];

  if (!teamName) {
    errors.push("Team name is required.");
  }

  const rosterResult = buildPersistentTournamentTeamMembers({
    captain,
    roster: rosterInput,
  });

  return {
    errors: [...errors, ...rosterResult.errors],
    data: {
      team_name: teamName,
      team_tag: teamTag,
      preferred_game: preferredGame,
      team_bio: teamBio,
      members: rosterResult.members,
    },
  };
}

function serializePersistentTournamentTeam(row = {}) {
  const members = Array.isArray(row.members)
    ? row.members.map(serializePersistentTournamentTeamMember)
    : [];
  const history = Array.isArray(row.history)
    ? row.history.map(serializePersistentTournamentTeamHistoryEntry)
    : [];
  const invites = Array.isArray(row.invites)
    ? row.invites.map(serializePersistentTournamentTeamInvite)
    : [];

  return {
    team_id: toInteger(row.team_id),
    owner_user_id: toInteger(row.owner_user_id),
    team_name: normalizeText(row.team_name),
    team_tag: normalizeTournamentTeamTag(row.team_tag),
    preferred_game: normalizeText(row.preferred_game),
    team_bio: normalizeText(row.team_bio),
    roster_count: members.length,
    members,
    total_entries: toInteger(row.total_entries),
    active_entries: toInteger(row.active_entries),
    championship_count: toInteger(row.championship_count),
    runner_up_count: toInteger(row.runner_up_count),
    total_match_wins: toInteger(row.total_match_wins),
    last_registered_at: row.last_registered_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    viewer_role: normalizeText(row.viewer_role, "owner").toLowerCase() === "member"
      ? "member"
      : "owner",
    is_owner: toBoolean(row.is_owner, toInteger(row.owner_user_id) > 0),
    pending_invite_count: toInteger(row.pending_invite_count),
    accepted_member_count: toInteger(
      row.accepted_member_count,
      members.filter((member) => member.is_linked).length
    ),
    invites,
    history,
  };
}

module.exports = {
  MAX_PERSISTENT_TEAM_SIZE,
  TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_INVITE_STATUS_CANCELLED,
  TOURNAMENT_TEAM_INVITE_STATUS_DECLINED,
  TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
  TOURNAMENT_TEAM_INVITE_STATUSES,
  TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN,
  TOURNAMENT_TEAM_MEMBER_STATUS_DECLINED,
  TOURNAMENT_TEAM_MEMBER_STATUS_PENDING,
  TOURNAMENT_TEAM_MEMBER_STATUSES,
  buildPersistentTournamentTeamMembers,
  normalizeTournamentTeamTag,
  normalizeTournamentTeamInviteStatus,
  normalizeTournamentTeamMemberStatus,
  parsePersistentTournamentTeamInput,
  serializePersistentTournamentTeam,
  serializePersistentTournamentTeamHistoryEntry,
  serializePersistentTournamentTeamInvite,
  serializePersistentTournamentTeamMember,
};
