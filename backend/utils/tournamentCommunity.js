const { query } = require("./db");

const TOURNAMENT_RANKING_WEIGHTS = Object.freeze({
  championship: 400,
  runner_up: 180,
  match_win: 45,
  checked_in: 15,
  no_show_penalty: 25,
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.max(0, Math.round(toNumber(value, fallback)));
}

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function roundRate(value) {
  return Math.round(toNumber(value, 0) * 10) / 10;
}

function createTournamentCommunityProfile(overrides = {}) {
  return {
    user_id: toInteger(overrides.user_id),
    tournament_entries: toInteger(overrides.tournament_entries),
    tournaments_checked_in: toInteger(overrides.tournaments_checked_in),
    tournaments_no_show: toInteger(overrides.tournaments_no_show),
    tournament_matches_played: toInteger(overrides.tournament_matches_played),
    tournament_match_wins: toInteger(overrides.tournament_match_wins),
    tournament_match_losses: toInteger(overrides.tournament_match_losses),
    tournament_championships: toInteger(overrides.tournament_championships),
    tournament_runner_up_finishes: toInteger(overrides.tournament_runner_up_finishes),
    tournament_points: toInteger(overrides.tournament_points),
    tournament_rank:
      overrides.tournament_rank === undefined || overrides.tournament_rank === null
        ? null
        : toInteger(overrides.tournament_rank),
    tournament_win_rate: roundRate(overrides.tournament_win_rate),
    most_played_tournament_game: normalizeText(overrides.most_played_tournament_game),
    last_tournament_at: overrides.last_tournament_at || null,
  };
}

function computeTournamentRankingPoints(profile = {}) {
  const championships = toInteger(profile.tournament_championships);
  const runnerUpFinishes = toInteger(profile.tournament_runner_up_finishes);
  const matchWins = toInteger(profile.tournament_match_wins);
  const checkedIn = toInteger(profile.tournaments_checked_in);
  const noShows = toInteger(profile.tournaments_no_show);

  return Math.max(
    0,
    championships * TOURNAMENT_RANKING_WEIGHTS.championship +
      runnerUpFinishes * TOURNAMENT_RANKING_WEIGHTS.runner_up +
      matchWins * TOURNAMENT_RANKING_WEIGHTS.match_win +
      checkedIn * TOURNAMENT_RANKING_WEIGHTS.checked_in -
      noShows * TOURNAMENT_RANKING_WEIGHTS.no_show_penalty
  );
}

function hasTournamentActivity(profile = {}) {
  return (
    toInteger(profile.tournament_entries) > 0 ||
    toInteger(profile.tournament_matches_played) > 0 ||
    toInteger(profile.tournament_points) > 0
  );
}

function compareTournamentProfiles(left = {}, right = {}) {
  const leftPoints = toInteger(left.tournament_points);
  const rightPoints = toInteger(right.tournament_points);
  if (leftPoints !== rightPoints) {
    return rightPoints - leftPoints;
  }

  const leftChampionships = toInteger(left.tournament_championships);
  const rightChampionships = toInteger(right.tournament_championships);
  if (leftChampionships !== rightChampionships) {
    return rightChampionships - leftChampionships;
  }

  const leftWins = toInteger(left.tournament_match_wins);
  const rightWins = toInteger(right.tournament_match_wins);
  if (leftWins !== rightWins) {
    return rightWins - leftWins;
  }

  const leftCheckedIn = toInteger(left.tournaments_checked_in);
  const rightCheckedIn = toInteger(right.tournaments_checked_in);
  if (leftCheckedIn !== rightCheckedIn) {
    return rightCheckedIn - leftCheckedIn;
  }

  const leftLastTournamentAt = new Date(left.last_tournament_at || 0).getTime();
  const rightLastTournamentAt = new Date(right.last_tournament_at || 0).getTime();
  if (leftLastTournamentAt !== rightLastTournamentAt) {
    return rightLastTournamentAt - leftLastTournamentAt;
  }

  return toInteger(left.user_id) - toInteger(right.user_id);
}

function rankTournamentProfiles(profiles = []) {
  const activeProfiles = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => {
      const normalized = createTournamentCommunityProfile(profile);
      const matchesPlayed = toInteger(normalized.tournament_matches_played);
      const matchWins = toInteger(normalized.tournament_match_wins);
      const matchLosses = Math.max(0, matchesPlayed - matchWins);
      const tournamentPoints = computeTournamentRankingPoints(normalized);

      return createTournamentCommunityProfile({
        ...normalized,
        tournament_points: tournamentPoints,
        tournament_match_losses: matchLosses,
        tournament_win_rate: matchesPlayed > 0 ? (matchWins / matchesPlayed) * 100 : 0,
      });
    })
    .sort(compareTournamentProfiles);

  let currentRank = 0;

  return activeProfiles.map((profile, index) => {
    if (hasTournamentActivity(profile)) {
      currentRank = index + 1;
    }

    return createTournamentCommunityProfile({
      ...profile,
      tournament_rank: hasTournamentActivity(profile) ? currentRank : null,
    });
  });
}

