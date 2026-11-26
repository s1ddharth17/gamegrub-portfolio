import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/booking.dart';
import '../../providers/auth_provider.dart';
import '../../providers/booking_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';

class ExtensionCheckoutScreen extends StatelessWidget {
  final Booking booking;

  const ExtensionCheckoutScreen({super.key, required this.booking});

  double get _hourlyRate {
    final totalAmount = booking.totalAmount ?? 0;
    final totalHours = booking.totalHours ?? 0;
    if (totalHours <= 0) {
      return 0;
    }
    return totalAmount / totalHours;
  }

  Future<void> _confirmExtension(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();

    if (auth.user == null || auth.token == null || auth.token!.isEmpty) {
      return;
    }

    final result = await bookingProvider.extendBooking(
      token: auth.token!,
      bookingId: booking.bookingId,
      userId: auth.user!.id,
    );

    if (!context.mounted) {
      return;
    }

    if (result == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            bookingProvider.errorMessage ?? 'Could not extend this session.',
          ),
        ),
      );
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Session extended'),
        content: Text(
          'Added slot: ${result.addedSlot}:00 - ${result.addedSlot + 1}:00\n'
          'Added to final checkout: ${formatCurrency(result.addedAmount)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Done'),
          ),
        ],
      ),
    );

    if (context.mounted) {
      Navigator.pop(context, result);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bookingProvider = context.watch<BookingProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Extend session')),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
          children: [
            HeroGlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Extend session',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Add the next available hour to this booking.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
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
                    'Current booking',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 18),
                  AppDataRow(label: 'Booking', value: '#${booking.bookingId}'),
                  AppDataRow(label: 'Station', value: booking.stationTitle),
                  AppDataRow(
                    label: 'Current slot window',
                    value: booking.timeRange ?? 'Live session',
                  ),
                  AppDataRow(
                    label: booking.isOpen ? 'Current total' : 'Gaming total',
                    value: formatCurrency(booking.totalAmount ?? 0),
                  ),
                  if (booking.finalAmount != null)
                    AppDataRow(
                      label: booking.isPaymentSettled || !booking.isOpen
                          ? 'Paid total'
                          : 'Advance paid',
                      value: formatCurrency(booking.finalAmount!),
                    ),
                  if (booking.paymentStatus != null)
                    AppDataRow(
                      label: 'Payment status',
                      value: titleCase(
                        booking.paymentStatus!.replaceAll('_', ' '),
                      ),
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
                    'What happens next',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 18),
                  const AppDataRow(
                    label: 'Extra time',
                    value: '1 additional hour',
                  ),
                  AppDataRow(
                    label: 'Charge added now',
                    value: _hourlyRate > 0
                        ? formatCurrency(_hourlyRate)
                        : 'At your current station rate',
                  ),
                  Text(
                    'Only the next open hour can be added.',
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
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: ElevatedButton(
          onPressed: bookingProvider.isLoading
              ? null
              : () => _confirmExtension(context),
          child: bookingProvider.isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Add hour'),
        ),
      ),
    );
  }
}
