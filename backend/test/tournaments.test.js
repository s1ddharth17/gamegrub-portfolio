const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
  TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
  TOURNAMENT_OPERATIONS_STAGE_SEEDING,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_TYPE_TEAM,
  TOURNAMENT_STATUS_PUBLISHED,
  buildSingleEliminationSeedOrder,
  canHandoffTournamentToBrackets,
  canJoinTournamentWaitlist,
  canManageTournamentAttendance,
  canPlaceTournamentRegistrationOnWaitlist,
  canPromoteWaitlistedTournamentRegistration,
  canRegisterForTournament,
  canReinstateTournamentRegistration,
  canWithdrawTournamentRegistration,
  createSingleEliminationBracket,
  normalizeTournamentAttendanceStatus,
  normalizeTournamentFormat,
  normalizeTournamentMatchStatus,
  normalizeTournamentOperationsStage,
  normalizeTournamentRegistrationType,
  normalizeTournamentRegistrationStatus,
  normalizeTournamentStatus,
  parseTournamentInput,
  serializeTournament,
  serializeTournamentRegistration,
  serializeTournamentRosterMember,
  slugifyTournamentTitle,
} = require("../utils/tournaments");

test("slugifyTournamentTitle creates a stable URL-safe slug", () => {
  assert.equal(slugifyTournamentTitle("Valorant City Clash 2026!"), "valorant-city-clash-2026");
});

test("normalizeTournamentFormat and status fall back safely", () => {
  assert.equal(normalizeTournamentFormat("DUO"), "duo");
  assert.equal(normalizeTournamentFormat("unknown"), "solo");
  assert.equal(normalizeTournamentStatus("PUBLISHED"), "published");
  assert.equal(normalizeTournamentStatus("mystery"), "draft");
  assert.equal(normalizeTournamentOperationsStage("SEEDING"), "seeding");
  assert.equal(normalizeTournamentOperationsStage("mystery"), "registrations");
  assert.equal(normalizeTournamentRegistrationType("TEAM"), "team");
  assert.equal(normalizeTournamentRegistrationType("mystery"), "solo");
  assert.equal(normalizeTournamentRegistrationStatus("WAITLISTED"), "waitlisted");
  assert.equal(normalizeTournamentRegistrationStatus("CANCELLED"), "cancelled");
  assert.equal(normalizeTournamentRegistrationStatus("mystery"), "registered");
  assert.equal(normalizeTournamentAttendanceStatus("CHECKED_IN"), "checked_in");
  assert.equal(normalizeTournamentAttendanceStatus("mystery"), "pending");
  assert.equal(normalizeTournamentMatchStatus("WALKOVER"), "walkover");
  assert.equal(normalizeTournamentMatchStatus("mystery"), "pending");
});

test("parseTournamentInput validates schedule and required fields", () => {
  const result = parseTournamentInput({
    title: "Apex Night Cup",
    game_title: "Apex Legends",
    format: "duo",
    max_participants: 32,
    start_at: "2026-05-03T19:00:00.000Z",
    end_at: "2026-05-03T18:00:00.000Z",
    registration_close_at: "2026-05-03T20:00:00.000Z",
  });

  assert.equal(result.errors.includes("Tournament end time must be after the start time."), true);
  assert.equal(
    result.errors.includes("Registration must close before the tournament starts."),
    true
  );
});

test("parseTournamentInput validates sponsor and premium monetization fields", () => {
  const result = parseTournamentInput({
    title: "Sponsor Cup",
    game_title: "FC 26",
    format: "solo",
    max_participants: 16,
    start_at: "2026-05-12T19:00:00.000Z",
    is_sponsored: true,
    sponsor_name: "",
    is_premium: true,
    premium_entry_fee: 0,
  });

  assert.equal(
    result.errors.includes("Sponsor name is required for sponsored tournaments."),
    true
  );
  assert.equal(
    result.errors.includes("Premium tournaments must include a premium entry fee."),
    true
  );
});

test("parseTournamentInput rejects inline cover image data URLs", () => {
  const result = parseTournamentInput({
    title: "Arena Open",
    game_title: "Valorant",
    format: "solo",
    max_participants: 16,
    start_at: "2026-05-12T19:00:00.000Z",
    cover_image: "data:image/png;base64,aGVsbG8=",
  });

  assert.equal(
    result.errors.includes(
      "Tournament cover image must be an uploaded file path or a normal hosted URL. Inline data URLs are not supported."
    ),
    true
  );
});

