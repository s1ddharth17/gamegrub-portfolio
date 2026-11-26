import 'package:flutter/material.dart';

const _monthNames = <String>[
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const _weekdayNames = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String formatCurrency(num value) {
  final rounded = value.toStringAsFixed(value % 1 == 0 ? 0 : 2);
  return 'Rs $rounded';
}

String formatDate(DateTime? value) {
  if (value == null) {
    return '-';
  }

  return '${value.day.toString().padLeft(2, '0')}/'
      '${value.month.toString().padLeft(2, '0')}/'
      '${value.year}';
}

String formatDateLong(DateTime? value) {
  if (value == null) {
    return '-';
  }

  return '${_weekdayNames[value.weekday - 1]}, '
      '${value.day.toString().padLeft(2, '0')} '
      '${_monthNames[value.month - 1]} '
      '${value.year}';
}

String formatDateTime(DateTime? value) {
  if (value == null) {
    return '-';
  }

  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
  final period = value.hour >= 12 ? 'PM' : 'AM';
  final minute = value.minute.toString().padLeft(2, '0');
  return '${formatDate(value)} - $hour:$minute $period';
}

String formatTimeLabel(int hour) {
  final normalizedHour = ((hour % 24) + 24) % 24;
  final hourLabel = normalizedHour % 12 == 0 ? 12 : normalizedHour % 12;
  final period = normalizedHour >= 12 ? 'PM' : 'AM';
  return '$hourLabel:00 $period';
}

String formatHourRangeLabel(int startHour, int endHourExclusive) {
  return '${formatTimeLabel(startHour)} - ${formatTimeLabel(endHourExclusive)}';
}

String titleCase(String value) {
  return value
      .split(' ')
      .where((part) => part.trim().isNotEmpty)
      .map((part) {
        final trimmed = part.trim();
        return '${trimmed[0].toUpperCase()}${trimmed.substring(1).toLowerCase()}';
      })
      .join(' ');
}

List<Color> buildPanelGradient({
  Color start = const Color(0x26FF7A1A),
  Color end = const Color(0x1429D3C7),
}) {
  return [start, end];
}
