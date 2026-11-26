# Tournament discovery and social play

Tournament discovery now includes game, city, state, and skill-level filters.
Events can be marked `open`, `beginner`, `intermediate`, or `advanced`; open
events remain visible at every selected skill level.

## Player discovery and sharing

Players opt in from the tournament Teams view. Public profiles show the
player's display name, gamer tag, avatar, favorite game, bio, city/state, skill
level, team-search status, and public tournament statistics. Email addresses
and phone numbers are never returned by the public player endpoints. A player
can turn discovery off at any time. Shared profile text contains only the
public profile details.

- `GET /api/tournament/players` lists opted-in profiles and accepts `game`,
  `city`, `state`, `skill_level`, and `looking_for_team` filters.
- `GET /api/tournament/players/:id` returns an opted-in profile only.
- `GET /api/tournament/player-profile` and `PUT /api/tournament/player-profile`
  manage the signed-in player's discovery preferences.

## Calendar and reminders

The event detail sheet shares an ICS calendar file with a stable event UID,
UTC start/end timestamps, venue address and timezone, a schedule revision, and
24-hour and 1-hour alarms. Events without an end time use a three-hour estimate.
When an administrator changes the time or venue of a published tournament,
registered players receive a schedule update. Re-exporting the calendar entry
uses the same UID and a newer sequence. The notification engine creates
idempotent tournament reminders for registered players in the 24-hour and
1-hour windows, with the venue's local time in the reminder.

## Highlights and community moderation

`GET /api/tournament/highlights` returns recent completed or walkover results
from published tournaments without participant contact information. Public
brackets remain available from `GET /api/tournament/:id/bracket`.

Signed-in players can toggle likes and report live community posts for spam,
abuse, hate, or another issue. Reports are unique per player and post. Admins
with tournament management permission can review the pending queue, dismiss a
report, or archive the reported post while recording a moderation note.

The schema changes are in
`backend/migrations/20261105_tournament_social_features.js`.
