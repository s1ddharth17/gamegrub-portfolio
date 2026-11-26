import 'package:flutter/material.dart';

import '../models/pc.dart';
import '../services/pc_service.dart';

class PcProvider with ChangeNotifier {
  final PcService _service = PcService();

  List<PC> pcs = [];
  int? loadedBusinessId;
  bool isLoading = false;
  String? errorMessage;

  Future<void> loadPCs({int? businessId}) async {
    isLoading = true;
    errorMessage = null;
    loadedBusinessId = businessId;
    notifyListeners();

    try {
      final data = await _service.fetchPCs(businessId: businessId);
      pcs = data
          .map((item) => PC.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
