import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/business.dart';
import '../services/business_service.dart';

class BusinessProvider with ChangeNotifier {
  static const _selectedBusinessKey = 'selected_business_id';

  final BusinessService _service = BusinessService();

  List<Business> businesses = [];
  Business? selectedBusiness;
  bool isLoading = false;
  String? errorMessage;
  bool _hasLoaded = false;

  int? get selectedBusinessId => selectedBusiness?.id;

  Business? businessForId(int? id) => _firstMatchingById(id);

  Business? _firstMatchingById(int? id) {
    if (id == null) {
      return null;
    }

    for (final business in businesses) {
      if (business.id == id) {
        return business;
      }
    }

    return null;
  }

  Future<void> loadBusinesses({bool forceRefresh = false}) async {
    if (_hasLoaded && !forceRefresh) {
      return;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      final storedBusinessId = prefs.getInt(_selectedBusinessKey);
      final data = await _service.fetchBusinesses();
      businesses = data
          .map(
            (item) => Business.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();

      final preferredId = selectedBusiness?.id ?? storedBusinessId;
      selectedBusiness = _firstMatchingById(preferredId);
      selectedBusiness ??= businesses.isEmpty ? null : businesses.first;

      if (selectedBusiness != null) {
        await prefs.setInt(_selectedBusinessKey, selectedBusiness!.id);
      } else {
        await prefs.remove(_selectedBusinessKey);
      }

      _hasLoaded = true;
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> selectBusiness(Business business) async {
    selectedBusiness = business;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_selectedBusinessKey, business.id);
    notifyListeners();
  }

  Future<void> hydrateSelection(Business business) async {
    final existingIndex = businesses.indexWhere(
      (item) => item.id == business.id,
    );
    if (existingIndex >= 0) {
      businesses[existingIndex] = business;
    } else {
      businesses = [...businesses, business];
    }

    await selectBusiness(business);
  }
}
