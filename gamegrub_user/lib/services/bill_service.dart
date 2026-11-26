import 'dart:typed_data';

import '../services/api_service.dart';

class BillService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchUserBills({
    required String token,
    required int userId,
  }) async {
    final res = await ApiService.get(
      '/bills/user/$userId',
      headers: _authHeaders(token),
    );
    return (res as List?) ?? const [];
  }

  Future<Map<String, dynamic>> fetchBillDetail({
    required String token,
    required int billId,
  }) async {
    final res = await ApiService.get(
      '/bills/$billId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Uint8List> downloadReceipt({
    required String token,
    required int billId,
  }) {
    return ApiService.getBytes(
      '/bills/$billId/receipt',
      headers: _authHeaders(token),
    );
  }

  Future<Map<String, dynamic>> requestOrderRefund({
    required String token,
    required int bookingId,
    required int orderId,
    required double amount,
    required String reason,
    required String idempotencyKey,
  }) async {
    final response = await ApiService.post(
      '/payment/refunds/request',
      {
        'booking_id': bookingId,
        'order_id': orderId,
        'amount': amount,
        'reason': reason,
      },
      headers: {
        ..._authHeaders(token),
        'idempotency-key': idempotencyKey,
      },
    );
    return Map<String, dynamic>.from(response as Map);
  }
}
