const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeTournamentRankingPoints,
  createTournamentCommunityProfile,
  hasTournamentActivity,
  rankTournamentProfiles,
} = require("../utils/tournamentCommunity");

test("computeTournamentRankingPoints rewards wins and penalizes no-shows", () => {
  const points = computeTournamentRankingPoints({
    tournament_championships: 1,
    tournament_runner_up_finishes: 1,
    tournament_match_wins: 5,
    tournaments_checked_in: 4,
    tournaments_no_show: 1,
  });

  assert.equal(points, 840);
});

test("rankTournamentProfiles sorts active players and assigns rank", () => {
  const ranked = rankTournamentProfiles([
    {
      user_id: 5,
      tournament_entries: 2,
      tournaments_checked_in: 2,
      tournament_match_wins: 3,
      tournament_matches_played: 4,
      tournament_championships: 1,
    },
    {
      user_id: 8,
      tournament_entries: 3,
      tournaments_checked_in: 3,
      tournament_match_wins: 2,
      tournament_matches_played: 5,
      tournament_runner_up_finishes: 1,
    },
    {
      user_id: 11,
      tournament_entries: 0,
      tournaments_checked_in: 0,
      tournament_match_wins: 0,
      tournament_matches_played: 0,
    },
  ]);

  assert.equal(ranked[0].user_id, 5);
  assert.equal(ranked[0].tournament_rank, 1);
  assert.equal(ranked[0].tournament_points > ranked[1].tournament_points, true);
  assert.equal(ranked[1].tournament_rank, 2);
  assert.equal(ranked[2].tournament_rank, null);
  assert.equal(ranked[0].tournament_match_losses, 1);
  assert.equal(ranked[1].tournament_win_rate, 40);
});

test("createTournamentCommunityProfile normalizes defaults safely", () => {
  const profile = createTournamentCommunityProfile({
    user_id: "7",
    most_played_tournament_game: "Valorant",
    tournament_rank: "3",
  });

  assert.equal(profile.user_id, 7);
  assert.equal(profile.most_played_tournament_game, "Valorant");
  assert.equal(profile.tournament_rank, 3);
  assert.equal(hasTournamentActivity(profile), false);
});
