import '../services/api_service.dart';
import '../models/business_review.dart';

class BusinessService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchBusinesses({int limit = 24}) async {
    final res = await ApiService.get(
      '/business/all',
      queryParameters: {'limit': limit},
    );
    return (res as List?) ?? const [];
  }

  Future<List> fetchCafeDiscovery({
    required DateTime date,
    required int startHour,
    required int durationHours,
  }) async {
    final dateKey =
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final response = await ApiService.get(
      '/business/discovery',
      queryParameters: {
        'date': dateKey,
        'start_hour': startHour,
        'duration_hours': durationHours,
      },
    );
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> fetchBusinessDetails(String slugOrId) async {
    final res = await ApiService.get('/business/details/$slugOrId');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<BusinessReviewFeed> fetchBusinessReviews(
    String slugOrId, {
    int limit = 6,
  }) async {
    final res = await ApiService.get(
      '/business/reviews/$slugOrId',
      queryParameters: {'limit': limit},
    );
    return BusinessReviewFeed.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<BusinessReviewState> fetchReviewState({
    required String token,
    required int businessId,
  }) async {
    final res = await ApiService.get(
      '/business/review-state/$businessId',
      headers: _authHeaders(token),
    );
    return BusinessReviewState.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<Map<String, dynamic>> submitBusinessReview({
    required String token,
    required int businessId,
    required int rating,
    String title = '',
    required String reviewText,
  }) async {
    final res = await ApiService.post('/business/review', {
      'business_id': businessId,
      'rating': rating,
      'title': title.trim(),
      'review_text': reviewText.trim(),
    }, headers: _authHeaders(token));

    return Map<String, dynamic>.from(res as Map);
  }
}
