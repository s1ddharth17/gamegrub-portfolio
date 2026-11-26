import 'business.dart';
import 'pc.dart';

class CafeDiscoveryResult {
  final Business business;
  final List<String> gameTitles;
  final List<String> stationCategories;
  final double? minPricePerHour;
  final bool isOpenNow;
  final List<PC> availableSetups;
  final String availabilityDate;
  final int startHour;
  final int durationHours;

  const CafeDiscoveryResult({
    required this.business,
    required this.gameTitles,
    required this.stationCategories,
    required this.minPricePerHour,
    required this.isOpenNow,
    required this.availableSetups,
    required this.availabilityDate,
    required this.startHour,
    required this.durationHours,
  });

  factory CafeDiscoveryResult.fromJson(Map<String, dynamic> json) {
    final window = Map<String, dynamic>.from(
      (json['availability_window'] as Map?) ?? const {},
    );
    return CafeDiscoveryResult(
      business: Business.fromJson(json),
      gameTitles: (json['game_titles'] as List? ?? const [])
          .map((value) => value.toString())
          .where((value) => value.trim().isNotEmpty)
          .toList(),
      stationCategories: (json['station_categories'] as List? ?? const [])
          .map((value) => value.toString())
          .where((value) => value.trim().isNotEmpty)
          .toList(),
      minPricePerHour: json['min_price_per_hour'] == null
          ? null
          : double.tryParse('${json['min_price_per_hour']}'),
      isOpenNow:
          json['is_open_now'] == true ||
          '${json['is_open_now']}'.toLowerCase() == 'true' ||
          '${json['is_open_now']}' == '1',
      availableSetups: (json['available_setups'] as List? ?? const [])
          .map((value) => PC.fromJson(Map<String, dynamic>.from(value as Map)))
          .toList(),
      availabilityDate: '${window['date'] ?? ''}',
      startHour: int.tryParse('${window['start_hour'] ?? 0}') ?? 0,
      durationHours: int.tryParse('${window['duration_hours'] ?? 0}') ?? 0,
    );
  }

  int get availableGroupCount => availableSetups.length;
}