function buildExecutor(connection = null) {
  if (connection) {
    return async (sql, params = []) => {
      const [rows] = await connection.query(sql, params);
      return rows;
    };
  }

  return async (sql, params = []) => query(sql, params);
}

async function buildTournamentRankingMap({ connection = null } = {}) {
  const execute = buildExecutor(connection);
  const profileByUserId = new Map();

  function ensureProfile(userId) {
    const normalizedUserId = toInteger(userId);
    if (!normalizedUserId) {
      return null;
    }

    if (!profileByUserId.has(normalizedUserId)) {
      profileByUserId.set(
        normalizedUserId,
        createTournamentCommunityProfile({ user_id: normalizedUserId })
      );
    }

    return profileByUserId.get(normalizedUserId);
  }

  const registrationRows = await execute(
    `
      SELECT
        tr.user_id,
        COUNT(DISTINCT CASE
          WHEN tr.status <> 'waitlisted' THEN tr.registration_id
          ELSE NULL
        END) AS tournament_entries,
        COUNT(DISTINCT CASE
          WHEN tr.status = 'registered' AND tr.attendance_status = 'checked_in'
          THEN tr.registration_id
          ELSE NULL
        END) AS tournaments_checked_in,
        COUNT(DISTINCT CASE
          WHEN tr.attendance_status = 'no_show' THEN tr.registration_id
          ELSE NULL
        END) AS tournaments_no_show,
        MAX(CASE
          WHEN tr.status <> 'waitlisted' THEN t.start_at
          ELSE NULL
        END) AS last_tournament_at
      FROM tournament_registrations tr
      JOIN tournaments t ON t.tournament_id = tr.tournament_id
      GROUP BY tr.user_id
    `
  );

  registrationRows.forEach((row) => {
    const profile = ensureProfile(row.user_id);
    if (!profile) {
      return;
    }

    profile.tournament_entries = toInteger(row.tournament_entries);
    profile.tournaments_checked_in = toInteger(row.tournaments_checked_in);
    profile.tournaments_no_show = toInteger(row.tournaments_no_show);
    profile.last_tournament_at = row.last_tournament_at || null;
  });

  const matchRows = await execute(
    `
      SELECT
        participants.user_id,
        COUNT(*) AS tournament_matches_played
      FROM (
        SELECT tr_slot_one.user_id, tbm.match_id
        FROM tournament_bracket_matches tbm
        JOIN tournament_registrations tr_slot_one
          ON tr_slot_one.registration_id = tbm.slot_one_registration_id
        WHERE tbm.status = 'completed'
        AND tbm.slot_one_registration_id IS NOT NULL
        AND tbm.slot_two_registration_id IS NOT NULL

        UNION ALL

        SELECT tr_slot_two.user_id, tbm.match_id
        FROM tournament_bracket_matches tbm
        JOIN tournament_registrations tr_slot_two
          ON tr_slot_two.registration_id = tbm.slot_two_registration_id
        WHERE tbm.status = 'completed'
        AND tbm.slot_one_registration_id IS NOT NULL
        AND tbm.slot_two_registration_id IS NOT NULL
      ) AS participants
      GROUP BY participants.user_id
    `
  );

  matchRows.forEach((row) => {
    const profile = ensureProfile(row.user_id);
    if (!profile) {
      return;
    }

    profile.tournament_matches_played = toInteger(row.tournament_matches_played);
  });

  const winRows = await execute(
    `
      SELECT
        tr.user_id,
        COUNT(*) AS tournament_match_wins
      FROM tournament_bracket_matches tbm
      JOIN tournament_registrations tr
        ON tr.registration_id = tbm.winner_registration_id
      WHERE tbm.status = 'completed'
      AND tbm.winner_registration_id IS NOT NULL
      GROUP BY tr.user_id
    `
  );

  winRows.forEach((row) => {
    const profile = ensureProfile(row.user_id);
    if (!profile) {
      return;
    }

    profile.tournament_match_wins = toInteger(row.tournament_match_wins);
  });

  const championshipRows = await execute(
    `
      SELECT
        champion.user_id,
        COUNT(*) AS tournament_championships
      FROM tournament_bracket_matches tbm
      JOIN (
        SELECT tournament_id, MAX(round_number) AS final_round
        FROM tournament_bracket_matches
        GROUP BY tournament_id
      ) finals
        ON finals.tournament_id = tbm.tournament_id
        AND finals.final_round = tbm.round_number
      JOIN tournament_registrations champion
        ON champion.registration_id = tbm.winner_registration_id
      WHERE tbm.status IN ('completed', 'walkover')
      AND tbm.winner_registration_id IS NOT NULL
      GROUP BY champion.user_id
    `
  );

  championshipRows.forEach((row) => {
    const profile = ensureProfile(row.user_id);
    if (!profile) {
      return;
    }

    profile.tournament_championships = toInteger(row.tournament_championships);
  });

  const runnerUpRows = await execute(
    `
      SELECT
        runner_up.user_id,
        COUNT(*) AS tournament_runner_up_finishes
      FROM tournament_bracket_matches tbm
      JOIN (
        SELECT tournament_id, MAX(round_number) AS final_round
        FROM tournament_bracket_matches
        GROUP BY tournament_id
      ) finals
        ON finals.tournament_id = tbm.tournament_id
        AND finals.final_round = tbm.round_number
      JOIN tournament_registrations runner_up
        ON runner_up.registration_id = tbm.loser_registration_id
      WHERE tbm.status IN ('completed', 'walkover')
      AND tbm.loser_registration_id IS NOT NULL
      GROUP BY runner_up.user_id
    `
  );

  runnerUpRows.forEach((row) => {
    const profile = ensureProfile(row.user_id);
    if (!profile) {
      return;
    }

    profile.tournament_runner_up_finishes = toInteger(
      row.tournament_runner_up_finishes
    );
  });

  const gameRows = await execute(
    `
      SELECT
        game_counts.user_id,
        game_counts.game_title
      FROM (
        SELECT
          tr.user_id,
          t.game_title,
          COUNT(*) AS entry_count,
          MAX(t.start_at) AS latest_start_at
        FROM tournament_registrations tr
        JOIN tournaments t ON t.tournament_id = tr.tournament_id
        WHERE tr.status <> 'waitlisted'
        GROUP BY tr.user_id, t.game_title
      ) AS game_counts
      ORDER BY
        game_counts.user_id ASC,
        game_counts.entry_count DESC,
        game_counts.latest_start_at DESC,
        game_counts.game_title ASC
    `
  );

  const capturedFavoriteGameByUserId = new Set();
  gameRows.forEach((row) => {
    const userId = toInteger(row.user_id);
    const profile = ensureProfile(userId);
    if (!profile || capturedFavoriteGameByUserId.has(userId)) {
      return;
    }

    profile.most_played_tournament_game = normalizeText(row.game_title);
    capturedFavoriteGameByUserId.add(userId);
  });

  const rankedProfiles = rankTournamentProfiles([...profileByUserId.values()]);
  return new Map(rankedProfiles.map((profile) => [profile.user_id, profile]));
}

