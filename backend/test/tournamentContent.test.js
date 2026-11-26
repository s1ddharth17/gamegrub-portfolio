const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeTournamentCommunityPostStatus,
  normalizeTournamentCommunityPostTone,
  normalizeTournamentCommunityPostType,
  parseTournamentCommunityPostInput,
  serializeTournamentCommunityPost,
} = require("../utils/tournamentContent");

test("community content normalizers fall back safely", () => {
  assert.equal(normalizeTournamentCommunityPostStatus("PUBLISHED"), "published");
  assert.equal(normalizeTournamentCommunityPostStatus("mystery"), "draft");
  assert.equal(normalizeTournamentCommunityPostType("PROMO"), "promo");
  assert.equal(normalizeTournamentCommunityPostType("mystery"), "spotlight");
  assert.equal(normalizeTournamentCommunityPostTone("GOLD"), "gold");
  assert.equal(normalizeTournamentCommunityPostTone("mystery"), "orange");
});

test("parseTournamentCommunityPostInput validates required fields and windows", () => {
  const invalid = parseTournamentCommunityPostInput({
    title: "",
    summary: "",
    starts_at: "2026-05-10T18:00",
    ends_at: "2026-05-09T18:00",
  });

  assert.equal(invalid.errors.includes("Post title is required."), true);
  assert.equal(invalid.errors.includes("Post summary is required."), true);
  assert.equal(
    invalid.errors.includes("End time must be after the start time."),
    true
  );

  const valid = parseTournamentCommunityPostInput({
    title: "Friday Night Spotlight",
    summary: "Bracket energy is back this weekend.",
    content_type: "promo",
    accent_tone: "turquoise",
    linked_tournament_id: "12",
    starts_at: "2026-05-10T18:00",
    ends_at: "2026-05-12T22:00",
  });

  assert.deepEqual(valid.errors, []);
  assert.equal(valid.data.content_type, "promo");
  assert.equal(valid.data.accent_tone, "turquoise");
  assert.equal(valid.data.linked_tournament_id, 12);
  assert.equal(valid.data.starts_at, "2026-05-10 18:00:00");
  assert.equal(valid.data.ends_at, "2026-05-12 22:00:00");
});

test("serializeTournamentCommunityPost includes linked tournament context", () => {
  const post = serializeTournamentCommunityPost({
    post_id: 8,
    linked_tournament_id: 11,
    content_type: "community_update",
    status: "published",
    accent_tone: "rose",
    title: "Community update",
    summary: "The weekend ladder is filling fast.",
    priority: 4,
    is_active_now: 1,
    linked_tournament_tournament_id: 11,
    linked_tournament_slug: "tekken-sunday",
    linked_tournament_title: "Tekken Sunday",
    linked_tournament_game_title: "Tekken 8",
    linked_tournament_status: "published",
  });

  assert.equal(post.post_id, 8);
  assert.equal(post.content_type, "community_update");
  assert.equal(post.accent_tone, "rose");
  assert.equal(post.is_active_now, true);
  assert.equal(post.linked_tournament?.slug, "tekken-sunday");
  assert.equal(post.linked_tournament?.title, "Tekken Sunday");
});
