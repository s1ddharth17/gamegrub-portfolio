import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:provider/provider.dart';

import '../../models/booking.dart';
import '../../models/order.dart';
import '../../models/session.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/bill_provider.dart';
import '../../providers/booking_provider.dart';
import '../../providers/order_provider.dart';
import '../../providers/pc_provider.dart';
import '../../services/booking_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/booking_card.dart';
import '../support/support_center_screen.dart';
import '../food/food_screen.dart';
import '../payment/checkout_screen.dart';
import '../payment/extension_checkout_screen.dart';

class SessionScreen extends StatefulWidget {
  const SessionScreen({super.key});

  @override
  State<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends State<SessionScreen> {
  final BookingService _bookingService = BookingService();
  String? _checkInCode;
  String? _checkInError;
  int? _checkInBookingId;
  bool _checkInAlreadyDone = false;
  bool _loadingCheckInCode = false;
  bool _loadingLiveData = false;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadData);
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadData(),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadData() async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final billProvider = context.read<BillProvider>();
    final orderProvider = context.read<OrderProvider>();
    final token = auth.token;
    if (auth.user == null || token == null || token.isEmpty) {
      return;
    }
    if (_loadingLiveData) return;
    _loadingLiveData = true;
    try {
      await bookingProvider.loadUserBookings(
        token: token,
        userId: auth.user!.id,
      );
      final booking = bookingProvider.currentBooking;
      final visitBooking = booking ?? bookingProvider.upcomingBooking;
      await _loadCheckInCode(token: token, booking: visitBooking);
      if (booking != null) {
        await billProvider.loadLiveSession(
          token: token,
          bookingId: booking.bookingId,
        );
        await orderProvider.loadOrderBill(token, booking.bookingId);
        return;
      }

      billProvider.clearLiveSession();
      orderProvider.clearOrderState(clearCartItems: true);
    } finally {
      _loadingLiveData = false;
    }
  }

  Future<void> _loadCheckInCode({
    required String token,
    required Booking? booking,
  }) async {
    if (booking == null ||
        !['confirmed', 'running'].contains(booking.normalizedStatus)) {
      if (mounted) {
        setState(() {
          _checkInCode = null;
          _checkInError = null;
          _checkInBookingId = null;
          _checkInAlreadyDone = false;
          _loadingCheckInCode = false;
        });
      }
      return;
    }

    if (booking.normalizedVisitState == 'checked_in') {
      if (mounted) {
        setState(() {
          _checkInBookingId = booking.bookingId;
          _checkInCode = null;
          _checkInAlreadyDone = true;
          _checkInError = null;
          _loadingCheckInCode = false;
        });
      }
      return;
    }
    if (_checkInBookingId == booking.bookingId && _checkInCode != null) {
      return;
    }

    setState(() {
      _checkInBookingId = booking.bookingId;
      _checkInCode = null;
      _checkInAlreadyDone = false;
      _loadingCheckInCode = true;
      _checkInError = null;
    });
    try {
      final result = await _bookingService.fetchCheckInCode(
        token: token,
        bookingId: booking.bookingId,
      );
      if (!mounted) return;
      setState(() {
        _checkInCode = result['code']?.toString();
        _checkInAlreadyDone = result['already_checked_in'] == true;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _checkInCode = null;
        _checkInError = error.toString();
        _checkInAlreadyDone = false;
      });
    } finally {
      if (mounted) setState(() => _loadingCheckInCode = false);
    }
  }

  Future<void> _extendBooking() async {
    final pcProvider = context.read<PcProvider>();
    final booking = context.read<BookingProvider>().currentBooking;
    if (booking == null) {
      return;
    }

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ExtensionCheckoutScreen(booking: booking),
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Extra hour added. Final payment stays open for checkout.',
        ),
      ),
    );
    await pcProvider.loadPCs(businessId: booking.businessId);
    await _loadData();
  }

  Future<void> _cancelBooking(int bookingId) async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final pcProvider = context.read<PcProvider>();
    final token = auth.token;
    int? targetBusinessId;
    for (final booking in bookingProvider.bookings) {
      if (booking.bookingId == bookingId) {
        targetBusinessId = booking.businessId;
        break;
      }
    }
    if (auth.user == null || token == null || token.isEmpty) {
      return;
    }

    final refundController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'If an online advance was captured, GameGrub will open a refund request. Leave the amount blank to request the full advance.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: refundController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
              ],
              decoration: const InputDecoration(
                labelText: 'Partial refund amount (optional)',
                prefixText: 'Rs ',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep booking'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancel booking'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      refundController.dispose();
      return;
    }
    final rawRefundAmount = refundController.text.trim();
    final requestedRefund = rawRefundAmount.isEmpty
        ? null
        : double.tryParse(rawRefundAmount);
    refundController.dispose();
    if (rawRefundAmount.isNotEmpty &&
        (requestedRefund == null || requestedRefund <= 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid partial refund amount.')),
      );
      return;
    }

    final success = await bookingProvider.cancelBooking(
      token: token,
      bookingId: bookingId,
      userId: auth.user!.id,
      refundAmount: requestedRefund,
    );

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? bookingProvider.cancellationMessage ?? 'Booking cancelled.'
              : bookingProvider.errorMessage ?? 'Could not cancel booking.',
        ),
      ),
    );
    await pcProvider.loadPCs(businessId: targetBusinessId);
    await _loadData();
  }

  Future<void> _openFoodScreen({
    int? bookingId,
    int? businessId,
    String? businessName,
  }) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FoodScreen(
          bookingId: bookingId,
          businessId: businessId,
          businessName: businessName,
        ),
      ),
    );

    if (mounted) {
      await _loadData();
    }
  }

  Future<void> _openCheckout(int bookingId) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CheckoutScreen(bookingId: bookingId)),
    );

    if (mounted) {
      await _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bookingProvider = context.watch<BookingProvider>();
    final billProvider = context.watch<BillProvider>();
    final orderProvider = context.watch<OrderProvider>();
    final auth = context.watch<AuthProvider>();
    final businessProvider = context.watch<BusinessProvider>();
    final currentBooking = bookingProvider.currentBooking;
    final upcomingBooking = bookingProvider.upcomingBooking;
    final live = billProvider.liveSession;
    final activeBusinessName = currentBooking?.businessName.isNotEmpty == true
        ? currentBooking!.businessName
        : upcomingBooking?.businessName.isNotEmpty == true
        ? upcomingBooking!.businessName
        : businessProvider.selectedBusiness?.name ?? 'your selected cafe';
    final visitState = currentBooking?.normalizedVisitState;
    final sessionEnded = visitState == 'ending' || visitState == 'settled';
    final canCheckout = visitState == 'ending';
    final sessionTitle = currentBooking != null
        ? 'Live at $activeBusinessName on ${currentBooking.stationTitle}'
        : upcomingBooking != null
        ? 'Upcoming at $activeBusinessName on ${upcomingBooking.stationTitle}'
        : 'No active booking';
    final sessionSubtitle = currentBooking != null
        ? visitState == 'settled'
              ? 'Your visit is settled. Your session details and receipt stay here.'
              : sessionEnded
              ? 'Your session is finished. Review the bill or complete checkout.'
              : 'Track time, food, and checkout from one place.'
        : upcomingBooking != null
        ? 'Your next booking is locked in. Food ordering opens when the session starts.'
        : 'Reserve a station first, then this space becomes your live control center.';
    final heroAccent = currentBooking != null
        ? (sessionEnded ? AppTheme.primaryOrange : AppTheme.primaryTurquoise)
        : AppTheme.primaryOrange;
    final activeOrders =
        orderProvider.orderSummary?.orders ?? const <OrderTicket>[];
    final totalDue =
        live?.finalTotal ?? orderProvider.orderSummary?.grandTotal ?? 0;
    final remainingMinutes = live == null ? null : live.futureSlots * 60;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.xl,
            AppSpace.lg,
            120,
          ),
          children: [
            AppReveal(
              child: AppHeroBanner(
                eyebrow: currentBooking != null
                    ? 'SESSION CONTROL'
                    : upcomingBooking != null
                    ? 'UPCOMING BOOKING'
                    : 'SESSION HUB',
                title: sessionTitle,
                subtitle: sessionSubtitle,
                icon: currentBooking != null
                    ? Icons.sports_esports_rounded
                    : upcomingBooking != null
                    ? Icons.schedule_rounded
                    : Icons.rocket_launch_rounded,
                accent: heroAccent,
                trailing: SizedBox(
                  width: double.infinity,
                  child: GlassPanel(
                    padding: const EdgeInsets.all(16),
                    glowColor: heroAccent,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Member rewards',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${auth.user?.loyaltyPoints ?? 0} pts',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          currentBooking != null
                              ? 'Rewards and billing stay synced while this session is live.'
                              : 'Reward balance updates after bookings and checkout.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ),
                stats: [
                  AppMetricTile(
                    label: 'Usage cost',
                    value: formatCurrency(totalDue),
                    caption: currentBooking != null
                        ? 'Includes gaming and any food already billed.'
                        : 'This updates once a session or order goes live.',
                    accent: AppTheme.primaryOrange,
                    icon: Icons.payments_outlined,
                  ),
                  AppMetricTile(
                    label: 'Snacks ordered',
                    value: '${activeOrders.length}',
                    caption: activeOrders.isEmpty
                        ? 'Nothing sent to the kitchen yet.'
                        : 'Orders linked to this booking.',
                    accent: AppTheme.primaryTurquoise,
                    icon: Icons.fastfood_outlined,
                  ),
                  AppMetricTile(
                    label: 'Remaining time',
                    value: remainingMinutes == null
                        ? '-'
                        : '$remainingMinutes min',
                    caption: currentBooking == null
                        ? 'This appears after your session begins.'
                        : sessionEnded
                        ? 'Session time is complete.'
                        : 'Calculated from future reserved slots.',
                    accent: heroAccent,
                    icon: Icons.timer_outlined,
                  ),
                  AppMetricTile(
                    label: 'Time tracked',
                    value: live == null ? '-' : '${live.sessionMinutes} min',
                    caption: currentBooking == null
                        ? 'Live time starts after your session begins.'
                        : 'Tracked continuously from the billing snapshot.',
                    accent: AppTheme.success,
                    icon: Icons.timelapse_rounded,
                  ),
                ],
                actions: [
                  if (currentBooking != null && canCheckout)
                    ElevatedButton.icon(
                      onPressed: () => _openCheckout(currentBooking.bookingId),
                      icon: const Icon(Icons.payments_outlined),
                      label: const Text('Checkout'),
                    ),
                  if (currentBooking != null)
                    OutlinedButton.icon(
                      onPressed: () => _openFoodScreen(
                        bookingId: currentBooking.bookingId,
                        businessId: currentBooking.businessId,
                        businessName: currentBooking.businessName,
                      ),
                      icon: const Icon(Icons.fastfood_outlined),
                      label: const Text('Order food'),
                    )
                  else
                    OutlinedButton.icon(
                      onPressed: () => _openFoodScreen(
                        businessId: businessProvider.selectedBusinessId,
                        businessName: businessProvider.selectedBusiness?.name,
                      ),
                      icon: const Icon(Icons.restaurant_menu_outlined),
                      label: const Text('Browse menu'),
                    ),
                  if (currentBooking?.canExtend == true)
                    FilledButton.icon(
                      onPressed: _extendBooking,
                      icon: const Icon(Icons.add_alarm_outlined),
                      label: const Text('Add time'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (bookingProvider.isLoading &&
                currentBooking == null &&
                upcomingBooking == null)
              const Center(child: CircularProgressIndicator())
            else if (currentBooking == null)
              if (upcomingBooking != null)
                Column(
                  children: [
                    BookingCard(booking: upcomingBooking),
                    _CheckInQrPanel(
                      booking: upcomingBooking,
                      code: _checkInBookingId == upcomingBooking.bookingId
                          ? _checkInCode
                          : null,
                      alreadyCheckedIn: _checkInAlreadyDone,
                      loading: _loadingCheckInCode,
                      error: _checkInError,
                      onRefresh: _loadData,
                    ),
                  ],
                )
              else
                EmptyGlassState(
                  title: 'No active booking',
                  message:
                      'Reserve a station first. Once you have a live or upcoming booking, this page becomes your session dashboard.',
                  icon: Icons.hourglass_empty_rounded,
                  action: OutlinedButton.icon(
                    onPressed: () => _openFoodScreen(
                      businessId: businessProvider.selectedBusinessId,
                      businessName: businessProvider.selectedBusiness?.name,
                    ),
                    icon: const Icon(Icons.restaurant_menu_outlined),
                    label: const Text('Browse menu'),
                  ),
                )
            else
              AppResponsiveSplit(
                primary: Column(
                  children: [
                    BookingCard(
                      booking: currentBooking,
                      onExtend: currentBooking.canExtend
                          ? _extendBooking
                          : null,
                      onCancel: currentBooking.canCancel
                          ? () => _cancelBooking(currentBooking.bookingId)
                          : null,
                    ),
                    if ([
                      'confirmed',
                      'running',
                    ].contains(currentBooking.normalizedStatus))
                      _CheckInQrPanel(
                        booking: currentBooking,
                        code: _checkInBookingId == currentBooking.bookingId
                            ? _checkInCode
                            : null,
                        alreadyCheckedIn: _checkInAlreadyDone,
                        loading: _loadingCheckInCode,
                        error: _checkInError,
                        onRefresh: _loadData,
                      ),
                    _LiveSessionPanel(
                      live: live,
                      sessionEnded: sessionEnded,
                      errorMessage: billProvider.errorMessage,
                    ),
                  ],
                ),
                secondary: Column(
                  children: [
                    _OrdersPanel(
                      orders: activeOrders,
                      businessId: currentBooking.businessId,
                      businessName: currentBooking.businessName,
                    ),
                    const SizedBox(height: 14),
                    _ActionSummaryPanel(
                      booking: currentBooking,
                      onFood: () => _openFoodScreen(
                        bookingId: currentBooking.bookingId,
                        businessId: currentBooking.businessId,
                        businessName: currentBooking.businessName,
                      ),
                      onCheckout: canCheckout
                          ? () => _openCheckout(currentBooking.bookingId)
                          : null,
                    ),
                  ],
                ),
                spacing: 14,
                primaryFlex: 11,
                secondaryFlex: 9,
                minPrimaryWidth: 380,
                minSecondaryWidth: 340,
              ),
          ],
        ),
      ),
    );
  }
}

class _CheckInQrPanel extends StatelessWidget {
  final Booking booking;
  final String? code;
  final bool alreadyCheckedIn;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;

  const _CheckInQrPanel({
    required this.booking,
    required this.code,
    required this.alreadyCheckedIn,
    required this.loading,
    required this.error,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassPanel(
        glowColor: AppTheme.primaryTurquoise,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppSectionTitle(
              title: 'Cafe check-in',
              subtitle:
                  'Show this booking QR to staff at ${booking.businessName}.',
              trailing: Icon(Icons.qr_code_2, color: AppTheme.primaryTurquoise),
            ),
            const SizedBox(height: 14),
            if (alreadyCheckedIn ||
                booking.normalizedVisitState == 'checked_in')
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.verified_rounded, color: AppTheme.success),
                title: Text('You are checked in'),
                subtitle: Text('Your visit is linked to this station booking.'),
              )
            else if (code != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: QrImageView(
                    data: code!,
                    version: QrVersions.auto,
                    size: 220,
                    errorCorrectionLevel: QrErrorCorrectLevel.M,
                    backgroundColor: Colors.white,
                  ),
                ),
              )
            else if (loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(),
                ),
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    error == null
                        ? 'Your check-in code is not available right now.'
                        : 'Could not load your check-in code. Check your connection and retry.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: onRefresh,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Refresh QR code'),
                  ),
                ],
              ),
            const SizedBox(height: 10),
            Text(
              'Booking #${booking.bookingId} · ${booking.stationTitle}',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
        ),
      ),
    );
  }
}

