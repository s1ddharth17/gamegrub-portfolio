import 'package:flutter/material.dart';

import '../models/menu.dart';
import '../models/order.dart';
import '../services/order_service.dart';

class OrderProvider with ChangeNotifier {
  final OrderService _service = OrderService();

  List<MenuItemModel> menu = [];
  OrderSummary? orderSummary;
  int? loadedBusinessId;
  final Map<int, int> selectedQty = <int, int>{};
  bool isLoading = false;
  bool isSubmitting = false;
  String? errorMessage;

  double get localSelectionTotal {
    return menu.fold<double>(0, (sum, item) {
      return sum + ((selectedQty[item.id] ?? 0) * item.amount);
    });
  }

  int get cartItemCount {
    return selectedQty.values.fold<int>(0, (sum, qty) => sum + qty);
  }

  bool get hasCartItems => selectedQty.isNotEmpty;

  List<String> get categories {
    final values =
        menu
            .where((item) => item.isAvailable)
            .map((item) => item.category)
            .toSet()
            .toList()
          ..sort();
    return values;
  }

  List<MenuItemModel> get featuredMenu {
    return menu.where((item) => item.isAvailable && item.isFeatured).toList();
  }

  List<MenuItemModel> get availableMenu {
    return menu.where((item) => item.isAvailable).toList();
  }

  List<MenuItemModel> itemsForCategory(String category) {
    return availableMenu.where((item) => item.category == category).toList();
  }

  List<CartEntry> get cartEntries {
    return menu
        .where((item) => selectedQty.containsKey(item.id))
        .map(
          (item) => CartEntry(item: item, quantity: selectedQty[item.id] ?? 0),
        )
        .where((entry) => entry.quantity > 0)
        .toList();
  }

  Future<void> loadMenu({int? businessId}) async {
    final previousBusinessId = loadedBusinessId;
    isLoading = true;
    errorMessage = null;
    loadedBusinessId = businessId;
    notifyListeners();

    try {
      final data = await _service.fetchMenu(businessId: businessId);
      menu = data
          .map(
            (item) =>
                MenuItemModel.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
      if (previousBusinessId != null &&
          businessId != null &&
          previousBusinessId != businessId) {
        selectedQty.clear();
      } else {
        selectedQty.removeWhere(
          (menuId, _) => !menu.any((item) => item.id == menuId),
        );
      }
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  void updateQuantity(int menuId, int qty) {
    if (qty <= 0) {
      selectedQty.remove(menuId);
    } else {
      selectedQty[menuId] = qty;
    }
    notifyListeners();
  }

  int quantityFor(int menuId) => selectedQty[menuId] ?? 0;

  void clearCart() {
    selectedQty.clear();
    notifyListeners();
  }

  void clearOrderState({bool clearCartItems = false}) {
    orderSummary = null;
    errorMessage = null;
    if (clearCartItems) {
      selectedQty.clear();
    }
    notifyListeners();
  }

  Future<bool> submitOrder(
    String token,
    int bookingId, {
    bool deferPayment = false,
    String? paymentMethod,
    String? paymentReference,
    String? customerNotes,
  }) async {
    if (selectedQty.isEmpty) {
      errorMessage = 'Select at least one item before placing an order.';
      notifyListeners();
      return false;
    }

    isSubmitting = true;
    errorMessage = null;
    notifyListeners();

    try {
      await _service.checkoutOrder(
        token: token,
        bookingId: bookingId,
        items: selectedQty.entries
            .map((entry) => {'menu_id': entry.key, 'qty': entry.value})
            .toList(),
        deferPayment: deferPayment,
        paymentMethod: paymentMethod,
        paymentReference: paymentReference,
        customerNotes: customerNotes,
      );
      selectedQty.clear();
      await loadOrderBill(token, bookingId);
      return true;
    } catch (e) {
      errorMessage = e.toString();
      notifyListeners();
      return false;
    } finally {
      isSubmitting = false;
      notifyListeners();
    }
  }

  Future<void> loadOrderBill(String token, int bookingId) async {
    try {
      final response = await _service.fetchOrderBill(
        token: token,
        bookingId: bookingId,
      );
      orderSummary = OrderSummary.fromJson(response);
    } catch (_) {
      orderSummary = null;
    }
    notifyListeners();
  }
}

class CartEntry {
  final MenuItemModel item;
  final int quantity;

  CartEntry({required this.item, required this.quantity});
}
