import 'api_service.dart';

class SupportService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchFaqs({int? businessId}) async {
    final response = await ApiService.get(
      '/support/faqs',
      queryParameters: businessId == null ? null : {'business_id': businessId},
    );
    return (response as List?) ?? const [];
  }

  Future<List> fetchIssues(String token) async {
    final response = await ApiService.get(
      '/support/issues',
      headers: _authHeaders(token),
    );
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> createIssue({
    required String token,
    required String category,
    required String subject,
    required String description,
    int? businessId,
    int? bookingId,
    int? orderId,
    int? billId,
  }) async {
    final payload = <String, dynamic>{
      'category': category,
      'subject': subject,
      'description': description,
      'business_id': ?businessId,
      'booking_id': ?bookingId,
      'order_id': ?orderId,
      'bill_id': ?billId,
    };
    final response = await ApiService.post(
      '/support/issues',
      payload,
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> fetchIssue({
    required String token,
    required int issueId,
  }) async {
    final response = await ApiService.get(
      '/support/issues/$issueId',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> addCustomerComment({
    required String token,
    required int issueId,
    required String message,
  }) async {
    final response = await ApiService.post(
      '/support/issues/$issueId/comments',
      {'message': message},
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }
}