class _LiveSessionPanel extends StatelessWidget {
  final SessionSnapshot? live;
  final bool sessionEnded;
  final String? errorMessage;

  const _LiveSessionPanel({
    required this.live,
    required this.sessionEnded,
    required this.errorMessage,
  });

  @override
  Widget build(BuildContext context) {
    final snapshot = live;

    if (snapshot == null && errorMessage != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 14),
        child: EmptyGlassState(
          title: 'Session status unavailable',
          message: errorMessage!,
          icon: Icons.error_outline_rounded,
        ),
      );
    }

    if (snapshot == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: GlassPanel(
        glowColor: sessionEnded
            ? AppTheme.primaryOrange
            : AppTheme.primaryTurquoise,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppSectionTitle(
              title: sessionEnded ? 'Session wrap-up' : 'Live billing snapshot',
              subtitle: sessionEnded
                  ? 'Your time is complete. Review the bill before you check out.'
                  : 'This combines gaming time and food already linked to the booking.',
              trailing: GlowBadge(
                label: '${snapshot.sessionMinutes} min',
                color: sessionEnded
                    ? AppTheme.primaryOrange
                    : AppTheme.primaryTurquoise,
                icon: Icons.timer_outlined,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                AppMetricTile(
                  label: 'Gaming',
                  value: formatCurrency(snapshot.gamingCost),
                  caption: '${snapshot.billableSlots} billed slots',
                  accent: AppTheme.primaryOrange,
                  icon: Icons.sports_esports_outlined,
                ),
                AppMetricTile(
                  label: 'Food',
                  value: formatCurrency(snapshot.foodTotal),
                  caption:
                      '${snapshot.futureSlots} future slots still reserved',
                  accent: AppTheme.primaryTurquoise,
                  icon: Icons.fastfood_outlined,
                ),
                AppMetricTile(
                  label: 'Final total',
                  value: formatCurrency(snapshot.finalTotal),
                  caption: snapshot.loyaltyDiscount > 0
                      ? '${formatCurrency(snapshot.loyaltyDiscount)} loyalty applied'
                      : 'No loyalty discount used yet',
                  accent: sessionEnded
                      ? AppTheme.primaryOrange
                      : AppTheme.primaryTurquoise,
                  icon: Icons.payments_outlined,
                ),
              ],
            ),
            const SizedBox(height: 18),
            AppDataRow(label: 'Booked slots', value: '${snapshot.bookedSlots}'),
            AppDataRow(
              label: 'Billable slots',
              value: '${snapshot.billableSlots}',
            ),
            AppDataRow(
              label: 'Subtotal',
              value: formatCurrency(snapshot.subtotal),
            ),
            if (snapshot.convenienceFee > 0)
              AppDataRow(
                label: 'Convenience fee',
                value: formatCurrency(snapshot.convenienceFee),
              ),
            AppDataRow(
              label: 'Loyalty points after settlement',
              value: '${snapshot.loyaltyPoints}',
              padding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
    );
  }
}

