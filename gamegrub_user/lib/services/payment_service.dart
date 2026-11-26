import '../models/payment.dart';
import 'api_service.dart';

class PaymentService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List<PaymentMethodOption>> fetchMethods() async {
    final response = await ApiService.get('/payment/methods');
    final data = (response as List?) ?? const [];
    return data
        .map(
          (item) => PaymentMethodOption.fromJson(
            Map<String, dynamic>.from(item as Map),
          ),
        )
        .toList();
  }

  Future<PaymentSummary> fetchBookingSummary({
    required String token,
    required int bookingId,
  }) async {
    final response = await ApiService.get(
      '/payment/booking/$bookingId',
      headers: _authHeaders(token),
    );
    return PaymentSummary.fromJson(Map<String, dynamic>.from(response as Map));
  }

  Future<Map<String, dynamic>> createSessionIntent({
    required String token,
    required int bookingId,
    required bool useLoyalty,
    required String idempotencyKey,
  }) async {
    final response = await ApiService.post(
      '/payment/intents',
      {'booking_id': bookingId, 'use_loyalty': useLoyalty},
      headers: {..._authHeaders(token), 'idempotency-key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> fetchAttemptStatus({
    required String token,
    required String attemptId,
  }) async {
    final response = await ApiService.get(
      '/payment/attempts/$attemptId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }
}