test("parseTournamentInput validates tournament skill levels for discovery", () => {
  const valid = parseTournamentInput({
    title: "Newcomer Cup",
    game_title: "Valorant",
    format: "solo",
    max_participants: 16,
    start_at: "2026-11-12T19:00:00.000Z",
    skill_level: "beginner",
  });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.data.skill_level, "beginner");

  const invalid = parseTournamentInput({
    title: "Unrated Cup",
    game_title: "Valorant",
    format: "solo",
    max_participants: 16,
    start_at: "2026-11-12T19:00:00.000Z",
    skill_level: "elite-pro",
  });
  assert.equal(
    invalid.errors.includes("Choose a valid tournament skill level."),
    true,
  );
});

test("canRegisterForTournament respects publication, timing, and available slots", () => {
  const tournament = {
    status: TOURNAMENT_STATUS_PUBLISHED,
    max_participants: 16,
    registered_count: 8,
    start_at: "2026-05-05T18:00:00.000Z",
    registration_open_at: "2026-05-01T00:00:00.000Z",
    registration_close_at: "2026-05-05T15:00:00.000Z",
  };

  assert.equal(
    canRegisterForTournament(tournament, new Date("2026-05-04T12:00:00.000Z")),
    true
  );
  assert.equal(
    canRegisterForTournament(tournament, new Date("2026-05-05T16:00:00.000Z")),
    false
  );

  assert.equal(
    canJoinTournamentWaitlist(
      {
        ...tournament,
        registered_count: 16,
      },
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );
});

test("canWithdrawTournamentRegistration only allows active registrations before start", () => {
  assert.equal(
    canWithdrawTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    canWithdrawTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    canWithdrawTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      new Date("2026-05-05T19:00:00.000Z")
    ),
    false
  );
});

test("canReinstateTournamentRegistration blocks full or locked tournaments", () => {
  assert.equal(
    canReinstateTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
        max_participants: 16,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      15,
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    canReinstateTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
        max_participants: 16,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      16,
      new Date("2026-05-04T12:00:00.000Z")
    ),
    false
  );

  assert.equal(
    canReinstateTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
        max_participants: 16,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      5,
      new Date("2026-05-05T19:00:00.000Z")
    ),
    false
  );
});

test("waitlist transitions respect timing and field capacity", () => {
  assert.equal(
    canPlaceTournamentRegistrationOnWaitlist(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    canPromoteWaitlistedTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
        max_participants: 16,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      15,
      new Date("2026-05-04T12:00:00.000Z")
    ),
    true
  );

  assert.equal(
    canPromoteWaitlistedTournamentRegistration(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
        registration_status: TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
        max_participants: 16,
        start_at: "2026-05-05T18:00:00.000Z",
      },
      16,
      new Date("2026-05-04T12:00:00.000Z")
    ),
    false
  );
});

test("canHandoffTournamentToBrackets requires a full seeded field", () => {
  assert.equal(
    canHandoffTournamentToBrackets(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
      },
      8,
      8
    ),
    true
  );

  assert.equal(
    canHandoffTournamentToBrackets(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
      },
      8,
      7
    ),
    false
  );
});

test("canManageTournamentAttendance only allows active registrations on active tournaments", () => {
  assert.equal(
    canManageTournamentAttendance(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
      },
      {
        status: TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
      }
    ),
    true
  );

  assert.equal(
    canManageTournamentAttendance(
      {
        status: TOURNAMENT_STATUS_PUBLISHED,
      },
      {
        status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
      }
    ),
    false
  );
});

