class SessionSnapshot {
  final int bookingId;
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
  final int loyaltyPoints;

  SessionSnapshot({
    required this.bookingId,
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
    required this.loyaltyPoints,
  });

  factory SessionSnapshot.fromJson(
    Map<String, dynamic> json, {
    required int bookingId,
  }) {
    return SessionSnapshot(
      bookingId: bookingId,
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
      loyaltyPoints: int.tryParse('${json['loyalty_points'] ?? 0}') ?? 0,
    );
  }
}
