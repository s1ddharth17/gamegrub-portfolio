import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/payment.dart';
import '../../models/pc.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/booking_provider.dart';
import '../../services/payment_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';

class BookingCheckoutScreen extends StatefulWidget {
  final PC pc;
  final DateTime selectedDate;
  final List<int> selectedHours;
  final int? waitlistOfferId;

  const BookingCheckoutScreen({
    super.key,
    required this.pc,
    required this.selectedDate,
    required this.selectedHours,
    this.waitlistOfferId,
  });

  @override
  State<BookingCheckoutScreen> createState() => _BookingCheckoutScreenState();
}

class _BookingCheckoutScreenState extends State<BookingCheckoutScreen> {
  final PaymentService _paymentService = PaymentService();
  String _idempotencyKey = '';

  List<PaymentMethodOption> _paymentMethods = const [];
  String _paymentMethod = 'cash';
  bool _isLoadingMethods = true;
  String? _loadError;
  late bool _useLoyalty;

  @override
  void initState() {
    super.initState();
    _idempotencyKey = _newIdempotencyKey();
    _useLoyalty = (context.read<AuthProvider>().user?.loyaltyPoints ?? 0) > 0;
    Future.microtask(_loadMethods);
  }

  String _newIdempotencyKey() =>
      'booking-${DateTime.now().microsecondsSinceEpoch}-${math.Random.secure().nextInt(0x7fffffff)}';

  Future<void> _loadMethods() async {
    if (mounted) {
      setState(() {
        _isLoadingMethods = true;
        _loadError = null;
      });
    }

    try {
      final methods = await _paymentService.fetchMethods();
      if (!mounted) {
        return;
      }

      setState(() {
        _paymentMethods = methods;
        _paymentMethod = methods.isEmpty ? 'cash' : methods.first.code;
        _isLoadingMethods = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadError = error.toString();
        _isLoadingMethods = false;
      });
    }
  }

  double get _subtotal => widget.selectedHours.length * widget.pc.price;

  double get _convenienceFee {
    final businessProvider = context.read<BusinessProvider>();
    final business = businessProvider.selectedBusinessId == widget.pc.businessId
        ? businessProvider.selectedBusiness
        : businessProvider.businessForId(widget.pc.businessId);

    if (business == null || _subtotal <= 0) {
      return 0;
    }

    return double.parse(
      (business.convenienceFeeFlat +
              (_subtotal * business.convenienceFeeRate / 100))
          .toStringAsFixed(2),
    );
  }

  double get _customerSubtotal => _subtotal + _convenienceFee;

  int get _loyaltyAvailable =>
      context.read<AuthProvider>().user?.loyaltyPoints ?? 0;

  double get _loyaltyDiscount {
    if (!_useLoyalty) {
      return 0;
    }
    return math.min(_loyaltyAvailable.toDouble(), _subtotal);
  }

  double get _amountDue => math.max(0, _customerSubtotal - _loyaltyDiscount);

  List<int> get _orderedSelectedHours {
    final ordered = [...widget.selectedHours]..sort();
    return ordered;
  }

  String get _slotSummary {
    return _orderedSelectedHours
        .map((hour) => formatHourRangeLabel(hour, hour + 1))
        .join(', ');
  }

  String get _startTimeLabel {
    return formatTimeLabel(_orderedSelectedHours.first);
  }

  String get _endTimeLabel {
    return formatTimeLabel(_orderedSelectedHours.last + 1);
  }

  Future<void> _confirmBooking() async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();

    if (auth.user == null || auth.token == null || auth.token!.isEmpty) {
      return;
    }

