import '../services/api_service.dart';

class BookingService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchUserBookings({
    required String token,
    required int userId,
  }) async {
    final res = await ApiService.get(
      '/booking/user/$userId',
      headers: _authHeaders(token),
    );
    return (res as List?) ?? const [];
  }

  Future<List> fetchAvailableSlots({
    required String token,
    required int pcId,
    required String date,
  }) async {
    final queryParameters = <String, dynamic>{'pc_id': pcId, 'date': date};

    final res = await ApiService.get(
      '/booking/available-slots',
      queryParameters: queryParameters,
      headers: _authHeaders(token),
    );
    return (res['data'] as List?) ?? const [];
  }

  Future<Map<String, dynamic>> createBooking({
    required String token,
    required int pcId,
    required String bookingDate,
    required List<int> slots,
    required String paymentMethod,
    required String idempotencyKey,
    String? paymentReference,
    bool useLoyalty = false,
    int? waitlistOfferId,
  }) async {
    final res = await ApiService.post(
      '/booking/create',
      {
        'pc_id': pcId,
        'booking_date': bookingDate,
        'slots': slots,
        'payment_method': paymentMethod,
        'payment_reference': paymentReference,
        'use_loyalty': useLoyalty,
        'waitlist_offer_id': waitlistOfferId,
      },
      headers: {..._authHeaders(token), 'idempotency-key': idempotencyKey},
    );
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> extendBooking({
    required String token,
    required int bookingId,
  }) async {
    final res = await ApiService.post('/booking/extend', {
      'booking_id': bookingId,
    }, headers: _authHeaders(token));
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> cancelBooking({
    required String token,
    required int bookingId,
    double? refundAmount,
  }) async {
    final payload = <String, dynamic>{'booking_id': bookingId};
    if (refundAmount != null) payload['refund_amount'] = refundAmount;
    final res = await ApiService.post(
      '/booking/cancel',
      payload,
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> fetchLiveMinuteBill({
    required String token,
    required int bookingId,
  }) async {
    final res = await ApiService.get(
      '/booking/live-minute-bill/$bookingId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> fetchCheckInCode({
    required String token,
    required int bookingId,
  }) async {
    final res = await ApiService.get(
      '/booking/check-in-code/$bookingId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> settleBill({
    required String token,
    required int bookingId,
    required bool useLoyalty,
    String paymentMethod = 'cash',
    String? paymentReference,
    double? overrideAmount,
  }) async {
    final res = await ApiService.post('/booking/settle', {
      'booking_id': bookingId,
      'use_loyalty': useLoyalty,
      'payment_method': paymentMethod,
      'payment_reference': paymentReference,
      'override_amount': overrideAmount,
    }, headers: _authHeaders(token));
    return Map<String, dynamic>.from(res as Map);
  }
}
