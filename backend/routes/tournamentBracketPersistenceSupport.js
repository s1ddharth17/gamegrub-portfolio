const { query } = require("../utils/db");
const {
  TOURNAMENT_MATCH_STATUS_COMPLETED,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
  isResolvedTournamentMatchStatus,
  normalizePositiveInteger,
  normalizeTournamentMatchStatus,
  serializeTournamentRegistration,
} = require("../utils/tournaments");
const {
  getAutoResolvedBracketNotes,
  getBracketMatchSeedNumber,
  getTournamentBracketRoundLabel,
  serializeTournamentBracketMatch,
} = require("./tournamentBracketSupport");
const { attachRegistrationRelations } = require("./tournamentRegistrationSupport");

async function replaceTournamentBracketSeeds(connection, tournamentId, seeds) {
  await connection.query(
    `
      DELETE FROM tournament_bracket_seeds
      WHERE tournament_id = ?
    `,
    [tournamentId]
  );

  for (const seed of seeds) {
    await connection.query(
      `
        INSERT INTO tournament_bracket_seeds (
          tournament_id,
          registration_id,
          seed_number,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
      `,
      [tournamentId, seed.registration_id, seed.seed_number]
    );
  }
}

async function getTournamentBracketPayload(tournamentId, connection = null) {
  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;

  const matchRows = await executor(
    `
      SELECT *
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      ORDER BY round_number ASC, match_number ASC
    `,
    [tournamentId]
  );

  if (!matchRows.length) {
    return {
      tournament_id: Number(tournamentId || 0),
      has_bracket: false,
      match_count: 0,
      completed_match_count: 0,
      round_count: 0,
      champion_registration_id: null,
      champion: null,
      rounds: [],
    };
  }

  const registrationIds = [...new Set(
    matchRows
      .flatMap((row) => [
        Number(row.slot_one_registration_id || 0),
        Number(row.slot_two_registration_id || 0),
        Number(row.winner_registration_id || 0),
        Number(row.loser_registration_id || 0),
      ])
      .filter((value) => value > 0)
  )];

  let participantsById = new Map();
  if (registrationIds.length) {
    const placeholders = registrationIds.map(() => "?").join(", ");
    const registrationRows = await executor(
      `
        SELECT *
        FROM tournament_registrations
        WHERE registration_id IN (${placeholders})
      `,
      registrationIds
    );
    const withRelations = await attachRegistrationRelations(registrationRows, connection);
    participantsById = new Map(
      withRelations.map((row) => [
        Number(row.registration_id || 0),
        serializeTournamentRegistration(row),
      ])
    );
  }

  const totalRounds = matchRows.reduce(
    (maximum, row) => Math.max(maximum, normalizePositiveInteger(row.round_number, 1)),
    0
  );
  const rounds = [];

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    const roundMatches = matchRows
      .filter((row) => normalizePositiveInteger(row.round_number, 1) === roundNumber)
      .map((row) => serializeTournamentBracketMatch(row, participantsById, totalRounds));

    rounds.push({
      round_number: roundNumber,
      label: getTournamentBracketRoundLabel(roundNumber, totalRounds),
      matches: roundMatches,
    });
  }

  const championshipMatch =
    rounds.length && rounds[rounds.length - 1].matches.length
      ? rounds[rounds.length - 1].matches[0]
      : null;
  const completedMatchCount = matchRows.filter((row) =>
    isResolvedTournamentMatchStatus(row.status)
  ).length;

  return {
    tournament_id: Number(tournamentId || 0),
    has_bracket: true,
    match_count: matchRows.length,
    completed_match_count: completedMatchCount,
    round_count: totalRounds,
    champion_registration_id: championshipMatch?.winner_registration_id || null,
    champion: championshipMatch?.winner || null,
    rounds,
  };
}