    if (_amountDue > 0 && _loadError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Load payment methods before continuing.'),
        ),
      );
      return;
    }

    final result = await bookingProvider.createBooking(
      token: auth.token!,
      userId: auth.user!.id,
      pcId: widget.pc.id,
      date: widget.selectedDate,
      slots: [...widget.selectedHours]..sort(),
      paymentMethod: _amountDue > 0 ? _paymentMethod : 'cash',
      useLoyalty: _useLoyalty,
      idempotencyKey: _idempotencyKey,
      waitlistOfferId: widget.waitlistOfferId,
    );

    if (!mounted) {
      return;
    }

    if (result == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            bookingProvider.errorMessage ?? 'Could not confirm booking.',
          ),
        ),
      );
      return;
    }

    if (result.pendingPayment) {
      final checkoutUrl = result.checkoutUrl;
      if (checkoutUrl == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Secure checkout could not be opened. Your booking is still awaiting payment.',
              ),
            ),
          );
        }
        return;
      }

      final attemptId = result.paymentAttemptId;
      if (attemptId == null || auth.token == null) {
        return;
      }
      final attemptStatus = await _showPaymentAttemptStatus(
        token: auth.token!,
        attemptId: attemptId,
        checkoutUrl: checkoutUrl,
      );
      if (!mounted) {
        return;
      }
      if (attemptStatus != 'captured') {
        if (attemptStatus == 'failed' ||
            attemptStatus == 'cancelled' ||
            attemptStatus == 'expired') {
          _idempotencyKey = _newIdempotencyKey();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              attemptStatus == 'failed' ||
                      attemptStatus == 'cancelled' ||
                      attemptStatus == 'expired'
                  ? 'Payment was not completed. The booking was released; you can try again.'
                  : 'Payment is still pending. GameGrub will confirm the booking after Razorpay verifies it.',
            ),
          ),
        );
        return;
      }
      await bookingProvider.loadUserBookings(
        token: auth.token!,
        userId: auth.user!.id,
      );
      if (!mounted) {
        return;
      }
    }

    auth.syncUser(auth.user!.copyWith(loyaltyPoints: result.remainingLoyalty));

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          result.pendingPayment ? 'Payment verified' : 'Booking reserved',
        ),
        content: Text(
          result.pendingPayment
              ? 'Razorpay verified the advance. Booking #${result.bookingId} is confirmed.'
              : _amountDue > 0 && _paymentMethod == 'cash'
              ? 'Booking #${result.bookingId} is reserved. Pay ${formatCurrency(result.amountPaid)} at the counter.'
              : _amountDue > 0
              ? 'Booking #${result.bookingId} is locked in.\n'
                    'Advance paid: ${formatCurrency(result.amountPaid)}'
              : 'Booking #${result.bookingId} is locked in with loyalty points.',
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
      Navigator.pop(context, result);
    }
  }

  Future<String> _showPaymentAttemptStatus({
    required String token,
    required String attemptId,
    required String checkoutUrl,
  }) async {
    var status = 'pending';
    var checking = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Booking payment status'),
          content: Text(switch (status) {
            'captured' => 'Payment verified. Your booking is confirmed.',
            'failed' =>
              'Razorpay reported a failed payment. The booking was released.',
            'cancelled' => 'Checkout was cancelled. The booking was released.',
            'expired' =>
              'The checkout window expired. The booking was released.',
            'captured_review' =>
              'Payment was received after the booking changed. Contact café support to resolve it.',
            _ =>
              'Payment is pending verification. Complete Razorpay checkout, return here, then check again.',
          }),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Done'),
            ),
            TextButton(
              onPressed: () async {
                final launched = await launchUrl(
                  Uri.parse(checkoutUrl),
                  mode: LaunchMode.externalApplication,
                );
                if (!launched && dialogContext.mounted) {
                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                    const SnackBar(
                      content: Text('Could not open secure checkout.'),
                    ),
                  );
                }
              },
              child: const Text('Open checkout'),
            ),
            FilledButton(
              onPressed: checking || status == 'captured'
                  ? null
                  : () async {
                      setDialogState(() => checking = true);
                      try {
                        final attempt = await _paymentService
                            .fetchAttemptStatus(
                              token: token,
                              attemptId: attemptId,
                            );
                        status = '${attempt['status'] ?? 'pending'}';
                      } catch (_) {
                        status = 'pending';
                      } finally {
                        setDialogState(() => checking = false);
                      }
                    },
              child: checking
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Check status'),
            ),
          ],
        ),
      ),
    );
    return status;
  }

  @override
  Widget build(BuildContext context) {
    final bookingProvider = context.watch<BookingProvider>();
    final auth = context.watch<AuthProvider>();
    final loyaltyBalance = auth.user?.loyaltyPoints ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Booking checkout')),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
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
                              'Booking checkout',
                              style: Theme.of(context).textTheme.headlineSmall,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Review the session once, apply loyalty if needed, and confirm with a single advance payment.',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppTheme.secondaryText),
                            ),
                          ],
                        ),
                      ),
                      _CheckoutAmountBadge(
                        label: 'Pay now',
                        value: formatCurrency(_amountDue),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            GlassPanel(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Booking summary',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _CheckoutValueTile(
                          label: 'Duration',
                          value: '${widget.selectedHours.length}h',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _CheckoutValueTile(
                          label: 'Rate',
                          value: '${formatCurrency(widget.pc.price)}/h',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  AppDataRow(label: 'Station', value: widget.pc.stationTitle),
                  AppDataRow(label: 'Category', value: widget.pc.categoryLabel),
                  AppDataRow(label: 'Specs', value: widget.pc.specs),
                  AppDataRow(
                    label: 'Date',
                    value: formatDateLong(widget.selectedDate),
                  ),
                  AppDataRow(label: 'Start time', value: _startTimeLabel),
                  AppDataRow(label: 'End time', value: _endTimeLabel),
                  AppDataRow(
                    label: 'Session window',
                    value: formatHourRangeLabel(
                      _orderedSelectedHours.first,
                      _orderedSelectedHours.last + 1,
                    ),
                  ),
                  AppDataRow(label: 'Slots', value: _slotSummary),
                  AppDataRow(
                    label: 'Duration',
                    value: '${widget.selectedHours.length} hour(s)',
                    padding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            GlassPanel(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Advance payment',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _CheckoutValueTile(
                          label: 'Advance subtotal',
                          value: formatCurrency(_subtotal),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _CheckoutValueTile(
                          label: 'Pay now',
                          value: formatCurrency(_amountDue),
                          highlight: true,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_convenienceFee > 0)
                    AppDataRow(
                      label: 'Platform convenience fee',
                      value: formatCurrency(_convenienceFee),
                    ),
                  AppDataRow(
                    label: 'Customer total before loyalty',
                    value: formatCurrency(_customerSubtotal),
                  ),
                  AppDataRow(
                    label: 'Loyalty available',
                    value: '$loyaltyBalance pts',
                  ),
                  const SizedBox(height: 4),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: _useLoyalty && loyaltyBalance > 0,
                    onChanged: loyaltyBalance > 0
                        ? (value) => setState(() => _useLoyalty = value)
                        : null,
                    title: const Text('Use loyalty points'),
                    subtitle: loyaltyBalance > 0
                        ? null
                        : const Text('No loyalty points available'),
                  ),
                  if (_useLoyalty && _loyaltyDiscount > 0)
                    AppDataRow(
                      label: 'Loyalty discount',
                      value: formatCurrency(_loyaltyDiscount),
                    ),
                  AppDataRow(
                    label: 'Amount to capture',
                    value: formatCurrency(_amountDue),
                    padding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_amountDue == 0)
              GlassPanel(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'This booking is fully covered by loyalty points, so no extra payment is required right now.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
              )
            else if (_isLoadingMethods)
              const GlassPanel(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_loadError != null)
              GlassPanel(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_loadError!),
                    const SizedBox(height: 14),
                    OutlinedButton(
                      onPressed: _loadMethods,
                      child: const Text('Retry payment methods'),
                    ),
                  ],
                ),
              )
            else
              GlassPanel(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Payment method',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Choose how you want to pay the advance.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ..._paymentMethods.map(
                      (method) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _PaymentMethodTile(
                          option: method,
                          selected: _paymentMethod == method.code,
                          onTap: () =>
                              setState(() => _paymentMethod = method.code),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                          ? 'Advance due now'
                          : 'Booking is covered by loyalty',
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
            ElevatedButton(
              onPressed:
                  bookingProvider.isCreating ||
                      (_amountDue > 0 && _isLoadingMethods)
                  ? null
                  : _confirmBooking,
              child: bookingProvider.isCreating
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      _amountDue > 0
                          ? _paymentMethod == 'cash'
                                ? 'Reserve & pay ${formatCurrency(_amountDue)} at counter'
                                : 'Pay ${formatCurrency(_amountDue)} & confirm booking'
                          : 'Confirm booking',
                    ),
            ),
          ],
        ),
      ),
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
    final background = highlight
        ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
        : AppTheme.raisedSurface.withValues(alpha: 0.58);
    final border = highlight
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
                  const SizedBox(height: 4),
                  Text(
                    option.description,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
