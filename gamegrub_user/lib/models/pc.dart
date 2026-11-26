import '../constants/station_categories.dart';

class PC {
  final int id;
  final int businessId;
  final String specs;
  final String category;
  final double price;
  final String status;
  final String? userName;
  final int? bookingId;
  final String? liveState;
  final int? elapsedMinutes;
  final int? remainingMinutes;
  final int? overtimeMinutes;

  PC({
    required this.id,
    required this.businessId,
    required this.specs,
    required this.category,
    required this.price,
    required this.status,
    this.userName,
    this.bookingId,
    this.liveState,
    this.elapsedMinutes,
    this.remainingMinutes,
    this.overtimeMinutes,
  });

  factory PC.fromJson(Map<String, dynamic> json) {
    return PC(
      id: int.tryParse('${json['pc_id'] ?? json['id'] ?? 0}') ?? 0,
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      specs: '${json['specs'] ?? 'Unknown build'}',
      category: normalizeStationCategory(json['category']?.toString()),
      price:
          double.tryParse('${json['price_per_hour'] ?? json['price'] ?? 0}') ??
          0,
      status: '${json['pc_status'] ?? json['status'] ?? 'active'}',
      userName: json['user']?.toString(),
      bookingId: json['booking_id'] == null
          ? null
          : int.tryParse('${json['booking_id']}'),
      liveState: json['state']?.toString(),
      elapsedMinutes: json['elapsed_minutes'] == null
          ? null
          : int.tryParse('${json['elapsed_minutes']}'),
      remainingMinutes: json['remaining_minutes'] == null
          ? null
          : int.tryParse('${json['remaining_minutes']}'),
      overtimeMinutes: json['overtime_minutes'] == null
          ? null
          : int.tryParse('${json['overtime_minutes']}'),
    );
  }

  bool get isDisabled {
    final normalizedStatus = status.toLowerCase();
    final normalizedState = liveState?.toLowerCase();
    return normalizedStatus == 'inactive' || normalizedState == 'inactive';
  }

  bool get isAvailable {
    if (isDisabled) {
      return false;
    }

    final state = liveState?.toLowerCase();
    if (state != null) {
      return state == 'free';
    }
    return status.toLowerCase() == 'active';
  }

  String get availabilityLabel {
    if (isDisabled) {
      return 'Disabled';
    }

    final state = liveState?.toLowerCase();

    switch (state) {
      case 'running':
        return 'Running';
      case 'overtime':
        return 'Overtime';
      case 'awaiting_settlement':
        return 'Checkout pending';
      case 'reserved':
        return 'Reserved';
      case 'no_show_risk':
        return 'Start pending';
      case 'free':
        return 'Available';
      default:
        return isAvailable ? 'Available' : 'Unavailable';
    }
  }

  bool get canReserve {
    return !isDisabled;
  }

  String get categoryLabel => stationCategoryDisplayLabel(category);

  String get deviceLabel => stationDeviceLabel(category);

  String get stationTitle => '$deviceLabel $id';

  bool matchesCategory(String selectedCategory) {
    return stationMatchesCategory(category, selectedCategory);
  }
}
