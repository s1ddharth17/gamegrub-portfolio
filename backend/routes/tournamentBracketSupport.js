const {
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_TYPE_SOLO,
  isResolvedTournamentMatchStatus,
  normalizePositiveInteger,
  normalizeTournamentMatchStatus,
  normalizeTournamentRegistrationStatus,
} = require("../utils/tournaments");

function sortRegistrationsForBracketOps(registrations) {
  return [...registrations].sort((left, right) => {
    const rankStatus = (status) => {
      const normalized = normalizeTournamentRegistrationStatus(status);
      if (normalized === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
        return 0;
      }

      if (normalized === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
        return 1;
      }

      return 2;
    };

    const leftStatusRank = rankStatus(left.status || left.registration_status);
    const rightStatusRank = rankStatus(right.status || right.registration_status);

    if (leftStatusRank !== rightStatusRank) {
      return leftStatusRank - rightStatusRank;
    }

    if (leftStatusRank === 1) {
      const leftWaitlistedAt = new Date(left.waitlisted_at || left.created_at || 0).getTime();
      const rightWaitlistedAt = new Date(right.waitlisted_at || right.created_at || 0).getTime();

      if (leftWaitlistedAt !== rightWaitlistedAt) {
        return leftWaitlistedAt - rightWaitlistedAt;
      }
    }

    const leftSeed = Number(left.seed_number || 0);
    const rightSeed = Number(right.seed_number || 0);

    if (leftSeed && rightSeed && leftSeed !== rightSeed) {
      return leftSeed - rightSeed;
    }

    if (leftSeed && !rightSeed) {
      return -1;
    }

    if (!leftSeed && rightSeed) {
      return 1;
    }

    return Number(left.registration_id || 0) - Number(right.registration_id || 0);
  });
}

function getTournamentBracketRoundLabel(roundNumber, totalRounds) {
  const normalizedRoundNumber = normalizePositiveInteger(roundNumber, 1);
  const normalizedTotalRounds = Math.max(1, normalizePositiveInteger(totalRounds, 1));
  const roundsRemaining = Math.max(1, normalizedTotalRounds - normalizedRoundNumber + 1);

  if (normalizedTotalRounds === 1 || roundsRemaining === 1) {
    return "Final";
  }

  if (roundsRemaining === 2) {
    return "Semifinals";
  }

  if (roundsRemaining === 3) {
    return "Quarterfinals";
  }

  return `Round of ${Math.pow(2, roundsRemaining)}`;
}

function buildTournamentBracketEntrant(participantsById, registrationId, seedNumber) {
  const normalizedRegistrationId = Number(registrationId || 0);
  if (!normalizedRegistrationId) {
    return null;
  }

  const participant = participantsById.get(normalizedRegistrationId);
  const normalizedSeedNumber = seedNumber ? normalizePositiveInteger(seedNumber, 0) || null : null;
  if (!participant) {
    return {
      registration_id: normalizedRegistrationId,
      participant_name: "Unknown player",
      participant_email: "",
      participant_mobile: "",
      team_name: "",
      roster_count: 0,
      registration_type: TOURNAMENT_REGISTRATION_TYPE_SOLO,
      attendance_status: TOURNAMENT_ATTENDANCE_STATUS_PENDING,
      seed_number: normalizedSeedNumber,
      display_name: `Registration #${normalizedRegistrationId}`,
    };
  }

  return {
    ...participant,
    seed_number: normalizedSeedNumber || participant.seed_number || null,
    display_name: participant.team_name || participant.participant_name || "Unknown player",
  };
}

function serializeTournamentBracketMatch(matchRow, participantsById, totalRounds) {
  const status = normalizeTournamentMatchStatus(matchRow.status);
  const slotOne = buildTournamentBracketEntrant(
    participantsById,
    matchRow.slot_one_registration_id,
    matchRow.slot_one_seed_number
  );
  const slotTwo = buildTournamentBracketEntrant(
    participantsById,
    matchRow.slot_two_registration_id,
    matchRow.slot_two_seed_number
  );
  const winner = buildTournamentBracketEntrant(
    participantsById,
    matchRow.winner_registration_id,
    slotOne?.registration_id === Number(matchRow.winner_registration_id || 0)
      ? slotOne?.seed_number
      : slotTwo?.seed_number
  );
  const loser = buildTournamentBracketEntrant(
    participantsById,
    matchRow.loser_registration_id,
    slotOne?.registration_id === Number(matchRow.loser_registration_id || 0)
      ? slotOne?.seed_number
      : slotTwo?.seed_number
  );

  return {
    match_id: Number(matchRow.match_id || 0),
    tournament_id: Number(matchRow.tournament_id || 0),
    round_number: normalizePositiveInteger(matchRow.round_number, 1),
    match_number: normalizePositiveInteger(matchRow.match_number, 1),
    round_label: getTournamentBracketRoundLabel(matchRow.round_number, totalRounds),
    status,
    slot_one_score:
      matchRow.slot_one_score === null || matchRow.slot_one_score === undefined
        ? null
        : Number(matchRow.slot_one_score),
    slot_two_score:
      matchRow.slot_two_score === null || matchRow.slot_two_score === undefined
        ? null
        : Number(matchRow.slot_two_score),
    slot_one: slotOne,
    slot_two: slotTwo,
    winner_registration_id: matchRow.winner_registration_id
      ? Number(matchRow.winner_registration_id)
      : null,
    loser_registration_id: matchRow.loser_registration_id
      ? Number(matchRow.loser_registration_id)
      : null,
    winner,
    loser,
    notes: matchRow.notes || "",
    completed_at: matchRow.completed_at || null,
    is_decided: isResolvedTournamentMatchStatus(status),
    is_walkover: status === TOURNAMENT_MATCH_STATUS_WALKOVER,
    can_report_result: status === TOURNAMENT_MATCH_STATUS_PENDING && Boolean(slotOne && slotTwo),
  };
}

function getAutoResolvedBracketNotes(match) {
  if (match.winner_registration_id) {
    return "Auto-advanced on a bye.";
  }

  return "Bracket branch closed without an eligible participant.";
}

function getBracketMatchSeedNumber(match, registrationId) {
  const normalizedRegistrationId = Number(registrationId || 0);
  if (!normalizedRegistrationId) {
    return null;
  }

  if (Number(match.slot_one_registration_id || 0) === normalizedRegistrationId) {
    return normalizePositiveInteger(match.slot_one_seed_number, 0) || null;
  }

  if (Number(match.slot_two_registration_id || 0) === normalizedRegistrationId) {
    return normalizePositiveInteger(match.slot_two_seed_number, 0) || null;
  }

  return null;
}

function normalizeOptionalMatchScore(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

module.exports = {
  buildTournamentBracketEntrant,
  getAutoResolvedBracketNotes,
  getBracketMatchSeedNumber,
  getTournamentBracketRoundLabel,
  normalizeOptionalMatchScore,
  serializeTournamentBracketMatch,
  sortRegistrationsForBracketOps,
};
