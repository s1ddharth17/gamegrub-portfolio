const test = require("node:test");
const assert = require("node:assert/strict");

test("public match highlights expose only completed public results", async (t) => {
  const db = require("../utils/db");
  let sqlText = "";
  let params = [];
  t.mock.method(db, "query", async (sql, values) => {
    sqlText = sql;
    params = values;
    return [{
      match_id: 8,
      tournament_id: 3,
      tournament_title: "Finals",
      tournament_slug: "finals",
      game_title: "Valorant",
      round_number: 3,
      winner_name: "Wolves",
      runner_up_name: "Falcons",
      winner_score: 13,
      runner_up_score: 10,
      match_status: "completed",
    }];
  });
  const modulePath = require.resolve("../routes/tournamentPublicRoutes");
  delete require.cache[modulePath];
  const { registerTournamentPublicRoutes } = require(modulePath);
  t.after(() => delete require.cache[modulePath]);
  const routes = [];
  const router = { get(path, ...handlers) { routes.push({ path, handlers }); } };
  registerTournamentPublicRoutes(router);
  const handler = routes.find((entry) => entry.path === "/highlights").handlers.at(-1);
  const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  await handler({ query: { limit: "100" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(sqlText, /t\.status IN \(\?, \?\)/);
  assert.match(sqlText, /tbm\.status IN \('completed', 'walkover'\)/);
  assert.match(sqlText, /t\.published_at IS NOT NULL/);
  assert.deepEqual(params, ["published", "completed", 24]);
  assert.equal(res.body[0].winner_name, "Wolves");
  assert.equal(Object.hasOwn(res.body[0], "winner_email"), false);
});