async function attachTournamentProfilesToUsers(userRows = [], { connection = null } = {}) {
  const rows = Array.isArray(userRows) ? userRows : [];
  if (!rows.length) {
    return [];
  }

  const rankingMap = await buildTournamentRankingMap({ connection });

  return rows.map((row) => {
    const userId = toInteger(row.uid || row.user_id || row.id);
    const profile = rankingMap.get(userId) || createTournamentCommunityProfile({ user_id: userId });
    const gamerTag = normalizeText(row.gamer_tag);
    const favoriteGame = normalizeText(row.favorite_game);
    const playerBio = normalizeText(row.player_bio);
    const name = normalizeText(row.name, "Player");

    return {
      ...row,
      gamer_tag: gamerTag,
      favorite_game: favoriteGame,
      player_bio: playerBio,
      display_name: gamerTag || name,
      ...profile,
    };
  });
}

async function listTournamentLeaderboard({ limit = 10, connection = null } = {}) {
  const execute = buildExecutor(connection);
  const normalizedLimit = Math.min(50, Math.max(1, toInteger(limit, 10)));
  const userRows = await execute(
    `
      SELECT
        uid,
        name,
        email,
        mobile,
        loyalty_points,
        COALESCE(avatar, '') AS avatar,
        COALESCE(gamer_tag, '') AS gamer_tag,
        COALESCE(favorite_game, '') AS favorite_game,
        COALESCE(player_bio, '') AS player_bio
      FROM users
      ORDER BY uid ASC
    `
  );

  const enrichedUsers = await attachTournamentProfilesToUsers(userRows, { connection });

  return enrichedUsers
    .filter((row) => hasTournamentActivity(row))
    .sort(compareTournamentProfiles)
    .slice(0, normalizedLimit);
}

module.exports = {
  TOURNAMENT_RANKING_WEIGHTS,
  attachTournamentProfilesToUsers,
  buildTournamentRankingMap,
  compareTournamentProfiles,
  computeTournamentRankingPoints,
  createTournamentCommunityProfile,
  hasTournamentActivity,
  listTournamentLeaderboard,
  rankTournamentProfiles,
};
