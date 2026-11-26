class PaymentMethodOption {
  final String code;
  final String label;
  final String description;

  const PaymentMethodOption({
    required this.code,
    required this.label,
    required this.description,
  });

  factory PaymentMethodOption.fromJson(Map<String, dynamic> json) {
    return PaymentMethodOption(
      code: '${json['code'] ?? 'cash'}',
      label: '${json['label'] ?? 'Cash'}',
      description: '${json['description'] ?? ''}',
    );
  }
}

class PaymentRecord {
  final int paymentId;
  final double amount;
  final double finalAmount;
  final double customerFinalAmount;
  final double capturedAmount;
  final double convenienceFee;
  final double commissionRate;
  final double platformCommission;
  final double sellerNetAmount;
  final String status;
  final String paymentMethod;
  final String paymentReference;
  final String gatewayStatus;
  final DateTime? paidAt;

  const PaymentRecord({
    required this.paymentId,
    required this.amount,
    required this.finalAmount,
    required this.customerFinalAmount,
    required this.capturedAmount,
    required this.convenienceFee,
    required this.commissionRate,
    required this.platformCommission,
    required this.sellerNetAmount,
    required this.status,
    required this.paymentMethod,
    required this.paymentReference,
    required this.gatewayStatus,
    required this.paidAt,
  });

  String get normalizedStatus => status.toLowerCase().trim();

  bool get isPaid => normalizedStatus == 'paid';

  bool get hasCapturedAmount => capturedAmount > 0;

  bool get hasReference => paymentReference.trim().isNotEmpty;

  factory PaymentRecord.fromJson(Map<String, dynamic> json) {
    final status = '${json['status'] ?? 'pending'}';
    final customerFinalAmount =
        double.tryParse(
          '${json['customer_final_amount'] ?? json['final_amount'] ?? 0}',
        ) ??
        0;
    final double legacyCaptured =
        [
          'advance_paid',
          'partially_paid',
          'paid',
        ].contains(status.toLowerCase())
        ? customerFinalAmount
        : 0.0;
    return PaymentRecord(
      paymentId: int.tryParse('${json['payment_id'] ?? 0}') ?? 0,
      amount: double.tryParse('${json['amount'] ?? 0}') ?? 0,
      finalAmount: double.tryParse('${json['final_amount'] ?? 0}') ?? 0,
      customerFinalAmount: customerFinalAmount,
      capturedAmount:
          double.tryParse('${json['captured_amount'] ?? legacyCaptured}') ??
          legacyCaptured,
      convenienceFee: double.tryParse('${json['convenience_fee'] ?? 0}') ?? 0,
      commissionRate: double.tryParse('${json['commission_rate'] ?? 0}') ?? 0,
      platformCommission:
          double.tryParse('${json['platform_commission'] ?? 0}') ?? 0,
      sellerNetAmount:
          double.tryParse('${json['seller_net_amount'] ?? 0}') ?? 0,
      status: status,
      paymentMethod: '${json['payment_method'] ?? 'unassigned'}',
      paymentReference: '${json['payment_reference'] ?? ''}',
      gatewayStatus: '${json['gateway_status'] ?? 'awaiting_settlement'}',
      paidAt: DateTime.tryParse('${json['paid_at'] ?? ''}'),
    );
  }
}

class PaymentBreakdown {
  final int sessionMinutes;
  final int bookedSlots;
  final int billableSlots;
  final int futureSlots;
  final double gamingCost;
  final double foodTotal;
  final double subtotal;
  final double convenienceFee;
  final double customerSubtotal;
  final double capturedAmount;
  final double openBalanceBeforeLoyalty;
  final double loyaltyDiscount;
  final double serviceFinalTotal;
  final double finalTotal;
  final double amountDue;
  final double commissionRate;
  final double platformCommission;
  final double sellerNetAmount;
  final int earnedLoyaltyPreview;

