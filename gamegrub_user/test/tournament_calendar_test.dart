import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/models/tournament.dart';
import 'package:gamegrub_user/utils/tournament_calendar.dart';

void main() {
  test(
    'calendar export uses UTC times, venue details, revision, and reminders',
    () {
      final tournament = Tournament.fromJson({
        'tournament_id': 14,
        'title': 'Weekend Clash, Finals',
        'game_title': 'Valorant',
        'skill_level': 'intermediate',
        'format': 'team',
        'team_size': 5,
        'location_label': 'Arena One',
        'business_address_line1': '42 Game St',
        'business_city': 'Pune',
        'business_state': 'Maharashtra',
        'business_timezone': 'Asia/Kolkata',
        'slug': 'weekend-clash',
        'start_at': '2026-11-10T10:00:00Z',
        'end_at': '2026-11-10T14:00:00Z',
        'updated_at': '2026-11-01T12:00:00Z',
      });

      final ics = buildTournamentCalendarIcs(
        tournament,
        now: DateTime.utc(2026, 11, 1),
      );
      final unfoldedIcs = ics.replaceAll('\r\n ', '');

      expect(unfoldedIcs, contains('UID:tournament-14@gamegrub'));
      expect(unfoldedIcs, contains('DTSTART:20261110T100000Z'));
      expect(unfoldedIcs, contains('DTEND:20261110T140000Z'));
      expect(unfoldedIcs, contains(r'SUMMARY:Weekend Clash\, Finals'));
      expect(
        unfoldedIcs,
        contains(r'LOCATION:Arena One\, 42 Game St\, Pune\, Maharashtra'),
      );
      expect(unfoldedIcs, contains('Venue timezone: Asia/Kolkata'));
      expect(unfoldedIcs, contains('TRIGGER:-P1D'));
      expect(unfoldedIcs, contains('TRIGGER:-PT1H'));
      expect(unfoldedIcs, contains('SEQUENCE:1793534400000'));
    },
  );

  test('calendar export supplies an estimated end when event has none', () {
    final tournament = Tournament.fromJson({
      'tournament_id': 2,
      'title': 'Quick cup',
      'start_at': '2026-11-10T10:00:00Z',
    });
    final ics = buildTournamentCalendarIcs(
      tournament,
      now: DateTime.utc(2026, 11, 1),
    );
    final unfoldedIcs = ics.replaceAll('\r\n ', '');
    expect(unfoldedIcs, contains('DTEND:20261110T130000Z'));
    expect(
      unfoldedIcs,
      contains('End time estimated as three hours after start.'),
    );
  });
}