async function countTournamentCompletedBracketResults(connection, tournamentId) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      AND status = ?
    `,
    [tournamentId, TOURNAMENT_MATCH_STATUS_COMPLETED]
  );

  return Number(rows[0]?.total || 0);
}

async function resetTournamentBracketMatches(connection, tournamentId) {
  await connection.query(
    `
      DELETE FROM tournament_bracket_matches
      WHERE tournament_id = ?
    `,
    [tournamentId]
  );
}

async function resetTournamentBracketIfEditable(connection, tournamentId) {
  const completedResultCount = await countTournamentCompletedBracketResults(connection, tournamentId);

  if (completedResultCount > 0) {
    const error = new Error(
      "Bracket results have already been reported. Resetting the live bracket is not supported yet."
    );
    error.statusCode = 400;
    throw error;
  }

  await resetTournamentBracketMatches(connection, tournamentId);
}

async function replaceTournamentBracketMatches(connection, tournamentId, bracket) {
  await resetTournamentBracketMatches(connection, tournamentId);

  const matchIdByKey = new Map();

  for (const match of bracket.matches) {
    const sourceMatchOneId = match.source_match_one_key
      ? matchIdByKey.get(match.source_match_one_key) || null
      : null;
    const sourceMatchTwoId = match.source_match_two_key
      ? matchIdByKey.get(match.source_match_two_key) || null
      : null;
    const isWalkover = normalizeTournamentMatchStatus(match.status) === TOURNAMENT_MATCH_STATUS_WALKOVER;
    const [result] = await connection.query(
      `
        INSERT INTO tournament_bracket_matches (
          tournament_id,
          round_number,
          match_number,
          source_match_one_id,
          source_match_two_id,
          slot_one_registration_id,
          slot_two_registration_id,
          slot_one_seed_number,
          slot_two_seed_number,
          slot_one_score,
          slot_two_score,
          winner_registration_id,
          loser_registration_id,
          status,
          notes,
          completed_at,
          reported_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NOW(), NOW())
      `,
      [
        tournamentId,
        match.round_number,
        match.match_number,
        sourceMatchOneId,
        sourceMatchTwoId,
        match.slot_one_registration_id || null,
        match.slot_two_registration_id || null,
        match.slot_one_seed_number || null,
        match.slot_two_seed_number || null,
        match.winner_registration_id || null,
        match.loser_registration_id || null,
        normalizeTournamentMatchStatus(match.status),
        isWalkover ? getAutoResolvedBracketNotes(match) : null,
        isWalkover ? new Date() : null,
      ]
    );

    matchIdByKey.set(match.key, Number(result.insertId || 0));
  }
}

async function maybeAutoResolveTournamentBracketMatch(connection, tournamentId, matchId) {
  const [matchRows] = await connection.query(
    `
      SELECT *
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      AND match_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [tournamentId, matchId]
  );

  const match = matchRows[0];
  if (!match) {
    return null;
  }

  if (normalizeTournamentMatchStatus(match.status) !== TOURNAMENT_MATCH_STATUS_PENDING) {
    return match;
  }

  const sourceMatchOneId = Number(match.source_match_one_id || 0) || null;
  const sourceMatchTwoId = Number(match.source_match_two_id || 0) || null;
  let sourceMatchOne = null;
  let sourceMatchTwo = null;

  if (sourceMatchOneId) {
    const [sourceRows] = await connection.query(
      `
        SELECT *
        FROM tournament_bracket_matches
        WHERE tournament_id = ?
        AND match_id = ?
        LIMIT 1
      `,
      [tournamentId, sourceMatchOneId]
    );
    sourceMatchOne = sourceRows[0] || null;
  }

  if (sourceMatchTwoId) {
    const [sourceRows] = await connection.query(
      `
        SELECT *
        FROM tournament_bracket_matches
        WHERE tournament_id = ?
        AND match_id = ?
        LIMIT 1
      `,
      [tournamentId, sourceMatchTwoId]
    );
    sourceMatchTwo = sourceRows[0] || null;
  }

  const slotOneRegistrationId = Number(match.slot_one_registration_id || 0) || null;
  const slotTwoRegistrationId = Number(match.slot_two_registration_id || 0) || null;
  const sourceMatchOneResolved = sourceMatchOne
    ? isResolvedTournamentMatchStatus(sourceMatchOne.status)
    : !sourceMatchOneId;
  const sourceMatchTwoResolved = sourceMatchTwo
    ? isResolvedTournamentMatchStatus(sourceMatchTwo.status)
    : !sourceMatchTwoId;

  let winnerRegistrationId = null;
  let loserRegistrationId = null;

  if (slotOneRegistrationId && !slotTwoRegistrationId && sourceMatchTwoResolved) {
    winnerRegistrationId = slotOneRegistrationId;
  } else if (!slotOneRegistrationId && slotTwoRegistrationId && sourceMatchOneResolved) {
    winnerRegistrationId = slotTwoRegistrationId;
  } else if (
    slotOneRegistrationId ||
    slotTwoRegistrationId ||
    (sourceMatchOneResolved && sourceMatchTwoResolved)
  ) {
    if (slotOneRegistrationId || slotTwoRegistrationId) {
      return match;
    }
  } else {
    return match;
  }

  if (winnerRegistrationId) {
    loserRegistrationId =
      winnerRegistrationId === slotOneRegistrationId ? slotTwoRegistrationId : slotOneRegistrationId;
  }

  await connection.query(
    `
      UPDATE tournament_bracket_matches
      SET
        winner_registration_id = ?,
        loser_registration_id = ?,
        status = ?,
        notes = ?,
        completed_at = NOW(),
        reported_by = NULL,
        updated_at = NOW()
      WHERE tournament_id = ?
      AND match_id = ?
    `,
    [
      winnerRegistrationId,
      loserRegistrationId,
      TOURNAMENT_MATCH_STATUS_WALKOVER,
      getAutoResolvedBracketNotes({
        winner_registration_id: winnerRegistrationId,
      }),
      tournamentId,
      matchId,
    ]
  );

  await propagateTournamentBracketResolution(connection, tournamentId, matchId);

  const [updatedRows] = await connection.query(
    `
      SELECT *
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      AND match_id = ?
      LIMIT 1
    `,
    [tournamentId, matchId]
  );

  return updatedRows[0] || null;
}

