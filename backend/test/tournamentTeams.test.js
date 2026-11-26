const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPersistentTournamentTeamMembers,
  normalizeTournamentTeamTag,
  parsePersistentTournamentTeamInput,
  serializePersistentTournamentTeam,
  serializePersistentTournamentTeamInvite,
} = require("../utils/tournamentTeams");

test("normalizeTournamentTeamTag strips punctuation and uppercases", () => {
  assert.equal(normalizeTournamentTeamTag(" gg-x! "), "GGX");
});

test("buildPersistentTournamentTeamMembers includes the captain and validates teammates", () => {
  const result = buildPersistentTournamentTeamMembers({
    captain: {
      name: "Sid",
      email: "sid@example.com",
      mobile: "9999999999",
    },
    roster: [
      {
        member_name: "Ace",
        member_email: "ace@example.com",
      },
    ],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.members.length, 2);
  assert.equal(result.members[0].is_captain, 1);
  assert.equal(result.members[1].member_name, "Ace");
});

test("parsePersistentTournamentTeamInput requires a team name and teammate", () => {
  const result = parsePersistentTournamentTeamInput(
    {
      team_name: "",
      roster: [],
    },
    {
      captain: {
        name: "Sid",
        email: "sid@example.com",
      },
    }
  );

  assert.equal(result.errors.includes("Team name is required."), true);
  assert.equal(
    result.errors.includes("Add at least one teammate to create a reusable team."),
    true
  );
});

test("serializePersistentTournamentTeam exposes members and history cleanly", () => {
  const team = serializePersistentTournamentTeam({
    team_id: 4,
    owner_user_id: 8,
    team_name: "Night Owls",
    team_tag: "owl!",
    preferred_game: "Valorant",
    viewer_role: "owner",
    is_owner: 1,
    pending_invite_count: 1,
    accepted_member_count: 2,
    total_entries: 3,
    active_entries: 1,
    championship_count: 1,
    runner_up_count: 1,
    total_match_wins: 5,
    members: [
      {
        team_member_id: 11,
        team_id: 4,
        user_id: 8,
        slot_number: 1,
        member_name: "Sid",
        member_email: "sid@example.com",
        is_captain: 1,
        membership_status: "captain",
      },
    ],
    invites: [
      {
        invite_id: 44,
        team_id: 4,
        team_member_id: 15,
        invited_email: "ace@example.com",
        status: "pending",
      },
    ],
    history: [
      {
        registration_id: 21,
        tournament_id: 5,
        tournament_title: "Night Cup",
        placement: "champion",
      },
    ],
  });

  assert.equal(team.team_tag, "OWL");
  assert.equal(team.roster_count, 1);
  assert.equal(team.members[0].is_captain, true);
  assert.equal(team.members[0].is_linked, true);
  assert.equal(team.members[0].membership_status, "captain");
  assert.equal(team.viewer_role, "owner");
  assert.equal(team.is_owner, true);
  assert.equal(team.pending_invite_count, 1);
  assert.equal(team.accepted_member_count, 2);
  assert.equal(team.invites.length, 1);
  assert.equal(team.history[0].placement, "champion");
});

test("serializePersistentTournamentTeamInvite exposes team, member, and inviter context", () => {
  const invite = serializePersistentTournamentTeamInvite({
    invite_id: 9,
    team_id: 4,
    team_member_id: 15,
    invited_email: "ace@example.com",
    invited_user_id: 22,
    invited_by_user_id: 8,
    status: "pending",
    team: {
      team_id: 4,
      team_name: "Night Owls",
      team_tag: "owl!",
    },
    member: {
      team_member_id: 15,
      team_id: 4,
      slot_number: 2,
      member_name: "Ace",
      member_email: "ace@example.com",
      membership_status: "pending",
      is_captain: 0,
    },
    inviter: {
      user_id: 8,
      name: "Sid",
      email: "sid@example.com",
    },
  });

  assert.equal(invite.status, "pending");
  assert.equal(invite.team?.team_tag, "OWL");
  assert.equal(invite.member?.member_name, "Ace");
  assert.equal(invite.inviter?.name, "Sid");
});
