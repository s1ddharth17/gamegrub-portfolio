import 'api_service.dart';

class GameGuruService {
  Future<Map<String, dynamic>> requestRecommendation({
    required String token,
    required String query,
  }) async {
    final response = await ApiService.postWithHeaders(
      '/game-guru/chat',
      {'query': query},
      headers: {'authorization': 'Bearer $token'},
    );

    return Map<String, dynamic>.from(response as Map);
  }
}