test("buildSingleEliminationSeedOrder follows standard bracket placement", () => {
  assert.deepEqual(buildSingleEliminationSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("createSingleEliminationBracket auto-advances byes while preserving seeded paths", () => {
  const bracket = createSingleEliminationBracket([
    { registration_id: 101, seed_number: 1 },
    { registration_id: 102, seed_number: 2 },
    { registration_id: 103, seed_number: 3 },
    { registration_id: 104, seed_number: 4 },
    { registration_id: 105, seed_number: 5 },
    { registration_id: 106, seed_number: 6 },
  ]);

  assert.equal(bracket.bracket_size, 8);
  assert.equal(bracket.round_count, 3);
  assert.equal(bracket.matches.length, 7);

  const firstQuarterfinal = bracket.matches.find(
    (match) => match.round_number === 1 && match.match_number === 1
  );
  const thirdQuarterfinal = bracket.matches.find(
    (match) => match.round_number === 1 && match.match_number === 3
  );
  const firstSemifinal = bracket.matches.find(
    (match) => match.round_number === 2 && match.match_number === 1
  );
  const final = bracket.matches.find(
    (match) => match.round_number === 3 && match.match_number === 1
  );

  assert.equal(firstQuarterfinal.status, TOURNAMENT_MATCH_STATUS_WALKOVER);
  assert.equal(firstQuarterfinal.winner_registration_id, 101);
  assert.equal(thirdQuarterfinal.status, TOURNAMENT_MATCH_STATUS_WALKOVER);
  assert.equal(thirdQuarterfinal.winner_registration_id, 102);
  assert.equal(firstSemifinal.status, TOURNAMENT_MATCH_STATUS_PENDING);
  assert.equal(firstSemifinal.slot_one_registration_id, 101);
  assert.equal(firstSemifinal.slot_two_registration_id, null);
  assert.equal(final.status, TOURNAMENT_MATCH_STATUS_PENDING);
  assert.equal(final.slot_one_registration_id, null);
  assert.equal(final.slot_two_registration_id, null);
});

test("serializeTournament exposes numeric values and registration availability", () => {
  const tournament = serializeTournament(
    {
      tournament_id: 7,
      slug: "tekken-royale",
      title: "Tekken Royale",
      game_title: "Tekken 8",
      format: "solo",
      team_size: 1,
      max_participants: 32,
      registered_count: 30,
      entry_fee: "299.00",
      prize_pool: "5000.00",
      is_sponsored: 1,
      sponsor_name: "HyperX",
      sponsor_tagline: "Powered for finals.",
      sponsor_prize_contribution: "2500.00",
      is_premium: 1,
      premium_entry_fee: "149.00",
      premium_label: "VIP lounge",
      premium_perks: "Front-row seating and coaching review.",
      refund_policy: "partial_before_cutoff",
      refund_cutoff_hours: 12,
      refund_percentage: 50,
      location_label: "Main Arena",
      summary: "Open bracket brawler.",
      description: "Bring your main.",
      rules: "Double elimination.",
      cover_image: "",
      status: "published",
      is_featured: 1,
      start_at: "2026-05-09T13:00:00.000Z",
      registration_open_at: "2026-05-01T10:00:00.000Z",
      registration_close_at: "2026-05-09T10:00:00.000Z",
      operations_stage: TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
      bracket_handoff_at: "2026-05-09T11:00:00.000Z",
      seeded_count: 2,
      bracket_match_count: 7,
      completed_bracket_match_count: 3,
      checked_in_count: 1,
      no_show_count: 1,
      waitlist_count: 3,
      registration_id: 31,
      registration_type: TOURNAMENT_REGISTRATION_TYPE_TEAM,
      registration_status: "registered",
      attendance_status: TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
      checked_in_at: "2026-05-09T12:00:00.000Z",
      registered_at: "2026-05-01T10:30:00.000Z",
      team_name: "Main Stage",
      seed_number: 2,
      payment_status: "paid",
      payment_method: "upi",
      premium_access: 1,
      premium_access_fee: "149.00",
      premium_access_label: "VIP lounge",
      amount_due: "448.00",
      amount_paid: "448.00",
      outstanding_amount: "0.00",
      paid_at: "2026-05-01T10:45:00.000Z",
      refund_status: "requested",
      refund_requested_amount: "149.50",
      refund_processed_amount: "0.00",
      refund_requested_at: "2026-05-08T10:45:00.000Z",
      refund_eligible: 1,
      refundable_amount: "149.50",
      roster: [
        {
          member_id: 90,
          slot_number: 1,
          member_name: "Captain Sid",
          member_email: "sid@example.com",
          member_mobile: "9999999999",
          is_captain: 1,
        },
        {
          member_id: 91,
          slot_number: 2,
          member_name: "Ace",
          member_email: "ace@example.com",
          member_mobile: "",
          is_captain: 0,
        },
      ],
    },
    {
      referenceTime: new Date("2026-05-08T12:00:00.000Z"),
    }
  );

  assert.equal(tournament.tournament_id, 7);
  assert.equal(tournament.available_slots, 2);
  assert.equal(tournament.is_featured, true);
  assert.equal(typeof tournament.entry_fee, "number");
  assert.equal(tournament.is_sponsored, true);
  assert.equal(tournament.sponsor_name, "HyperX");
  assert.equal(tournament.effective_prize_pool, 7500);
  assert.equal(tournament.is_premium, true);
  assert.equal(tournament.premium_entry_fee, 149);
  assert.equal(tournament.refund_policy, "partial_before_cutoff");
  assert.equal(tournament.refund_cutoff_hours, 12);
  assert.equal(tournament.refund_percentage, 50);
  assert.equal(tournament.is_registered, true);
  assert.equal(tournament.can_withdraw_registration, true);
  assert.equal(tournament.team_name, "Main Stage");
  assert.equal(tournament.roster_count, 2);
  assert.equal(tournament.roster[0].is_captain, true);
  assert.equal(tournament.operations_stage, TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS);
  assert.equal(tournament.seeded_count, 2);
  assert.equal(tournament.bracket_match_count, 7);
  assert.equal(tournament.completed_bracket_match_count, 3);
  assert.equal(tournament.has_bracket, true);
  assert.equal(tournament.checked_in_count, 1);
  assert.equal(tournament.no_show_count, 1);
  assert.equal(tournament.waitlist_count, 3);
  assert.equal(tournament.pending_check_in_count, 28);
  assert.equal(tournament.seed_number, 2);
  assert.equal(tournament.attendance_status, TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN);
  assert.equal(tournament.is_checked_in, true);
  assert.equal(tournament.payment_status, "paid");
  assert.equal(tournament.payment_method, "upi");
  assert.equal(tournament.premium_access, true);
  assert.equal(tournament.premium_access_fee, 149);
  assert.equal(tournament.amount_due, 448);
  assert.equal(tournament.amount_paid, 448);
  assert.equal(tournament.refund_status, "requested");
  assert.equal(tournament.refund_eligible, true);
  assert.equal(tournament.refundable_amount, 149.5);
  assert.equal(tournament.can_handoff_to_brackets, false);
  assert.equal(tournament.has_registration, true);
  assert.equal(tournament.can_join_waitlist, false);
});

test("serializeTournamentRosterMember normalizes roster metadata", () => {
  const member = serializeTournamentRosterMember({
    member_id: 4,
    slot_number: 2,
    member_name: "Ace",
    member_email: "ace@example.com",
    member_mobile: "8888888888",
    is_captain: 0,
  });

  assert.equal(member.member_id, 4);
  assert.equal(member.slot_number, 2);
  assert.equal(member.member_name, "Ace");
  assert.equal(member.is_captain, false);
});

test("serializeTournamentRegistration exposes participant details cleanly", () => {
  const registration = serializeTournamentRegistration({
    registration_id: 12,
    tournament_id: 7,
    user_id: 44,
    registration_type: TOURNAMENT_REGISTRATION_TYPE_TEAM,
    status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
    participant_name: "Sid",
    participant_email: "sid@example.com",
    participant_mobile: "9999999999",
    team_name: "Night Owls",
    attendance_status: TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
    no_show_marked_at: "2026-05-02T18:30:00.000Z",
    waitlisted_at: "2026-05-01T12:00:00.000Z",
    waitlist_position: 2,
    seed_number: 4,
    roster: [
      {
        member_id: 1,
        slot_number: 1,
        member_name: "Sid",
        member_email: "sid@example.com",
        member_mobile: "9999999999",
        is_captain: 1,
      },
      {
        member_id: 2,
        slot_number: 2,
        member_name: "Ace",
        member_email: "ace@example.com",
        member_mobile: "",
        is_captain: 0,
      },
    ],
    created_at: "2026-05-01T10:30:00.000Z",
    cancelled_at: "2026-05-02T10:30:00.000Z",
    premium_access: 1,
    premium_access_fee: "99.00",
    premium_access_label: "VIP lounge",
  });

  assert.equal(registration.registration_id, 12);
  assert.equal(registration.user_id, 44);
  assert.equal(registration.status, TOURNAMENT_REGISTRATION_STATUS_CANCELLED);
  assert.equal(registration.is_active, false);
  assert.equal(registration.registered_at, "2026-05-01T10:30:00.000Z");
  assert.equal(registration.team_name, "Night Owls");
  assert.equal(registration.roster_count, 2);
  assert.equal(registration.roster[1].member_name, "Ace");
  assert.equal(registration.attendance_status, TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW);
  assert.equal(registration.is_checked_in, false);
  assert.equal(registration.can_manage_attendance, false);
  assert.equal(registration.seed_number, 4);
  assert.equal(registration.waitlist_position, 2);
  assert.equal(registration.premium_access, true);
  assert.equal(registration.premium_access_fee, 99);
  assert.equal(registration.premium_access_label, "VIP lounge");
});
