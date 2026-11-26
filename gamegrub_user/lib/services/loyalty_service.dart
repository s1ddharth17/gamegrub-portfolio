import 'api_service.dart';

class LoyaltyService {
  Map<String, String> _headers(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<Map<String, dynamic>> fetchSummary({required String token}) async {
    final response = await ApiService.get('/loyalty', headers: _headers(token));
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> applyReferral({
    required String token,
    required String referralCode,
  }) async {
    final response = await ApiService.post('/loyalty/referral', {
      'referral_code': referralCode.trim(),
    }, headers: _headers(token));
    return Map<String, dynamic>.from(response as Map);
  }
}
