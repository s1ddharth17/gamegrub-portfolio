const test = require("node:test");
const assert = require("node:assert/strict");

const { sortMigrationFiles } = require("../scripts/migrate");

test("migration ordering creates prerequisite tournament tables before altering them", () => {
  const sorted = sortMigrationFiles([
    "20260425_add_tournament_registration_rosters.js",
    "20260425_create_tournaments_registrations.js",
    "20260425_add_tournament_bracket_hooks.js",
    "20260425_create_tournaments.js",
  ]);

  assert.deepEqual(sorted, [
    "20260425_create_tournaments.js",
    "20260425_create_tournaments_registrations.js",
    "20260425_add_tournament_bracket_hooks.js",
    "20260425_add_tournament_registration_rosters.js",
  ]);
});

test("migration ordering places payment and team prerequisites before dependants", () => {
  const sorted = sortMigrationFiles([
    "20260503_add_tournament_monetization.js",
    "20260503_add_tournament_team_invites.js",
    "20260503_add_tournament_payment_support.js",
    "20260503_add_persistent_tournament_teams.js",
  ]);

  assert.ok(
    sorted.indexOf("20260503_add_tournament_payment_support.js") <
      sorted.indexOf("20260503_add_tournament_monetization.js")
  );
  assert.ok(
    sorted.indexOf("20260503_add_persistent_tournament_teams.js") <
      sorted.indexOf("20260503_add_tournament_team_invites.js")
  );
});

test("newer migration dates still sort after older dates", () => {
  const sorted = sortMigrationFiles([
    "20270101_create_future_feature.js",
    "20260413_create_auth_sessions.js",
    "20260607_create_business_reviews.js",
  ]);

  assert.deepEqual(sorted, [
    "20260413_create_auth_sessions.js",
    "20260607_create_business_reviews.js",
    "20270101_create_future_feature.js",
  ]);
});
