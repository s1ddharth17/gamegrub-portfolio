import 'api_service.dart';

class StationWaitlistService {
  Map<String, String> _headers(String token) => {'authorization': 'Bearer $token'};

  Future<Map<String, dynamic>> join({
    required String token,
    required int businessId,
    required String bookingDate,
    required int startHour,
    required int endHour,
    int? preferredPcId,
    String? preferredCategory,
  }) async {
    final response = await ApiService.post(
      '/booking/waitlist',
      {
        'business_id': businessId,
        'booking_date': bookingDate,
        'start_hour': startHour,
        'end_hour': endHour,
        'preferred_pc_id': preferredPcId,
        'preferred_category': preferredCategory,
      },
      headers: _headers(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<List<Map<String, dynamic>>> list({required String token}) async {
    final response = await ApiService.get('/booking/waitlist', headers: _headers(token));
    final rows = (response as Map)['data'] as List? ?? const [];
    return rows.map((row) => Map<String, dynamic>.from(row as Map)).toList();
  }

  Future<void> cancel({required String token, required int waitlistId}) async {
    await ApiService.delete('/booking/waitlist/$waitlistId', headers: _headers(token));
  }

  Future<Map<String, dynamic>> offer({
    required String token,
    required int offerId,
  }) async {
    final response = await ApiService.get(
      '/booking/waitlist/offers/$offerId',
      headers: _headers(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }
}
