import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/bill.dart';
import '../../models/booking.dart';
import '../../providers/auth_provider.dart';
import '../../providers/bill_provider.dart';
import '../../providers/booking_provider.dart';
import '../../providers/order_provider.dart';
import '../../providers/pc_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../support/support_center_screen.dart';

class BillScreen extends StatefulWidget {
  final int? bookingId;
  final int? billId;

  const BillScreen({super.key, this.bookingId, this.billId})
    : assert(bookingId != null || billId != null);

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  bool useLoyalty = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadData);
  }

  Future<void> _loadData() async {
    final billProvider = context.read<BillProvider>();
    final orderProvider = context.read<OrderProvider>();
    final token = context.read<AuthProvider>().token;

    if (token == null || token.isEmpty) {
      return;
    }

    if (widget.billId != null) {
      await billProvider.loadBillDetail(token: token, billId: widget.billId!);
      return;
    }

    if (widget.bookingId != null) {
      await billProvider.loadLiveSession(
        token: token,
        bookingId: widget.bookingId!,
      );
      await orderProvider.loadOrderBill(token, widget.bookingId!);
    }
  }

  Future<void> _openSupportCenter() async {
    final selectedBill = context.read<BillProvider>().selectedBill;
    final bookings = context.read<BookingProvider>().bookings;
    Booking? booking;
    final targetBookingId = selectedBill?.bookingId ?? widget.bookingId;
    for (final item in bookings) {
      if (item.bookingId == targetBookingId) {
        booking = item;
        break;
      }
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => SupportCenterScreen(
          businessId: selectedBill?.businessId ?? booking?.businessId,
          businessName: booking?.businessName,
          bookingId: selectedBill?.bookingId ?? widget.bookingId,
          billId: widget.billId,
        ),
      ),
    );
  }

  Future<void> _settle() async {
    if (widget.bookingId == null) {
      return;
    }

    final auth = context.read<AuthProvider>();
    final billProvider = context.read<BillProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final pcProvider = context.read<PcProvider>();
    final token = auth.token;
    int? bookingBusinessId;
    for (final booking in bookingProvider.bookings) {
      if (booking.bookingId == widget.bookingId) {
        bookingBusinessId = booking.businessId;
        break;
      }
    }
    if (token == null || token.isEmpty) {
      return;
    }
    final success = await billProvider.settleBill(
      token: token,
      bookingId: widget.bookingId!,
      useLoyalty: useLoyalty,
      paymentMethod: 'cash',
    );

    if (!mounted) {
      return;
    }

    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(billProvider.errorMessage ?? 'Settlement failed'),
        ),
      );
      return;
    }

    final settlement =
        billProvider.latestSettlement ?? const <String, dynamic>{};
    final earned = int.tryParse('${settlement['earned_loyalty'] ?? 0}') ?? 0;
    final used = int.tryParse('${settlement['loyalty_used'] ?? 0}') ?? 0;
    final billedSlots =
        int.tryParse('${settlement['billable_slots'] ?? 0}') ?? 0;
    final releasedSlots =
        int.tryParse('${settlement['released_slots'] ?? 0}') ?? 0;
    final currentUser = auth.user;
    if (currentUser != null) {
      auth.syncUser(
        currentUser.copyWith(
          loyaltyPoints: math.max(0, currentUser.loyaltyPoints - used + earned),
        ),
      );
      await bookingProvider.loadUserBookings(
        token: token,
        userId: currentUser.id,
      );
      await billProvider.loadUserBills(token: token, userId: currentUser.id);
    }
    await pcProvider.loadPCs(businessId: bookingBusinessId);

    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) {
        final summaryLines = <String>[
          'Final amount: Rs ${double.tryParse('${settlement['final_amount'] ?? 0}')?.toStringAsFixed(2) ?? '0.00'}',
          'Charged slots: $billedSlots',
          if (releasedSlots > 0) 'Released future slots: $releasedSlots',
          'Earned loyalty: $earned',
        ];

        return AlertDialog(
          title: const Text('Bill settled'),
          content: Text(summaryLines.join('\n')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        );
      },
    );

    if (mounted) {
      Navigator.pop(context);
    }
  }

  Future<void> _shareReceipt(Bill bill, BuildContext buttonContext) async {
    final token = context.read<AuthProvider>().token;
    if (token == null || token.isEmpty) return;
    final provider = context.read<BillProvider>();
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    final bytes = await provider.downloadReceipt(
      token: token,
      billId: bill.billId,
    );
    if (!mounted || bytes == null) {
      final message = provider.errorMessage;
      if (mounted && message != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
      return;
    }
    final receiptName = (bill.receiptNumber?.isNotEmpty ?? false)
        ? bill.receiptNumber!
        : 'GG-BILL-${bill.billId}';
    await SharePlus.instance.share(
      ShareParams(
        title: 'GameGrub receipt $receiptName',
        files: [XFile.fromData(bytes, mimeType: 'application/pdf')],
        fileNameOverrides: ['$receiptName.pdf'],
        sharePositionOrigin: origin,
      ),
    );
  }

  Future<void> _requestOrderRefund(Bill bill, BillOrder order) async {
    final amountController = TextEditingController(
      text: order.totalAmount.toStringAsFixed(2),
    );
    final reasonController = TextEditingController();
    final request = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Refund order #${order.orderId}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Requested amount',
                prefixText: 'Rs ',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Reason'),
            ),
            const Text(
              'The café team will review this request. Online refunds return through the original payment method.',
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () {
              final amount = double.tryParse(amountController.text.trim());
              final reason = reasonController.text.trim();
              if (amount == null ||
                  amount <= 0 ||
                  amount > order.totalAmount ||
                  reason.isEmpty) {
                return;
              }
              Navigator.pop(dialogContext, {
                'amount': amount,
                'reason': reason,
              });
            },
            child: const Text('Send request'),
          ),
        ],
      ),
    );
    amountController.dispose();
    reasonController.dispose();
    if (request == null || !mounted) return;
    final auth = context.read<AuthProvider>();
    final provider = context.read<BillProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) return;
    final success = await provider.requestOrderRefund(
      token: token,
      billId: bill.billId,
      bookingId: bill.bookingId,
      orderId: order.orderId,
      amount: request['amount'] as double,
      reason: request['reason'] as String,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? provider.refundMessage ?? 'Refund request received.'
              : provider.errorMessage ?? 'Refund request could not be sent.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final billProvider = context.watch<BillProvider>();
    final orderProvider = context.watch<OrderProvider>();

    if (widget.billId != null) {
      final bill = billProvider.selectedBill;
      return Scaffold(
        appBar: AppBar(title: const Text('Invoice')),
        backgroundColor: AppTheme.background,
        body: billProvider.isLoading && bill == null
            ? const Center(child: CircularProgressIndicator())
            : bill == null
            ? Center(
                child: Text(billProvider.errorMessage ?? 'Bill not found.'),
              )
            : AppBackdrop(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    HeroGlassPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Invoice #${bill.billId}',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 8),
                          if (bill.receiptNumber != null)
                            Text('Receipt: ${bill.receiptNumber}'),
                          if (bill.paymentReceiptNumber != null)
                            Text(
                              'Payment reference: ${bill.paymentReceiptNumber}',
                            ),
                          Text('Booking ID: ${bill.bookingId}'),
                          if (bill.specs != null) Text('PC: ${bill.specs}'),
                          if (bill.customerName != null)
                            Text('Customer: ${bill.customerName}'),
                          if (bill.mobile != null)
                            Text('Mobile: ${bill.mobile}'),
                          if (bill.paymentMethod != null)
                            Text(
                              'Payment: ${titleCase(bill.paymentMethod!.replaceAll('_', ' '))}',
                            ),
                          if (bill.paymentReference != null &&
                              bill.paymentReference!.trim().isNotEmpty)
                            Text('Reference: ${bill.paymentReference}'),
                          if (bill.createdAt != null)
                            Text(
                              'Settled at: ${formatDateTime(bill.createdAt)}',
                            ),
                          const SizedBox(height: 14),
                          Builder(
                            builder: (buttonContext) => OutlinedButton.icon(
                              onPressed: () =>
                                  _shareReceipt(bill, buttonContext),
                              icon: const Icon(Icons.share_outlined),
                              label: const Text('Download or share receipt'),
                            ),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: _openSupportCenter,
                            icon: const Icon(Icons.support_agent_outlined),
                            label: const Text('Get help with this bill'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    GlassPanel(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        children: [
                          _BillRow(label: 'Gaming', value: bill.gamingCost),
                          _BillRow(label: 'Food', value: bill.foodCost),
                          _BillRow(label: 'Subtotal', value: bill.subtotal),
                          if (bill.convenienceFee > 0)
                            _BillRow(
                              label: 'Convenience fee',
                              value: bill.convenienceFee,
                            ),
                          _BillRow(
                            label: 'Loyalty used',
                            value: bill.loyaltyUsed,
                          ),
                          _BillRow(
                            label: 'Final amount',
                            value: bill.finalAmount,
                            emphasize: true,
                          ),
                        ],
                      ),
                    ),
                    if (bill.items.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      GlassPanel(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Food items',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 14),
                            ...bill.items.map(
                              (item) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text('${item.name} x${item.qty}'),
                                    ),
                                    Text('Rs ${item.total.toStringAsFixed(0)}'),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (bill.orders.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      GlassPanel(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Refund requests',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 12),
                            ...bill.refundRequests.map(
                              (refund) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Text(
                                  '${refund['refund_number'] ?? 'Refund'} · ${titleCase('${refund['status'] ?? 'requested'}'.replaceAll('_', ' '))}\n${refund['outcome_message'] ?? refund['failure_description'] ?? ''}',
                                ),
                              ),
                            ),
                            ...bill.orders
                                .where((order) => order.status == 'closed')
                                .map(
                                  (order) => Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            'Order #${order.orderId} · Rs ${order.totalAmount.toStringAsFixed(2)}',
                                          ),
                                        ),
                                        TextButton(
                                          onPressed: billProvider.isRefunding
                                              ? null
                                              : () => _requestOrderRefund(
                                                  bill,
                                                  order,
                                                ),
                                          child: const Text('Request refund'),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
      );
    }

    final live = billProvider.liveSession;
    return Scaffold(
      appBar: AppBar(title: const Text('Live bill')),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (live == null && billProvider.errorMessage != null)
              GlassPanel(
                padding: const EdgeInsets.all(20),
                child: Text(billProvider.errorMessage!),
              )
            else if (live == null)
              const Center(child: CircularProgressIndicator())
            else ...[
              GlassPanel(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Booking #${live.bookingId}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 18),
                    _BillRow(
                      label: 'Booked slots',
                      value: live.bookedSlots.toDouble(),
                      isCurrency: false,
                    ),
                    _BillRow(
                      label: 'Charged slots',
                      value: live.billableSlots.toDouble(),
                      isCurrency: false,
                    ),
                    if (live.futureSlots > 0)
                      _BillRow(
                        label: 'Slots released on settle',
                        value: live.futureSlots.toDouble(),
                        isCurrency: false,
                      ),
                    _BillRow(
                      label: 'Session minutes',
                      value: live.sessionMinutes.toDouble(),
                      isCurrency: false,
                    ),
                    _BillRow(label: 'Gaming', value: live.gamingCost),
                    _BillRow(label: 'Food', value: live.foodTotal),
                    _BillRow(label: 'Subtotal', value: live.subtotal),
                    if (live.convenienceFee > 0)
                      _BillRow(
                        label: 'Convenience fee',
                        value: live.convenienceFee,
                      ),
                    _BillRow(
                      label: 'Loyalty discount',
                      value: live.loyaltyDiscount,
                    ),
                    _BillRow(
                      label: 'Current total',
                      value: live.finalTotal,
                      emphasize: true,
                    ),
                  ],
                ),
              ),
              if (orderProvider.orderSummary != null) ...[
                const SizedBox(height: 20),
                GlassPanel(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Food bill',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 14),
                      ...orderProvider.orderSummary!.items.map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text('${item.name} x${item.qty}'),
                              ),
                              Text('Rs ${item.total.toStringAsFixed(0)}'),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _openSupportCenter,
                icon: const Icon(Icons.support_agent_outlined),
                label: const Text('Get help with this booking or order'),
              ),
              const SizedBox(height: 20),
              SwitchListTile.adaptive(
                value: useLoyalty,
                onChanged: (value) {
                  setState(() {
                    useLoyalty = value;
                  });
                },
                title: const Text('Use loyalty points while settling'),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: billProvider.isSettling ? null : _settle,
                  child: billProvider.isSettling
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Settle bill'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  final String label;
  final double value;
  final bool emphasize;
  final bool isCurrency;

  const _BillRow({
    required this.label,
    required this.value,
    this.emphasize = false,
    this.isCurrency = true,
  });

  @override
  Widget build(BuildContext context) {
    return AppDataRow(
      label: label,
      value: isCurrency
          ? 'Rs ${value.toStringAsFixed(2)}'
          : value.toStringAsFixed(0),
      emphasize: emphasize,
      padding: const EdgeInsets.symmetric(vertical: 8),
    );
  }
}