class _OrdersPanel extends StatelessWidget {
  final List<OrderTicket> orders;
  final int businessId;
  final String businessName;

  const _OrdersPanel({
    required this.orders,
    required this.businessId,
    required this.businessName,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Kitchen activity',
            subtitle: orders.isEmpty
                ? 'No food has been sent to the kitchen yet.'
                : 'Track every order attached to this session.',
            trailing: GlowBadge(
              label: '${orders.length} live',
              color: orders.isEmpty
                  ? AppTheme.secondaryText
                  : AppTheme.primaryTurquoise,
              icon: Icons.receipt_long_outlined,
            ),
          ),
          const SizedBox(height: 16),
          if (orders.isEmpty)
            Text(
              'When you place food orders, they will show up here with items and status.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            )
          else
            ...orders.map(
              (order) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _SessionOrderCard(
                  order: order,
                  businessId: businessId,
                  businessName: businessName,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SessionOrderCard extends StatelessWidget {
  final OrderTicket order;
  final int businessId;
  final String businessName;

  const _SessionOrderCard({
    required this.order,
    required this.businessId,
    required this.businessName,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface.withValues(alpha: 0.52),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.subtleBorder.withValues(alpha: 0.9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Order #${order.orderId}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              GlowBadge(
                label: titleCase(order.status.replaceAll('_', ' ')),
                color: AppTheme.primaryTurquoise,
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...order.items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(child: Text('${item.name} x ${item.qty}')),
                  Text(formatCurrency(item.total)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Order total ${formatCurrency(order.totalAmount)}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push<void>(
              MaterialPageRoute<void>(
                builder: (_) => SupportCenterScreen(
                  businessId: businessId,
                  businessName: businessName,
                  bookingId: order.bookingId,
                  orderId: order.orderId,
                ),
              ),
            ),
            icon: const Icon(Icons.support_agent_outlined),
            label: const Text('Get help with this order'),
          ),
        ],
      ),
    );
  }
}

class _ActionSummaryPanel extends StatelessWidget {
  final Booking booking;
  final VoidCallback onFood;
  final VoidCallback? onCheckout;

  const _ActionSummaryPanel({
    required this.booking,
    required this.onFood,
    required this.onCheckout,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      glowColor: AppTheme.primaryOrange,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionTitle(
            title: 'Next step',
            subtitle:
                'Use the most common session actions without leaving this page.',
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              AppMetricTile(
                label: 'Booking',
                value: '#${booking.bookingId}',
                caption:
                    booking.timeRange ?? 'Timing updates will appear here.',
                accent: AppTheme.primaryOrange,
                icon: Icons.confirmation_number_outlined,
              ),
              AppMetricTile(
                label: 'Status',
                value: titleCase(booking.status.replaceAll('_', ' ')),
                caption: booking.paymentStatus == null
                    ? 'Payment status will appear after billing.'
                    : 'Payment ${titleCase(booking.paymentStatus!.replaceAll('_', ' '))}.',
                accent: AppTheme.primaryTurquoise,
                icon: Icons.notifications_active_outlined,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              OutlinedButton.icon(
                onPressed: onFood,
                icon: const Icon(Icons.fastfood_outlined),
                label: const Text('Order food'),
              ),
              if (onCheckout != null)
                ElevatedButton.icon(
                  onPressed: onCheckout,
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('Settle bill'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
