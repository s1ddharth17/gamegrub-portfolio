const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN,
  TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
  filterTournamentNotificationRecipients,
  normalizeTournamentNotificationEmailStatus,
  normalizeTournamentNotificationEvent,
  normalizeTournamentNotificationScope,
  serializeTournamentNotification,
  serializeTournamentNotificationCampaign,
} = require("../utils/tournamentNotifications");

test("notification normalizers fall back safely", () => {
  assert.equal(normalizeTournamentNotificationScope("CHECKED_IN"), "checked_in");
  assert.equal(normalizeTournamentNotificationScope("mystery"), "all_registered");
  assert.equal(normalizeTournamentNotificationEvent("MATCH_RESULT"), "match_result");
  assert.equal(normalizeTournamentNotificationEvent("mystery"), "announcement");
  assert.equal(normalizeTournamentNotificationEmailStatus("SENT"), "sent");
  assert.equal(normalizeTournamentNotificationEmailStatus("mystery"), "skipped");
});

test("filterTournamentNotificationRecipients applies scope rules", () => {
  const recipients = [
    { user_id: 1, status: "registered", attendance_status: "pending" },
    { user_id: 2, status: "registered", attendance_status: "checked_in" },
    { user_id: 3, status: "registered", attendance_status: "no_show" },
    { user_id: 4, status: "waitlisted", attendance_status: "pending" },
    { user_id: 5, status: "cancelled", attendance_status: "checked_in" },
  ];

  assert.deepEqual(
    filterTournamentNotificationRecipients(recipients, TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED).map(
      (entry) => entry.user_id
    ),
    [1, 2, 3]
  );
  assert.deepEqual(
    filterTournamentNotificationRecipients(recipients, TOURNAMENT_NOTIFICATION_SCOPE_CHECKED_IN).map(
      (entry) => entry.user_id
    ),
    [2]
  );
  assert.deepEqual(
    filterTournamentNotificationRecipients(
      recipients,
      TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET
    ).map((entry) => entry.user_id),
    [1, 2]
  );
  assert.deepEqual(
    filterTournamentNotificationRecipients(
      recipients,
      TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED
    ).map((entry) => entry.user_id),
    [4]
  );
});

test("serializeTournamentNotificationCampaign exposes delivery aggregates", () => {
  const campaign = serializeTournamentNotificationCampaign({
    campaign_id: 7,
    tournament_id: 9,
    event_type: "announcement",
    recipient_scope: "checked_in",
    title: "Check-in call",
    message: "Please reach the venue 15 minutes early.",
    send_email: 1,
    delivery_count: 12,
    read_count: 5,
    emailed_count: 4,
    email_failed_count: 1,
    created_by: 11,
    created_at: "2026-05-03T12:00:00.000Z",
  });

  assert.equal(campaign.campaign_id, 7);
  assert.equal(campaign.recipient_scope, "checked_in");
  assert.equal(campaign.send_email, true);
  assert.equal(campaign.delivery_count, 12);
  assert.equal(campaign.email_failed_count, 1);
});

test("serializeTournamentNotification includes tournament context and read state", () => {
  const notification = serializeTournamentNotification({
    notification_id: 13,
    campaign_id: 7,
    tournament_id: 9,
    registration_id: 21,
    user_id: 44,
    event_type: "match_result",
    title: "Round won",
    message: "You advanced to the next round.",
    email_status: TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
    emailed_at: "2026-05-03T12:10:00.000Z",
    read_at: "2026-05-03T12:30:00.000Z",
    created_at: "2026-05-03T12:00:00.000Z",
    slug: "tekken-royale",
    tournament_title: "Tekken Royale",
    game_title: "Tekken 8",
    tournament_status: "published",
    start_at: "2026-05-04T18:00:00.000Z",
  });

  assert.equal(notification.notification_id, 13);
  assert.equal(notification.email_status, "sent");
  assert.equal(notification.is_read, true);
  assert.equal(notification.tournament.slug, "tekken-royale");
  assert.equal(notification.tournament.title, "Tekken Royale");
});