  const PaymentBreakdown({
    required this.sessionMinutes,
    required this.bookedSlots,
    required this.billableSlots,
    required this.futureSlots,
    required this.gamingCost,
    required this.foodTotal,
    required this.subtotal,
    required this.convenienceFee,
    required this.customerSubtotal,
    required this.capturedAmount,
    required this.openBalanceBeforeLoyalty,
    required this.loyaltyDiscount,
    required this.serviceFinalTotal,
    required this.finalTotal,
    required this.amountDue,
    required this.commissionRate,
    required this.platformCommission,
    required this.sellerNetAmount,
    required this.earnedLoyaltyPreview,
  });

  factory PaymentBreakdown.fromJson(Map<String, dynamic> json) {
    return PaymentBreakdown(
      sessionMinutes: int.tryParse('${json['session_minutes'] ?? 0}') ?? 0,
      bookedSlots: int.tryParse('${json['booked_slots'] ?? 0}') ?? 0,
      billableSlots: int.tryParse('${json['billable_slots'] ?? 0}') ?? 0,
      futureSlots: int.tryParse('${json['future_slots'] ?? 0}') ?? 0,
      gamingCost: double.tryParse('${json['gaming_cost'] ?? 0}') ?? 0,
      foodTotal: double.tryParse('${json['food_total'] ?? 0}') ?? 0,
      subtotal: double.tryParse('${json['subtotal'] ?? 0}') ?? 0,
      convenienceFee: double.tryParse('${json['convenience_fee'] ?? 0}') ?? 0,
      customerSubtotal:
          double.tryParse(
            '${json['customer_subtotal'] ?? json['subtotal'] ?? 0}',
          ) ??
          0,
      capturedAmount: double.tryParse('${json['captured_amount'] ?? 0}') ?? 0,
      openBalanceBeforeLoyalty:
          double.tryParse('${json['open_balance_before_loyalty'] ?? 0}') ?? 0,
      loyaltyDiscount: double.tryParse('${json['loyalty_discount'] ?? 0}') ?? 0,
      serviceFinalTotal:
          double.tryParse(
            '${json['service_final_total'] ?? json['final_total'] ?? 0}',
          ) ??
          0,
      finalTotal: double.tryParse('${json['final_total'] ?? 0}') ?? 0,
      amountDue: double.tryParse('${json['amount_due'] ?? 0}') ?? 0,
      commissionRate: double.tryParse('${json['commission_rate'] ?? 0}') ?? 0,
      platformCommission:
          double.tryParse('${json['platform_commission'] ?? 0}') ?? 0,
      sellerNetAmount:
          double.tryParse('${json['seller_net_amount'] ?? 0}') ?? 0,
      earnedLoyaltyPreview:
          int.tryParse('${json['earned_loyalty_preview'] ?? 0}') ?? 0,
    );
  }
}

class PaymentSummary {
  final int bookingId;
  final String bookingStatus;
  final int userId;
  final String userName;
  final int loyaltyPoints;
  final PaymentRecord payment;
  final PaymentBreakdown liveBreakdown;

  const PaymentSummary({
    required this.bookingId,
    required this.bookingStatus,
    required this.userId,
    required this.userName,
    required this.loyaltyPoints,
    required this.payment,
    required this.liveBreakdown,
  });

  factory PaymentSummary.fromJson(Map<String, dynamic> json) {
    return PaymentSummary(
      bookingId: int.tryParse('${json['booking_id'] ?? 0}') ?? 0,
      bookingStatus: '${json['booking_status'] ?? 'confirmed'}',
      userId: int.tryParse('${json['user_id'] ?? 0}') ?? 0,
      userName: '${json['user_name'] ?? 'Player'}',
      loyaltyPoints: int.tryParse('${json['loyalty_points'] ?? 0}') ?? 0,
      payment: PaymentRecord.fromJson(
        Map<String, dynamic>.from((json['payment'] as Map?) ?? const {}),
      ),
      liveBreakdown: PaymentBreakdown.fromJson(
        Map<String, dynamic>.from((json['live_breakdown'] as Map?) ?? const {}),
      ),
    );
  }
}
