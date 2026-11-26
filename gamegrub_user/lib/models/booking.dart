import '../constants/station_categories.dart';

class Booking {
  final int bookingId;
  final int businessId;
  final String businessName;
  final int pcId;
  final String pcCategory;
  final String status;
  final DateTime? bookingDate;
  final double? totalAmount;
  final DateTime? startTime;
  final DateTime? actualEndTime;
  final int? startHour;
  final int? endHour;
  final int? totalHours;
  final String? timeRange;
  final double? finalAmount;
  final String? paymentStatus;
  final int? billId;
  final String? refundNumber;
  final String? refundStatus;
  final String? refundMessage;
  final DateTime? checkedInAt;
  final String? visitState;

  Booking({
    required this.bookingId,
    required this.businessId,
    required this.businessName,
    required this.pcId,
    required this.pcCategory,
    required this.status,
    this.bookingDate,
    this.totalAmount,
    this.startTime,
    this.actualEndTime,
    this.startHour,
    this.endHour,
    this.totalHours,
    this.timeRange,
    this.finalAmount,
    this.paymentStatus,
    this.billId,
    this.refundNumber,
    this.refundStatus,
    this.refundMessage,
    this.checkedInAt,
    this.visitState,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    return Booking(
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      businessName: '${json['business_name'] ?? ''}',
      pcId: int.tryParse('${json['pc_id'] ?? 0}') ?? 0,
      pcCategory: normalizeStationCategory(json['pc_category']?.toString()),
      status: '${json['status'] ?? 'confirmed'}',
      bookingDate: _tryParseDate(json['booking_date']),
      totalAmount: double.tryParse(
        '${json['total_amount'] ?? json['amount'] ?? ''}',
      ),
      startTime: _tryParseDate(json['start_time']),
      actualEndTime: _tryParseDate(json['actual_end_time']),
      startHour: json['start_hour'] == null
          ? null
          : int.tryParse('${json['start_hour']}'),
      endHour: json['end_hour'] == null
          ? null
          : int.tryParse('${json['end_hour']}'),
      totalHours: json['total_hours'] == null
          ? null
          : int.tryParse('${json['total_hours']}'),
      timeRange: json['time_range']?.toString(),
      finalAmount: double.tryParse('${json['final_amount'] ?? ''}'),
      paymentStatus: json['payment_status']?.toString(),
      billId: json['bill_id'] == null
          ? null
          : int.tryParse('${json['bill_id']}'),
      refundNumber: json['refund_number']?.toString(),
      refundStatus: json['refund_status']?.toString(),
      refundMessage: json['refund_message']?.toString(),
      checkedInAt: _tryParseDate(json['checked_in_at']),
      visitState: json['visit_state']?.toString(),
    );
  }

  String get normalizedStatus => status.toLowerCase();

  String? get normalizedPaymentStatus => paymentStatus?.toLowerCase().trim();

  String get normalizedVisitState =>
      visitState?.toLowerCase().trim().isNotEmpty == true
      ? visitState!.toLowerCase().trim()
      : normalizedStatus == 'session_over'
      ? 'ending'
      : normalizedStatus == 'closed' || normalizedStatus == 'completed'
      ? 'settled'
      : normalizedStatus == 'running'
      ? 'running'
      : checkedInAt != null
      ? 'checked_in'
      : normalizedStatus;

  bool get isPaymentSettled => normalizedPaymentStatus == 'paid';

  bool get hasStarted {
    if (startTime == null) {
      return false;
    }
    return !startTime!.isAfter(DateTime.now());
  }

  bool get isOpen {
    final value = normalizedStatus;
    return value != 'closed' && value != 'cancelled' && value != 'completed';
  }

  bool get isUpcoming => normalizedStatus == 'confirmed' && !hasStarted;

  bool get canSettlePayment {
    final value = normalizedStatus;
    return value == 'running' ||
        value == 'session_over' ||
        (value == 'confirmed' && hasStarted);
  }

  bool get canCancel => normalizedStatus == 'confirmed' && !hasStarted;

  bool get canExtend {
    final value = normalizedStatus;
    return value == 'confirmed' ||
        value == 'running' ||
        value == 'session_over';
  }

  String get stationTypeLabel => stationDeviceLabel(pcCategory);

  String get stationTitle => '$stationTypeLabel $pcId';

  static DateTime? _tryParseDate(dynamic value) {
    if (value == null) {
      return null;
    }
    return DateTime.tryParse(value.toString());
  }
}

class BookingCreationResult {
  final int bookingId;
  final double totalAmount;
  final double amountPaid;
  final double convenienceFee;
  final double customerFinalAmount;
  final double loyaltyUsed;
  final int remainingLoyalty;
  final String paymentMethod;
  final String? paymentReference;
  final String paymentStatus;
  final String? paymentAttemptId;
  final String? checkoutUrl;
  final bool pendingPayment;
  final DateTime? startTime;

  const BookingCreationResult({
    required this.bookingId,
    required this.totalAmount,
    required this.amountPaid,
    required this.convenienceFee,
    required this.customerFinalAmount,
    required this.loyaltyUsed,
    required this.remainingLoyalty,
    required this.paymentMethod,
    required this.paymentReference,
    required this.paymentStatus,
    this.paymentAttemptId,
    this.checkoutUrl,
    this.pendingPayment = false,
    required this.startTime,
  });

  factory BookingCreationResult.fromJson(Map<String, dynamic> json) {
    return BookingCreationResult(
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
      amountPaid: double.tryParse('${json['amount_paid'] ?? 0}') ?? 0,
      convenienceFee: double.tryParse('${json['convenience_fee'] ?? 0}') ?? 0,
      customerFinalAmount:
          double.tryParse(
            '${json['customer_final_amount'] ?? json['amount_paid'] ?? 0}',
          ) ??
          0,
      loyaltyUsed: double.tryParse('${json['loyalty_used'] ?? 0}') ?? 0,
      remainingLoyalty: int.tryParse('${json['remaining_loyalty'] ?? 0}') ?? 0,
      paymentMethod: '${json['payment_method'] ?? 'cash'}',
      paymentReference: json['payment_reference']?.toString(),
      paymentStatus: '${json['payment_status'] ?? 'advance_paid'}',
      paymentAttemptId:
          json['attempt_id']?.toString() ??
          json['payment_attempt_id']?.toString(),
      checkoutUrl: json['checkout_url']?.toString(),
      pendingPayment:
          json['pending_payment'] == true ||
          '${json['payment_status']}' == 'pending',
      startTime: DateTime.tryParse('${json['start_time'] ?? ''}'),
    );
  }
}

class BookingExtensionResult {
  final int addedSlot;
  final double addedAmount;
  final bool paymentDeferred;

  const BookingExtensionResult({
    required this.addedSlot,
    required this.addedAmount,
    required this.paymentDeferred,
  });

  factory BookingExtensionResult.fromJson(Map<String, dynamic> json) {
    return BookingExtensionResult(
      addedSlot: int.tryParse('${json['added_slot'] ?? 0}') ?? 0,
      addedAmount: double.tryParse('${json['added_amount'] ?? 0}') ?? 0,
      paymentDeferred: json['payment_deferred'] == true,
    );
  }
}
