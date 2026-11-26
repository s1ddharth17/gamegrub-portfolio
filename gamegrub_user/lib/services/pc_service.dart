import '../services/api_service.dart';

class PcService {
  Future<List> fetchPCs({int? businessId}) async {
    final queryParameters = businessId == null
        ? null
        : <String, dynamic>{'business_id': businessId};

    try {
      final res = await ApiService.get(
        "/pc/live-status",
        queryParameters: queryParameters,
      );
      return (res as List?) ?? const [];
    } on ApiException {
      final fallback = await ApiService.get(
        "/pc/all",
        queryParameters: queryParameters,
      );
      return (fallback as List?) ?? const [];
    }
  }
}
