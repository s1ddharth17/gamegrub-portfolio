import 'dart:convert';

import '../models/tournament.dart';

String _calendarEscape(String value) {
  final escaped = StringBuffer();
  for (final rune in value.runes) {
    switch (rune) {
      case 92:
        escaped.write(r'\\');
        break;
      case 10:
      case 13:
        escaped.write(r'\n');
        break;
      case 44:
        escaped.write(r'\,');
        break;
      case 59:
        escaped.write(r'\;');
        break;
      default:
        escaped.writeCharCode(rune);
        break;
    }
  }
  return escaped.toString();
}

String _calendarUtc(DateTime value) {
  final utc = value.toUtc();
  String pad(int part) => part.toString().padLeft(2, '0');
  return '${utc.year}${pad(utc.month)}${pad(utc.day)}T${pad(utc.hour)}${pad(utc.minute)}${pad(utc.second)}Z';
}

List<String> _foldCalendarLine(String line) {
  final result = <String>[];
  var current = StringBuffer();
  var bytes = 0;
  for (final rune in line.runes) {
    final runeString = String.fromCharCode(rune);
    final runeBytes = utf8.encode(runeString).length;
    if (bytes + runeBytes > 75) {
      result.add(current.toString());
      current = StringBuffer(' ');
      bytes = 1;
    }
    current.write(runeString);
    bytes += runeBytes;
  }
  result.add(current.toString());
  return result;
}

String buildTournamentCalendarIcs(Tournament tournament, {DateTime? now}) {
  final start = tournament.startAt?.toUtc();
  if (start == null) throw ArgumentError('Tournament start time is required.');
  final estimatedEnd = tournament.endAt == null;
  final end = tournament.endAt?.toUtc() ?? start.add(const Duration(hours: 3));
  final address = [
    tournament.locationLabel,
    tournament.businessAddressLine1,
    tournament.businessCity,
    tournament.businessState,
  ].where((part) => part.trim().isNotEmpty).join(', ');
  final location = address.isEmpty ? tournament.businessName : address;
  final description = [
    tournament.gameTitle.trim().isEmpty
        ? null
        : 'Game: ${tournament.gameTitle}',
    'Format: ${tournament.teamLabel}',
    'Skill level: ${tournament.skillLevel}',
    'Venue timezone: ${tournament.businessTimezone}',
    if (estimatedEnd) 'End time estimated as three hours after start.',
    if (tournament.slug.trim().isNotEmpty) 'Event details: ${tournament.slug}',
  ].whereType<String>().join('\n');
  final sequence = tournament.updatedAt?.millisecondsSinceEpoch ?? 0;
  final lines = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GameGrub//Tournament Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:tournament-${tournament.tournamentId}@gamegrub',
    'DTSTAMP:${_calendarUtc(now ?? DateTime.now())}',
    'DTSTART:${_calendarUtc(start)}',
    'DTEND:${_calendarUtc(end)}',
    'SEQUENCE:$sequence',
    'SUMMARY:${_calendarEscape(tournament.title)}',
    if (location.trim().isNotEmpty) 'LOCATION:${_calendarEscape(location)}',
    'DESCRIPTION:${_calendarEscape(description)}',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:${_calendarEscape('${tournament.title} starts tomorrow')}',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:${_calendarEscape('${tournament.title} starts in one hour')}',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return '${lines.expand(_foldCalendarLine).join('\r\n')}\r\n';
}
