import '../services/api_service.dart';

class OrderService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchMenu({int? businessId}) async {
    final res = await ApiService.get(
      '/menu/all',
      queryParameters: businessId == null
          ? null
          : <String, dynamic>{'business_id': businessId},
    );
    return (res as List?) ?? const [];
  }

  Future<int> createOrGetOrder({
    required String token,
    required int bookingId,
  }) async {
    final res = await ApiService.post('/order/create', {
      'booking_id': bookingId,
    }, headers: _authHeaders(token));
    return int.tryParse('${res['order_id'] ?? 0}') ?? 0;
  }

  Future<Map<String, dynamic>> checkoutOrder({
    required String token,
    required int bookingId,
    required List<Map<String, dynamic>> items,
    bool deferPayment = false,
    String? paymentMethod,
    String? paymentReference,
    String? customerNotes,
  }) async {
    final res = await ApiService.post('/order/checkout', {
      'booking_id': bookingId,
      'items': items,
      'defer_payment': deferPayment,
      'payment_method': paymentMethod,
      'payment_reference': paymentReference,
      'customer_notes': customerNotes,
    }, headers: _authHeaders(token));
    return Map<String, dynamic>.from(res as Map);
  }

  Future<void> addItem({
    required String token,
    required int orderId,
    required int menuId,
    required int qty,
  }) async {
    await ApiService.post('/order/add-item', {
      'order_id': orderId,
      'menu_id': menuId,
      'qty': qty,
    }, headers: _authHeaders(token));
  }

  Future<void> setItemQuantity({
    required String token,
    required int orderId,
    required int menuId,
    required int qty,
  }) async {
    await ApiService.post('/order/set-item', {
      'order_id': orderId,
      'menu_id': menuId,
      'qty': qty,
    }, headers: _authHeaders(token));
  }

  Future<Map<String, dynamic>> fetchOrderBill({
    required String token,
    required int bookingId,
  }) async {
    final res = await ApiService.get(
      '/order/bill/$bookingId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(res as Map);
  }
}