async function propagateTournamentBracketResolution(connection, tournamentId, matchId) {
  const [resolvedMatchRows] = await connection.query(
    `
      SELECT *
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      AND match_id = ?
      LIMIT 1
    `,
    [tournamentId, matchId]
  );

  const resolvedMatch = resolvedMatchRows[0];
  if (!resolvedMatch) {
    return;
  }

  const winnerRegistrationId = Number(resolvedMatch.winner_registration_id || 0) || null;
  const winnerSeedNumber = winnerRegistrationId
    ? getBracketMatchSeedNumber(resolvedMatch, winnerRegistrationId)
    : null;
  const [nextMatchRows] = await connection.query(
    `
      SELECT *
      FROM tournament_bracket_matches
      WHERE tournament_id = ?
      AND (source_match_one_id = ? OR source_match_two_id = ?)
      ORDER BY round_number ASC, match_number ASC
    `,
    [tournamentId, matchId, matchId]
  );

  for (const nextMatch of nextMatchRows) {
    const updates = [];
    const params = [];

    if (Number(nextMatch.source_match_one_id || 0) === Number(matchId)) {
      updates.push("slot_one_registration_id = ?", "slot_one_seed_number = ?");
      params.push(winnerRegistrationId, winnerSeedNumber);
    }

    if (Number(nextMatch.source_match_two_id || 0) === Number(matchId)) {
      updates.push("slot_two_registration_id = ?", "slot_two_seed_number = ?");
      params.push(winnerRegistrationId, winnerSeedNumber);
    }

    if (!updates.length) {
      continue;
    }

    params.push(tournamentId, Number(nextMatch.match_id || 0));

    await connection.query(
      `
        UPDATE tournament_bracket_matches
        SET
          ${updates.join(", ")},
          updated_at = NOW()
        WHERE tournament_id = ?
        AND match_id = ?
      `,
      params
    );

    await maybeAutoResolveTournamentBracketMatch(
      connection,
      tournamentId,
      Number(nextMatch.match_id || 0)
    );
  }
}

module.exports = {
  getTournamentBracketPayload,
  maybeAutoResolveTournamentBracketMatch,
  propagateTournamentBracketResolution,
  replaceTournamentBracketMatches,
  replaceTournamentBracketSeeds,
  resetTournamentBracketIfEditable,
};
