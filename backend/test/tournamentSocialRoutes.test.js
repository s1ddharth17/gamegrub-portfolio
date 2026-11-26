const test = require("node:test");
const assert = require("node:assert/strict");

test("public player discovery applies requested filters and never serializes contacts", async (t) => {
  const db = require("../utils/db");
  const community = require("../utils/tournamentCommunity");
  let sqlText = "";
  let sqlParams = [];
  t.mock.method(db, "query", async (sql, params) => {
    sqlText = sql;
    sqlParams = params;
    return [{
      uid: 41,
      name: "Player One",
      gamer_tag: "Ace",
      favorite_game: "Valorant",
      player_bio: "Looking for weekend events.",
      city: "Pune",
      state: "Maharashtra",
      profile_skill_level: "intermediate",
      looking_for_team: 1,
      email: "private@example.test",
      mobile: "9999999999",
    }];
  });
  t.mock.method(community, "attachTournamentProfilesToUsers", async (rows) => rows);
  const modulePath = require.resolve("../routes/tournamentSocialRoutes");
  delete require.cache[modulePath];
  const { getPublicPlayers } = require(modulePath);
  t.after(() => delete require.cache[modulePath]);

  const players = await getPublicPlayers({
    filters: {
      game: "Valorant",
      city: "Pune",
      skill_level: "intermediate",
      looking_for_team: "true",
      limit: "80",
    },
  });

  assert.match(sqlText, /tp\.is_public = 1/);
  assert.match(sqlText, /favorite_game/);
  assert.match(sqlText, /LOWER\(COALESCE\(tp\.city, ''\)\) = \?/);
  assert.match(sqlText, /tp\.skill_level IN \(\?, 'open'\)/);
  assert.deepEqual(sqlParams, ["%valorant%", "pune", "intermediate", 40]);
  assert.equal(players[0].display_name, "Ace");
  assert.equal(players[0].looking_for_team, true);
  assert.equal(Object.hasOwn(players[0], "email"), false);
  assert.equal(Object.hasOwn(players[0], "mobile"), false);
});

test("public player serializer whitelists only discovery profile fields", () => {
  const { serializePlayer } = require("../routes/tournamentSocialRoutes");
  const player = serializePlayer({
    uid: 7,
    name: "User",
    gamer_tag: "tag",
    email: "private@example.test",
    mobile: "123",
    profile_skill_level: "advanced",
  });
  assert.deepEqual(Object.keys(player), [
    "user_id", "display_name", "gamer_tag", "avatar", "favorite_game",
    "player_bio", "city", "state", "skill_level", "looking_for_team",
    "tournament_entries", "tournament_rank", "tournament_points",
    "tournament_championships", "tournament_matches_played",
    "tournament_match_wins", "tournament_win_rate",
  ]);
});
