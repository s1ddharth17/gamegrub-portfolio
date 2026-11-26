import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../theme/app_theme.dart';
import '../utils/app_formatters.dart';
import 'app_chrome.dart';
import '../screens/support/support_center_screen.dart';

class BookingCard extends StatelessWidget {
  final Booking booking;
  final VoidCallback? onExtend;
  final VoidCallback? onCancel;

  const BookingCard({
    super.key,
    required this.booking,
    this.onExtend,
    this.onCancel,
  });

  Color _statusColor() {
    switch (booking.normalizedVisitState) {
      case 'running':
      case 'checked_in':
        return const Color(0xFF29D3C7);
      case 'confirmed':
        return AppTheme.warning;
      case 'ending':
        return const Color(0xFFFF9F67);
      case 'settled':
        return const Color(0xFF8EB4FF);
      case 'cancelled':
        return const Color(0xFFFF7A7A);
      default:
        return AppTheme.secondaryText;
    }
  }

  String get _totalLabel {
    return booking.isOpen ? 'Current total' : 'Gaming total';
  }

  String get _capturedLabel {
    if (booking.isPaymentSettled || !booking.isOpen) {
      return 'Paid total';
    }
    return 'Advance paid';
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassPanel(
        padding: const EdgeInsets.all(20),
        glowColor: statusColor,
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
                        booking.stationTitle,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Booking #${booking.bookingId} - ${formatDate(booking.bookingDate)}',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                      if (booking.timeRange != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          booking.timeRange!,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                GlowBadge(
                  label: titleCase(
                    booking.normalizedVisitState.replaceAll('_', ' '),
                  ),
                  color: statusColor,
                ),
              ],
            ),
            if (booking.totalAmount != null ||
                booking.finalAmount != null ||
                booking.paymentStatus != null) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  if (booking.totalAmount != null)
                    _InfoPill(
                      label: _totalLabel,
                      value: formatCurrency(booking.totalAmount!),
                      accent: AppTheme.primaryOrange,
                    ),
                  if (booking.finalAmount != null)
                    _InfoPill(
                      label: _capturedLabel,
                      value: formatCurrency(booking.finalAmount!),
                      accent: AppTheme.primaryTurquoise,
                    ),
                  if (booking.paymentStatus != null)
                    _InfoPill(
                      label: 'Status',
                      value: titleCase(
                        booking.paymentStatus!.replaceAll('_', ' '),
                      ),
                      accent: AppTheme.lightTurquoise,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                if (onExtend != null)
                  OutlinedButton.icon(
                    onPressed: onExtend,
                    icon: const Icon(Icons.add_alarm_outlined),
                    label: const Text('Extend'),
                  ),
                if (onCancel != null)
                  OutlinedButton.icon(
                    onPressed: onCancel,
                    icon: const Icon(Icons.close),
                    label: const Text('Cancel'),
                  ),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push<void>(
                    MaterialPageRoute<void>(
                      builder: (_) => SupportCenterScreen(
                        businessId: booking.businessId,
                        businessName: booking.businessName,
                        bookingId: booking.bookingId,
                        billId: booking.billId,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.support_agent_outlined),
                  label: const Text('Get help'),
                ),
              ],
            ),
            if (booking.refundStatus != null) ...[
              const SizedBox(height: 12),
              Text(
                'Refund ${booking.refundNumber ?? ''}: ${booking.refundMessage ?? titleCase(booking.refundStatus!.replaceAll('_', ' '))}',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppTheme.lightTurquoise),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;

  const _InfoPill({
    required this.label,
    required this.value,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 116),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.12),
            AppTheme.raisedSurface.withValues(alpha: 0.86),
            AppTheme.elevatedSurface.withValues(alpha: 0.76),
          ],
          stops: const [0, 0.22, 1],
        ),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.92),
        ),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.08),
            blurRadius: 20,
            spreadRadius: -16,
            offset: const Offset(0, 10),
          ),
        ],
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
            ).textTheme.titleSmall?.copyWith(color: accent),
          ),
        ],
      ),
    );
  }
}
