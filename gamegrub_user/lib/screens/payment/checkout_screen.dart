import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/booking.dart';
import '../../models/payment.dart';
import '../../providers/auth_provider.dart';
import '../../providers/bill_provider.dart';
import '../../providers/booking_provider.dart';
import '../../providers/order_provider.dart';
import '../../providers/pc_provider.dart';
import '../../services/payment_service.dart';
import 'payment_attempt_status_dialog.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';

class CheckoutScreen extends StatefulWidget {
  final int bookingId;

  const CheckoutScreen({super.key, required this.bookingId});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final PaymentService _paymentService = PaymentService();
  String _idempotencyKey = '';

  String paymentMethod = 'cash';
  bool useLoyalty = true;
  bool isLoading = true;
  bool isStartingOnlinePayment = false;
  String? loadError;
  Booking? booking;
  PaymentSummary? paymentSummary;
  List<PaymentMethodOption> paymentMethods = const [];

  @override
  void initState() {
    super.initState();
    _idempotencyKey = _newIdempotencyKey();
    Future.microtask(_loadData);
  }

  String _newIdempotencyKey() =>
      'settlement-${DateTime.now().microsecondsSinceEpoch}-${math.Random.secure().nextInt(0x7fffffff)}';

  Future<void> _loadData() async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final orderProvider = context.read<OrderProvider>();
    final token = auth.token;

    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          loadError = 'Session expired. Please log in again.';
          isLoading = false;
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        isLoading = true;
        loadError = null;
      });
    }

    try {
      if (auth.user != null) {
        await bookingProvider.loadUserBookings(
          token: token,
          userId: auth.user!.id,
        );
      }

      final results = await Future.wait<dynamic>([
        _paymentService.fetchMethods(),
        _paymentService.fetchBookingSummary(
          token: token,
          bookingId: widget.bookingId,
        ),
        orderProvider.loadOrderBill(token, widget.bookingId),
      ]);

      final loadedMethods = results[0] as List<PaymentMethodOption>;
      final loadedSummary = results[1] as PaymentSummary;
      final loadedBooking = _findBooking(
        bookingProvider.bookings,
        widget.bookingId,
      );
      final resolvedMethod = _resolveInitialMethod(
        loadedMethods,
        loadedSummary.payment.paymentMethod,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        booking = loadedBooking;
        paymentMethods = loadedMethods;
        paymentSummary = loadedSummary;
        paymentMethod = resolvedMethod;
        useLoyalty = loadedSummary.liveBreakdown.loyaltyDiscount > 0;
        isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        loadError = error.toString();
        isLoading = false;
      });
    }
  }

  Booking? _findBooking(List<Booking> bookings, int bookingId) {
    for (final booking in bookings) {
      if (booking.bookingId == bookingId) {
        return booking;
      }
    }
    return null;
  }

  String _resolveInitialMethod(
    List<PaymentMethodOption> methods,
    String currentMethod,
  ) {
    final normalizedMethod = currentMethod.toLowerCase().trim();
    for (final method in methods) {
      if (method.code == normalizedMethod) {
        return method.code;
      }
    }
    return methods.isEmpty ? 'cash' : methods.first.code;
  }

  bool get _isPaid => paymentSummary?.payment.isPaid ?? false;

  bool get _checkoutUnlocked {
    final status = paymentSummary?.bookingStatus.toLowerCase().trim() ?? '';
    return _isPaid || status == 'session_over' || status == 'closed';
  }

  double get _capturedAmount {
    final payment = paymentSummary?.payment;
    if (payment == null) {
      return 0;
    }

    return payment.capturedAmount;
  }

  bool get _canUseLoyalty {
    return (paymentSummary?.liveBreakdown.loyaltyDiscount ?? 0) > 0;
  }

  double get _balanceBeforeLoyalty {
    final breakdown = paymentSummary?.liveBreakdown;
    if (breakdown == null) {
      return 0;
    }

    return breakdown.openBalanceBeforeLoyalty;
  }

  double get _amountDue {
    final breakdown = paymentSummary?.liveBreakdown;
    if (breakdown == null) {
      return 0;
    }

    return useLoyalty ? breakdown.amountDue : _balanceBeforeLoyalty;
  }

  Future<void> _confirmPayment() async {
    final summary = paymentSummary;
    if (summary == null || _isPaid) {
      return;
    }

    if (_amountDue > 0 && paymentMethod == 'cash') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please ask café staff to record the cash payment.'),
        ),
      );
      return;
    }

    if (_amountDue > 0 && paymentMethod == 'razorpay') {
      await _startOnlineSettlement();
      return;
    }

    final selectedMethod = _selectedMethod;
    final outstandingAmount = _amountDue;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          outstandingAmount > 0 ? 'Settle session payment' : 'Close session',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DialogRow(label: 'Booking', value: '#${summary.bookingId}'),
            _DialogRow(
              label: 'Session subtotal',
              value: formatCurrency(summary.liveBreakdown.subtotal),
            ),
            if (summary.liveBreakdown.convenienceFee > 0)
              _DialogRow(
                label: 'Convenience fee',
                value: formatCurrency(summary.liveBreakdown.convenienceFee),
              ),
            _DialogRow(
              label: 'Advance already paid',
              value: formatCurrency(_capturedAmount),
            ),
            if (outstandingAmount > 0)
              _DialogRow(
                label: 'Method',
                value: selectedMethod?.label ?? titleCase(paymentMethod),
              ),
            _DialogRow(
              label: outstandingAmount > 0
                  ? 'Remaining due now'
                  : 'Remaining balance',
              value: formatCurrency(outstandingAmount),
            ),
            _DialogRow(
              label: 'Loyalty',
              value: useLoyalty ? 'Applied at checkout' : 'Not used',
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(outstandingAmount > 0 ? 'Confirm' : 'Close session'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) {
      return;
    }

    final billProvider = context.read<BillProvider>();
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final orderProvider = context.read<OrderProvider>();
    final pcProvider = context.read<PcProvider>();
    final token = auth.token;

    if (token == null || token.isEmpty) {
      return;
    }

    final success = await billProvider.settleBill(
      token: token,
      bookingId: widget.bookingId,
      useLoyalty: useLoyalty,
      paymentMethod: paymentMethod,
      paymentReference: null,
    );

    if (!mounted) {
      return;
    }

    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            billProvider.errorMessage ?? 'Could not complete payment.',
          ),
        ),
      );
      return;
    }

    final settlement =
        billProvider.latestSettlement ?? const <String, dynamic>{};
    final earned = int.tryParse('${settlement['earned_loyalty'] ?? 0}') ?? 0;
    final used = int.tryParse('${settlement['loyalty_used'] ?? 0}') ?? 0;
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

    orderProvider.clearOrderState(clearCartItems: true);
    await pcProvider.loadPCs(businessId: booking?.businessId);

    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          outstandingAmount > 0 ? 'Session settled' : 'Session closed',
        ),
        content: Text(
          outstandingAmount > 0
              ? 'Paid now: ${formatCurrency(outstandingAmount)}\n'
                    'Method: ${selectedMethod?.label ?? titleCase(paymentMethod)}\n'
                    'Loyalty earned: $earned pts'
              : 'No extra payment was needed.\nLoyalty earned: $earned pts',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Done'),
          ),
        ],
      ),
    );

    if (mounted) {
      Navigator.pop(context, true);
    }
  }

  Future<void> _startOnlineSettlement() async {
    final auth = context.read<AuthProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) {
      return;
    }

    setState(() => isStartingOnlinePayment = true);
    try {
      final intent = await _paymentService.createSessionIntent(
        token: token,
        bookingId: widget.bookingId,
        useLoyalty: useLoyalty,
        idempotencyKey: _idempotencyKey,
      );
      final checkoutUrl = Uri.tryParse('${intent['checkout_url'] ?? ''}');
      final attemptId = '${intent['attempt_id'] ?? ''}';
      if (checkoutUrl == null || !checkoutUrl.hasScheme || attemptId.isEmpty) {
        throw Exception('Secure checkout could not be opened.');
      }

      final status = await _showPaymentAttemptStatus(
        token: token,
        attemptId: attemptId,
        checkoutUrl: checkoutUrl.toString(),
      );
      if (!mounted) {
        return;
      }
      if (status == 'captured') {
        await _loadData();
        if (!mounted) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Payment verified. Review the updated balance, then close the session.',
            ),
          ),
        );
      } else {
        if (status == 'failed' ||
            status == 'cancelled' ||
            status == 'expired') {
          _idempotencyKey = _newIdempotencyKey();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              status == 'failed' || status == 'cancelled' || status == 'expired'
                  ? 'Payment was not completed. You can try online checkout again.'
                  : 'Payment is still pending verification. Check again after returning from Razorpay.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceFirst('Exception: ', '')),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => isStartingOnlinePayment = false);
      }
    }
  }

  Future<String> _showPaymentAttemptStatus({
    required String token,
    required String attemptId,
    required String checkoutUrl,
  }) async {
    return await showDialog<String>(
          context: context,
          builder: (dialogContext) => PaymentAttemptStatusDialog(
            token: token,
            attemptId: attemptId,
            checkoutUrl: checkoutUrl,
            fetchAttemptStatus: _paymentService.fetchAttemptStatus,
          ),
        ) ??
        'pending';
  }

  PaymentMethodOption? get _selectedMethod {
    for (final method in paymentMethods) {
      if (method.code == paymentMethod) {
        return method;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final billProvider = context.watch<BillProvider>();
    final orderProvider = context.watch<OrderProvider>();
    final summary = paymentSummary;
    final payment = summary?.payment;
    final breakdown = summary?.liveBreakdown;
    final checkoutUnlocked = _checkoutUnlocked;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
        child: RefreshIndicator(
          onRefresh: _loadData,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
            children: [
              HeroGlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Session checkout',
                                style: Theme.of(
                                  context,
                                ).textTheme.headlineSmall,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                checkoutUnlocked
                                    ? 'Settle the session from one clear summary and close it when the balance is done.'
                                    : 'Checkout unlocks automatically after the session ends.',
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ],
                          ),
                        ),
                        if (!isLoading && summary != null)
                          _CheckoutAmountBadge(
                            label: checkoutUnlocked
                                ? 'Due now'
                                : 'Session status',
                            value: checkoutUnlocked
                                ? formatCurrency(_amountDue)
                                : titleCase(
                                    summary.bookingStatus.replaceAll('_', ' '),
                                  ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              if (isLoading)
                const GlassPanel(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (loadError != null)
                GlassPanel(
                  padding: const EdgeInsets.all(24),
                  child: Text(loadError!),
                )
              else if (summary == null || breakdown == null || payment == null)
                const GlassPanel(
                  padding: EdgeInsets.all(24),
                  child: Text('Payment details are not available right now.'),
                )
              else ...[
                GlassPanel(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Booking #${summary.bookingId}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        summary.userName,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      if (booking?.timeRange != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Slot: ${booking!.timeRange}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          _InfoPill(
                            label: 'Session',
                            value: titleCase(
                              summary.bookingStatus.replaceAll('_', ' '),
                            ),
                          ),
                          _InfoPill(
                            label: 'Payment',
                            value: titleCase(
                              payment.status.replaceAll('_', ' '),
                            ),
                          ),
                          _InfoPill(
                            label: 'Advance paid',
                            value: formatCurrency(_capturedAmount),
                          ),
                          _InfoPill(
                            label: 'Loyalty balance',
                            value: '${summary.loyaltyPoints} pts',
                          ),
                          _InfoPill(
                            label: 'Gateway',
                            value: titleCase(
                              payment.gatewayStatus.replaceAll('_', ' '),
                            ),
                          ),
                        ],
                      ),
                      if (payment.hasReference) ...[
                        const SizedBox(height: 16),
                        Text(
                          'Reference: ${payment.paymentReference}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (checkoutUnlocked)
                  GlassPanel(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Settlement summary',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: _CheckoutValueTile(
                                label: 'Remaining due',
                                value: formatCurrency(_amountDue),
                                highlight: true,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _CheckoutValueTile(
                                label: 'Loyalty to earn',
                                value: '${breakdown.earnedLoyaltyPreview} pts',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 18),
                        AppDataRow(
                          label: 'Reserved slots',
                          value: '${breakdown.bookedSlots}',
                        ),
                        AppDataRow(
                          label: 'Gaming total',
                          value: formatCurrency(breakdown.gamingCost),
                        ),
                        AppDataRow(
                          label: 'Food total',
                          value: formatCurrency(breakdown.foodTotal),
                        ),
                        AppDataRow(
                          label: 'Session subtotal',
                          value: formatCurrency(breakdown.subtotal),
                        ),
                        if (breakdown.convenienceFee > 0)
                          AppDataRow(
                            label: 'Platform convenience fee',
                            value: formatCurrency(breakdown.convenienceFee),
                          ),
                        AppDataRow(
                          label: 'Customer total before loyalty',
                          value: formatCurrency(breakdown.customerSubtotal),
                        ),
                        if (_capturedAmount > 0)
                          AppDataRow(
                            label: 'Advance already paid',
                            value: formatCurrency(_capturedAmount),
                          ),
                        AppDataRow(
                          label: 'Loyalty available',
                          value: '${summary.loyaltyPoints} pts',
                        ),
                        if (useLoyalty && _canUseLoyalty)
                          AppDataRow(
                            label: 'Loyalty discount',
                            value: formatCurrency(breakdown.loyaltyDiscount),
                          ),
                        AppDataRow(
                          label: 'Final customer total',
                          value: formatCurrency(
                            useLoyalty
                                ? breakdown.finalTotal
                                : breakdown.customerSubtotal,
                          ),
                          padding: EdgeInsets.zero,
                        ),
                      ],
                    ),
                  )
                else
                  GlassPanel(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'Checkout unlocks after the session ends.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ),
                if (orderProvider.orderSummary != null &&
                    orderProvider.orderSummary!.orders.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  GlassPanel(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Food orders',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 14),
                        ...orderProvider.orderSummary!.orders.map(
                          (order) => Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: _CheckoutOrderCard(
                              orderId: order.orderId,
                              status: titleCase(
                                order.status.replaceAll('_', ' '),
                              ),
                              total: formatCurrency(order.totalAmount),
                              children: order.items
                                  .map(
                                    (item) => Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              '${item.name} x ${item.qty}',
                                            ),
                                          ),
                                          Text(formatCurrency(item.total)),
                                        ],
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (checkoutUnlocked) ...[
                  const SizedBox(height: 16),
                  GlassPanel(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isPaid ? 'Payment captured' : 'Close session',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 16),
                        if (_isPaid)
                          Column(
                            children: [
                              AppDataRow(
                                label: 'Method',
                                value: titleCase(
                                  payment.paymentMethod.replaceAll('_', ' '),
                                ),
                              ),
                              AppDataRow(
                                label: 'Status',
                                value: titleCase(
                                  payment.status.replaceAll('_', ' '),
                                ),
                              ),
                              AppDataRow(
                                label: 'Captured amount',
                                value: formatCurrency(payment.capturedAmount),
                              ),
                              if (payment.convenienceFee > 0)
                                AppDataRow(
                                  label: 'Convenience fee included',
                                  value: formatCurrency(payment.convenienceFee),
                                ),
                              AppDataRow(
                                label: 'Service total after loyalty',
                                value: formatCurrency(payment.finalAmount),
                              ),
                              AppDataRow(
                                label: 'Captured at',
                                value: formatDateTime(payment.paidAt),
                              ),
                              if (payment.hasReference)
                                AppDataRow(
                                  label: 'Reference',
                                  value: payment.paymentReference,
                                  padding: EdgeInsets.zero,
                                ),
                            ],
                          )
                        else if (_amountDue == 0)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppDataRow(
                                label: 'Captured so far',
                                value: formatCurrency(_capturedAmount),
                              ),
                              if (payment.hasReference)
                                AppDataRow(
                                  label: 'Last reference',
                                  value: payment.paymentReference,
                                ),
                              Text(
                                'No balance is left to collect. You can close the session now.',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ],
                          )
                        else ...[
                          Text(
                            'Choose online checkout for verified payment. Cash payments must be recorded by café staff.',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: AppTheme.secondaryText),
                          ),
                          const SizedBox(height: 14),
                          ...paymentMethods.map(
                            (method) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _PaymentMethodTile(
                                option: method,
                                selected: paymentMethod == method.code,
                                onTap: () {
                                  setState(() {
                                    paymentMethod = method.code;
                                  });
                                },
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (!_canUseLoyalty) ...[
                            const SizedBox(height: 12),
                            Text(
                              'No loyalty discount available.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: AppTheme.secondaryText),
                            ),
                          ],
                          const SizedBox(height: 12),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            value: useLoyalty && _canUseLoyalty,
                            onChanged: _canUseLoyalty
                                ? (value) => setState(() => useLoyalty = value)
                                : null,
                            title: const Text('Use loyalty points'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isLoading &&
                summary != null &&
                checkoutUnlocked &&
                !_isPaid) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.raisedSurface.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: AppTheme.subtleBorder.withValues(alpha: 0.9),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _amountDue > 0
                            ? 'Remaining due now'
                            : 'Session can be closed without extra payment',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ),
                    Text(
                      formatCurrency(_amountDue),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            ElevatedButton(
              onPressed:
                  billProvider.isSettling ||
                      isStartingOnlinePayment ||
                      isLoading ||
                      summary == null ||
                      _isPaid ||
                      !checkoutUnlocked
                  ? null
                  : _confirmPayment,
              child: billProvider.isSettling
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      isStartingOnlinePayment
                          ? 'Preparing secure checkout…'
                          : _isPaid
                          ? 'Paid'
                          : !checkoutUnlocked
                          ? 'Available after session ends'
                          : _amountDue > 0
                          ? paymentMethod == 'cash'
                                ? 'Ask staff to record cash payment'
                                : 'Pay ${formatCurrency(_amountDue)} online'
                          : 'Close session',
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentMethodTile extends StatelessWidget {
  final PaymentMethodOption option;
  final bool selected;
  final VoidCallback onTap;

  const _PaymentMethodTile({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          color: selected
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
              : AppTheme.raisedSurface.withValues(alpha: 0.52),
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.28)
                : AppTheme.subtleBorder.withValues(alpha: 0.78),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.only(top: 4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected
                      ? Theme.of(context).colorScheme.primary
                      : AppTheme.secondaryText.withValues(alpha: 0.42),
                  width: 2,
                ),
              ),
              child: selected
                  ? Center(
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    option.label,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (selected) ...[
                    const SizedBox(height: 4),
                    Text(
                      option.description,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  final String label;
  final String value;

  const _InfoPill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return StatChip(
      label: label,
      value: value,
      accent: AppTheme.primaryTurquoise,
    );
  }
}

class _CheckoutAmountBadge extends StatelessWidget {
  final String label;
  final String value;

  const _CheckoutAmountBadge({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppTheme.raisedSurface.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.subtleBorder.withValues(alpha: 0.9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _CheckoutValueTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _CheckoutValueTile({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    final Color background = highlight
        ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
        : AppTheme.raisedSurface.withValues(alpha: 0.58);
    final Color border = highlight
        ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.24)
        : AppTheme.subtleBorder.withValues(alpha: 0.78);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _CheckoutOrderCard extends StatelessWidget {
  final int orderId;
  final String status;
  final String total;
  final List<Widget> children;

  const _CheckoutOrderCard({
    required this.orderId,
    required this.status,
    required this.total,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.raisedSurface.withValues(alpha: 0.58),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.82),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Order #$orderId',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      status,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                total,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _DialogRow extends StatelessWidget {
  final String label;
  final String value;

  const _DialogRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return AppDataRow(label: label, value: value);
  }
}
