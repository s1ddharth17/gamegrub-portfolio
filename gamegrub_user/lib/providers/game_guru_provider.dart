import 'package:flutter/material.dart';

import '../models/game_guru.dart';
import '../services/game_guru_service.dart';

class GameGuruProvider with ChangeNotifier {
  final GameGuruService _service = GameGuruService();

  final List<GameGuruTurn> _conversation = <GameGuruTurn>[];
  bool isLoading = false;
  String? errorMessage;
  String? pendingQuery;

  List<GameGuruTurn> get conversation => List.unmodifiable(_conversation);

  Future<bool> sendQuery({required String token, required String query}) async {
    final normalizedQuery = query.trim();

    if (normalizedQuery.isEmpty) {
      errorMessage = 'Type what you want help with first.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    pendingQuery = normalizedQuery;
    errorMessage = null;
    notifyListeners();

    try {
      final data = await _service.requestRecommendation(
        token: token,
        query: normalizedQuery,
      );
      final response = GameGuruResponse.fromJson(data);
      _conversation.add(
        GameGuruTurn(
          query: response.query.trim().isNotEmpty
              ? response.query
              : normalizedQuery,
          response: response,
          createdAt: response.generatedAt,
        ),
      );
      return true;
    } catch (error) {
      errorMessage = error.toString();
      _conversation.add(
        GameGuruTurn(query: normalizedQuery, error: errorMessage),
      );
      return false;
    } finally {
      pendingQuery = null;
      isLoading = false;
      notifyListeners();
    }
  }

  void clear() {
    _conversation.clear();
    errorMessage = null;
    pendingQuery = null;
    notifyListeners();
  }
}
