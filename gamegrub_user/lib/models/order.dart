class OrderLineItem {
  final int itemId;
  final int menuId;
  final String name;
  final String category;
  final int qty;
  final double price;
  final double total;

  OrderLineItem({
    required this.itemId,
    required this.menuId,
    required this.name,
    required this.category,
    required this.qty,
    required this.price,
    required this.total,
  });

  factory OrderLineItem.fromJson(Map<String, dynamic> json) {
    return OrderLineItem(
      itemId: int.tryParse('${json['item_id'] ?? 0}') ?? 0,
      menuId: int.tryParse('${json['menu_id'] ?? 0}') ?? 0,
      name: '${json['name'] ?? 'Item'}',
      category: '${json['category'] ?? 'Snacks'}',
      qty: int.tryParse('${json['qty'] ?? 0}') ?? 0,
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      total: double.tryParse('${json['total'] ?? 0}') ?? 0,
    );
  }
}

class OrderTicket {
  final int orderId;
  final int bookingId;
  final String status;
  final String notes;
  final DateTime? acceptedAt;
  final DateTime? preparingAt;
  final DateTime? readyAt;
  final DateTime? deliveredAt;
  final DateTime? etaAt;
  final int? etaMinutes;
  final double totalAmount;
  final List<OrderLineItem> items;

  OrderTicket({
    required this.orderId,
    required this.bookingId,
    required this.status,
    required this.notes,
    required this.acceptedAt,
    required this.preparingAt,
    required this.readyAt,
    required this.deliveredAt,
    required this.etaAt,
    required this.etaMinutes,
    required this.totalAmount,
    required this.items,
  });

  factory OrderTicket.fromJson(Map<String, dynamic> json) {
    final rawItems = (json['items'] as List?) ?? const [];
    return OrderTicket(
      orderId: int.tryParse('${json['order_id'] ?? 0}') ?? 0,
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      status: '${json['status'] ?? 'active'}',
      notes: '${json['customer_notes'] ?? json['notes'] ?? ''}',
      acceptedAt: DateTime.tryParse('${json['accepted_at'] ?? ''}'),
      preparingAt: DateTime.tryParse('${json['preparing_at'] ?? ''}'),
      readyAt: DateTime.tryParse('${json['ready_at'] ?? ''}'),
      deliveredAt: DateTime.tryParse('${json['delivered_at'] ?? ''}'),
      etaAt: DateTime.tryParse('${json['eta_at'] ?? ''}'),
      etaMinutes: int.tryParse('${json['eta_minutes'] ?? ''}'),
      totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
      items: rawItems
          .map(
            (item) =>
                OrderLineItem.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList(),
    );
  }
}

class OrderSummary {
  final int bookingId;
  final double grandTotal;
  final List<OrderLineItem> items;
  final List<OrderTicket> orders;

  OrderSummary({
    required this.bookingId,
    required this.grandTotal,
    required this.items,
    required this.orders,
  });

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    final rawItems = (json['items'] as List?) ?? const [];
    final rawOrders = (json['orders'] as List?) ?? const [];
    return OrderSummary(
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      grandTotal: double.tryParse('${json['grand_total'] ?? 0}') ?? 0,
      items: rawItems
          .map(
            (item) =>
                OrderLineItem.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList(),
      orders: rawOrders
          .map(
            (order) =>
                OrderTicket.fromJson(Map<String, dynamic>.from(order as Map)),
          )
          .toList(),
    );
  }
}
