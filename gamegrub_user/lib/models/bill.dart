import 'order.dart';

class Bill {
  final int billId;
  final int bookingId;
  final int businessId;
  final double gamingCost;
  final double foodCost;
  final double subtotal;
  final double convenienceFee;
  final double loyaltyUsed;
  final double serviceFinalAmount;
  final double finalAmount;
  final double commissionRate;
  final double platformCommission;
  final double sellerNetAmount;
  final int earnedLoyalty;
  final DateTime? createdAt;
  final String? customerName;
  final String? mobile;
  final String? specs;
  final String? paymentMethod;
  final String? paymentReference;
  final String? receiptNumber;
  final String? paymentReceiptNumber;
  final List<OrderLineItem> items;
  final List<BillOrder> orders;
  final List<Map<String, dynamic>> refundRequests;

  Bill({
    required this.billId,
    required this.bookingId,
    this.businessId = 0,
    required this.gamingCost,
    required this.foodCost,
    required this.subtotal,
    required this.convenienceFee,
    required this.loyaltyUsed,
    required this.serviceFinalAmount,
    required this.finalAmount,
    required this.commissionRate,
    required this.platformCommission,
    required this.sellerNetAmount,
    required this.earnedLoyalty,
    this.createdAt,
    this.customerName,
    this.mobile,
    this.specs,
    this.paymentMethod,
    this.paymentReference,
    this.items = const [],
    this.receiptNumber,
    this.paymentReceiptNumber,
    this.orders = const [],
    this.refundRequests = const [],
  });

  factory Bill.fromJson(Map<String, dynamic> json) {
    final gaming = double.tryParse('${json['gaming_cost'] ?? 0}') ?? 0;
    final food = double.tryParse('${json['food_cost'] ?? 0}') ?? 0;
    return Bill(
      billId: int.tryParse('${json['bill_id'] ?? 0}') ?? 0,
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      businessId: int.tryParse('${json['business_id'] ?? 0}') ?? 0,
      gamingCost: gaming,
      foodCost: food,
      subtotal: double.tryParse('${json['subtotal'] ?? ''}') ?? (gaming + food),
      convenienceFee: double.tryParse('${json['convenience_fee'] ?? 0}') ?? 0,
      loyaltyUsed: double.tryParse('${json['loyalty_used'] ?? 0}') ?? 0,
      serviceFinalAmount: double.tryParse('${json['final_amount'] ?? 0}') ?? 0,
      finalAmount:
          double.tryParse(
            '${json['customer_final_amount'] ?? json['final_amount'] ?? 0}',
          ) ??
          0,
      commissionRate: double.tryParse('${json['commission_rate'] ?? 0}') ?? 0,
      platformCommission:
          double.tryParse('${json['platform_commission'] ?? 0}') ?? 0,
      sellerNetAmount:
          double.tryParse('${json['seller_net_amount'] ?? 0}') ?? 0,
      earnedLoyalty: int.tryParse('${json['earned_loyalty'] ?? 0}') ?? 0,
      createdAt: DateTime.tryParse('${json['created_at'] ?? ''}'),
      customerName: json['name']?.toString() ?? json['user_name']?.toString(),
      mobile: json['mobile']?.toString(),
      specs: json['specs']?.toString(),
      paymentMethod: json['payment_method']?.toString(),
      paymentReference: json['payment_reference']?.toString(),
      receiptNumber: json['receipt_number']?.toString(),
      paymentReceiptNumber: json['payment_receipt_number']?.toString(),
    );
  }

  factory Bill.fromDetailResponse(Map<String, dynamic> json) {
    final rawBill = Map<String, dynamic>.from(json['bill'] as Map);
    final rawItems = (json['items'] as List?) ?? const [];
    final rawOrders = (json['orders'] as List?) ?? const [];
    final rawRefunds = (json['refunds'] as List?) ?? const [];
    final bill = Bill.fromJson(rawBill);
    return Bill(
      billId: bill.billId,
      bookingId: bill.bookingId,
      businessId: bill.businessId,
      gamingCost: bill.gamingCost,
      foodCost: bill.foodCost,
      subtotal: bill.subtotal,
      convenienceFee: bill.convenienceFee,
      loyaltyUsed: bill.loyaltyUsed,
      serviceFinalAmount: bill.serviceFinalAmount,
      finalAmount: bill.finalAmount,
      commissionRate: bill.commissionRate,
      platformCommission: bill.platformCommission,
      sellerNetAmount: bill.sellerNetAmount,
      earnedLoyalty: bill.earnedLoyalty,
      createdAt: bill.createdAt,
      customerName: bill.customerName,
      mobile: bill.mobile,
      specs: bill.specs,
      paymentMethod: bill.paymentMethod,
      paymentReference: bill.paymentReference,
      receiptNumber: bill.receiptNumber,
      paymentReceiptNumber: bill.paymentReceiptNumber,
      items: rawItems
          .map(
            (item) =>
                OrderLineItem.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList(),
      orders: rawOrders
          .map(
            (order) =>
                BillOrder.fromJson(Map<String, dynamic>.from(order as Map)),
          )
          .toList(),
      refundRequests: rawRefunds
          .map((refund) => Map<String, dynamic>.from(refund as Map))
          .toList(),
    );
  }
}

class BillOrder {
  final int orderId;
  final String status;
  final double totalAmount;

  const BillOrder({
    required this.orderId,
    required this.status,
    required this.totalAmount,
  });

  factory BillOrder.fromJson(Map<String, dynamic> json) => BillOrder(
    orderId: int.tryParse('${json['order_id'] ?? 0}') ?? 0,
    status: '${json['status'] ?? ''}',
    totalAmount: double.tryParse('${json['total_amount'] ?? 0}') ?? 0,
  );
}
