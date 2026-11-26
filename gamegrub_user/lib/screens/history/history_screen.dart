import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/bill_provider.dart';
import '../../providers/booking_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/booking_card.dart';
import '../bill/bill_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(_loadData);
  }

  Future<void> _loadData() async {
    final auth = context.read<AuthProvider>();
    final user = auth.user;
    final token = auth.token;
    if (user == null || token == null || token.isEmpty) {
      return;
    }

    await Future.wait([
      context.read<BookingProvider>().loadUserBookings(
        token: token,
        userId: user.id,
      ),
      context.read<BillProvider>().loadUserBills(token: token, userId: user.id),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final bookingProvider = context.watch<BookingProvider>();
    final billProvider = context.watch<BillProvider>();
    final bookingCount = bookingProvider.bookings.length;
    final billCount = billProvider.bills.length;
    final totalSpend = billProvider.bills.fold<double>(
      0,
      (sum, bill) => sum + bill.finalAmount,
    );
    final latestBill = billProvider.bills.isEmpty
        ? null
        : billProvider.bills.reduce((left, right) {
            final leftDate =
                left.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            final rightDate =
                right.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            return rightDate.isAfter(leftDate) ? right : left;
          });
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
          children: [
            AppReveal(
              child: AppHeroBanner(
                eyebrow: 'PLAYER HISTORY',
                title: 'Bookings, bills, and payment trail',
                subtitle:
                    'Everything you have reserved or paid for now lives in one cleaner archive instead of feeling split across multiple utility screens.',
                icon: Icons.receipt_long_rounded,
                accent: AppTheme.primaryOrange,
                trailing: SizedBox(
                  width: double.infinity,
                  child: GlassPanel(
                    padding: const EdgeInsets.all(16),
                    glowColor: AppTheme.primaryTurquoise,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Latest bill',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          latestBill == null
                              ? 'No bills yet'
                              : formatCurrency(latestBill.finalAmount),
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          latestBill == null
                              ? 'Bills appear after checkout.'
                              : 'Booking #${latestBill.bookingId} | ${formatDateTime(latestBill.createdAt)}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ),
                stats: [
                  AppMetricTile(
                    label: 'Bookings',
                    value: '$bookingCount',
                    caption: 'Past and current booking records.',
                    accent: AppTheme.primaryTurquoise,
                    icon: Icons.event_available_outlined,
                  ),
                  AppMetricTile(
                    label: 'Bills',
                    value: '$billCount',
                    caption: 'Receipts generated after settlement.',
                    accent: AppTheme.primaryOrange,
                    icon: Icons.receipt_outlined,
                  ),
                  AppMetricTile(
                    label: 'Lifetime spend',
                    value: formatCurrency(totalSpend),
                    caption: 'All recorded payments from the user side.',
                    accent: AppTheme.warning,
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                ],
                actions: [
                  FilledButton.icon(
                    onPressed:
                        bookingProvider.isLoading || billProvider.isLoading
                        ? null
                        : _loadData,
                    icon: bookingProvider.isLoading || billProvider.isLoading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh_rounded),
                    label: Text(
                      bookingProvider.isLoading || billProvider.isLoading
                          ? 'Refreshing...'
                          : 'Refresh history',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            AppResponsiveSplit(
              primary: _BookingsPanel(bookingProvider: bookingProvider),
              secondary: _BillsPanel(billProvider: billProvider),
              spacing: 14,
              primaryFlex: 11,
              secondaryFlex: 9,
              minPrimaryWidth: 360,
              minSecondaryWidth: 320,
            ),
          ],
        ),
      ),
    );
  }
}

class _BookingsPanel extends StatelessWidget {
  final BookingProvider bookingProvider;

  const _BookingsPanel({required this.bookingProvider});

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Bookings',
            subtitle: 'Every station reservation, from upcoming to completed.',
            trailing: GlowBadge(
              label: '${bookingProvider.bookings.length}',
              color: bookingProvider.bookings.isEmpty
                  ? AppTheme.secondaryText
                  : AppTheme.primaryTurquoise,
              icon: Icons.event_note_outlined,
            ),
          ),
          const SizedBox(height: 16),
          if (bookingProvider.isLoading && bookingProvider.bookings.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (bookingProvider.bookings.isEmpty)
            const EmptyGlassState(
              title: 'No bookings yet',
              message: 'Your bookings appear here once you reserve a station.',
              icon: Icons.event_note_outlined,
            )
          else
            ...bookingProvider.bookings.map(
              (booking) => BookingCard(booking: booking),
            ),
        ],
      ),
    );
  }
}

class _BillsPanel extends StatelessWidget {
  final BillProvider billProvider;

  const _BillsPanel({required this.billProvider});

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Bills',
            subtitle: 'Tap any receipt to see the full settlement detail.',
            trailing: GlowBadge(
              label: '${billProvider.bills.length}',
              color: billProvider.bills.isEmpty
                  ? AppTheme.secondaryText
                  : AppTheme.primaryOrange,
              icon: Icons.receipt_long_outlined,
            ),
          ),
          const SizedBox(height: 16),
          if (billProvider.isLoading && billProvider.bills.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (billProvider.bills.isEmpty)
            const EmptyGlassState(
              title: 'No bills generated yet',
              message: 'Bills appear after checkout and stay here for review.',
              icon: Icons.receipt_long_outlined,
            )
          else
            ...billProvider.bills.map(
              (bill) => Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: GlassPanel(
                  padding: const EdgeInsets.all(16),
                  glowColor: AppTheme.primaryOrange,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Bill #${bill.billId}'),
                    subtitle: Text(
                      'Booking #${bill.bookingId} | ${titleCase((bill.paymentMethod ?? 'unassigned').replaceAll('_', ' '))}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatCurrency(bill.finalAmount),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 4),
                        Icon(
                          Icons.chevron_right,
                          color: AppTheme.secondaryText,
                        ),
                      ],
                    ),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => BillScreen(billId: bill.billId),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
