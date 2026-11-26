import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/booking.dart';
import '../../models/pc.dart';
import '../../models/slot.dart';
import '../../providers/auth_provider.dart';
import '../../providers/booking_provider.dart';
import '../../providers/pc_provider.dart';
import '../../screens/payment/booking_checkout_screen.dart';
import '../../screens/booking/station_waitlist_screens.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../utils/constants.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/slot_chip.dart';

class BookingScreen extends StatefulWidget {
  final PC pc;
  final String? businessName;
  final DateTime? initialDate;
  final int? initialStartHour;
  final int? initialDurationHours;

  const BookingScreen({
    super.key,
    required this.pc,
    this.businessName,
    this.initialDate,
    this.initialStartHour,
    this.initialDurationHours,
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  late DateTime selectedDate;
  final Set<int> selectedHours = <int>{};
  bool _initialWindowUnavailable = false;

  List<int> get _orderedSelectedHours {
    final ordered = selectedHours.toList()..sort();
    return ordered;
  }

  String get _startTimeLabel {
    if (_orderedSelectedHours.isEmpty) {
      return '';
    }
    return formatTimeLabel(_orderedSelectedHours.first);
  }

  String get _endTimeLabel {
    if (_orderedSelectedHours.isEmpty) {
      return '';
    }
    return formatTimeLabel(_orderedSelectedHours.last + 1);
  }

  String get _sessionWindowLabel {
    if (_orderedSelectedHours.isEmpty) {
      return 'Choose one or more slots to build your booking window.';
    }
    return formatHourRangeLabel(
      _orderedSelectedHours.first,
      _orderedSelectedHours.last + 1,
    );
  }

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    selectedDate =
        widget.initialDate ??
        DateTime(
          now.year,
          now.month,
          now.day + (now.hour >= AppConstants.closeHour - 1 ? 1 : 0),
        );
    Future.microtask(_loadSlots);
  }

  Future<void> _loadSlots() async {
    final auth = context.read<AuthProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) {
      return;
    }

    final provider = context.read<BookingProvider>();
    await provider.loadAvailableSlots(
      token: token,
      pcId: widget.pc.id,
      date: selectedDate,
    );
    final startHour = widget.initialStartHour;
    final durationHours = widget.initialDurationHours;
    if (!mounted ||
        startHour == null ||
        durationHours == null ||
        durationHours < 1) {
      return;
    }

    final requestedHours = List<int>.generate(
      durationHours,
      (index) => startHour + index,
    );
    final availableHours = provider.availableSlots
        .where((slot) => slot.available && !_isPastSlot(slot))
        .map((slot) => slot.hour)
        .toSet();
    setState(() {
      if (requestedHours.every(availableHours.contains)) {
        selectedHours.addAll(requestedHours);
      } else {
        _initialWindowUnavailable = true;
      }
    });
  }

  bool _isPastSlot(Slot slot) {
    final now = DateTime.now();
    final sameDay =
        now.year == selectedDate.year &&
        now.month == selectedDate.month &&
        now.day == selectedDate.day;
    return sameDay && slot.hour < now.hour;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1),
      initialDate: selectedDate,
    );

    if (picked == null) {
      return;
    }

    setState(() {
      selectedDate = picked;
      selectedHours.clear();
    });
    await _loadSlots();
  }

  Future<void> _continueToCheckout() async {
    if (selectedHours.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick at least one slot to continue.')),
      );
      return;
    }

    final orderedSlots = _orderedSelectedHours;
    final bookingResult = await Navigator.push<BookingCreationResult>(
      context,
      MaterialPageRoute(
        builder: (_) => BookingCheckoutScreen(
          pc: widget.pc,
          selectedDate: selectedDate,
          selectedHours: orderedSlots,
        ),
      ),
    );

    if (bookingResult == null || !mounted) {
      return;
    }

    await context.read<PcProvider>().loadPCs(businessId: widget.pc.businessId);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Booking #${bookingResult.bookingId} confirmed. Final checkout stays inside your session hub.',
        ),
      ),
    );
    Navigator.pop(context);
  }

  Future<void> _joinWaitlist() async {
    final joined = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            StationWaitlistJoinScreen(pc: widget.pc, initialDate: selectedDate),
      ),
    );
    if (joined == true && mounted) _openWaitlists();
  }

  Future<void> _openWaitlists() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => const StationWaitlistScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<BookingProvider>();
    final selectedCount = selectedHours.length;
    final estimate = selectedCount * widget.pc.price;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(
          widget.businessName?.trim().isNotEmpty == true
              ? 'Book at ${widget.businessName}'
              : 'Book ${widget.pc.stationTitle}',
        ),
      ),
      body: AppBackdrop(
        child: RefreshIndicator(
          onRefresh: _loadSlots,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.xl,
              AppSpace.lg,
              AppSpace.xl,
            ),
            children: [
              AppReveal(
                child: AppHeroBanner(
                  eyebrow: 'Booking flow',
                  title: 'Reserve ${widget.pc.stationTitle}',
                  subtitle: widget.businessName?.trim().isNotEmpty == true
                      ? 'Choose a date, lock your time window, and move into payment for ${widget.businessName} without leaving the booking surface.'
                      : 'Choose a date, lock your time window, and move into payment without leaving the booking surface.',
                  icon: Icons.calendar_month_rounded,
                  accent: AppTheme.primaryTurquoise,
                  trailing: GlassPanel(
                    glowColor: AppTheme.primaryOrange,
                    padding: const EdgeInsets.all(AppSpace.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.pc.categoryLabel,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: AppSpace.xs),
                        Text(
                          widget.pc.specs,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                        const SizedBox(height: AppSpace.md),
                        GlowBadge(
                          label: widget.pc.availabilityLabel,
                          color: widget.pc.isAvailable
                              ? AppTheme.success
                              : AppTheme.warning,
                          icon: Icons.query_stats_rounded,
                        ),
                      ],
                    ),
                  ),
                  stats: [
                    AppMetricTile(
                      label: 'Hourly rate',
                      value: '${formatCurrency(widget.pc.price)}/hr',
                      caption: 'Base booking price',
                      accent: AppTheme.primaryOrange,
                      icon: Icons.currency_rupee_rounded,
                    ),
                    AppMetricTile(
                      label: 'Booking date',
                      value: formatDate(selectedDate),
                      caption: 'Change this before checkout',
                      accent: AppTheme.primaryTurquoise,
                      icon: Icons.event_outlined,
                    ),
                    AppMetricTile(
                      label: 'Selected slots',
                      value: '$selectedCount',
                      caption: selectedCount == 0
                          ? 'Nothing chosen yet'
                          : _sessionWindowLabel,
                      accent: AppTheme.success,
                      icon: Icons.schedule_rounded,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpace.lg),
              AppResponsiveSplit(
                primary: _BookingControlsPanel(
                  selectedDate: selectedDate,
                  startLabel: _startTimeLabel,
                  endLabel: _endTimeLabel,
                  onPickDate: _pickDate,
                ),
                secondary: _BookingSummaryPanel(
                  sessionWindowLabel: _sessionWindowLabel,
                  selectedDate: selectedDate,
                  selectedCount: selectedCount,
                  estimate: estimate,
                  onContinue: _continueToCheckout,
                  onJoinWaitlist: _joinWaitlist,
                  onOpenWaitlists: _openWaitlists,
                ),
                spacing: AppSpace.md,
                primaryFlex: 7,
                secondaryFlex: 5,
                minPrimaryWidth: 360,
                minSecondaryWidth: 300,
              ),
              const SizedBox(height: AppSpace.lg),
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppSectionTitle(
                      title: 'Pick your slots',
                      subtitle:
                          'Each slot represents one hour. Your first pick becomes the start time and your last pick becomes the end time.',
                      trailing: GlowBadge(
                        label: '${selectedHours.length} selected',
                        color: selectedHours.isEmpty
                            ? AppTheme.secondaryText
                            : AppTheme.primaryTurquoise,
                        icon: Icons.timer_outlined,
                      ),
                    ),
                    const SizedBox(height: AppSpace.md),
                    if (_initialWindowUnavailable) ...[
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: AppSpace.md),
                        padding: const EdgeInsets.all(AppSpace.sm),
                        decoration: BoxDecoration(
                          color: AppTheme.warning.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Text(
                          'Some recommended slots just became unavailable. Choose another available window below.',
                        ),
                      ),
                    ],
                    Wrap(
                      spacing: AppSpace.sm,
                      runSpacing: AppSpace.sm,
                      children: const [
                        _LegendChip(
                          label: 'Available',
                          color: AppTheme.success,
                        ),
                        _LegendChip(
                          label: 'Selected',
                          color: AppTheme.primaryOrange,
                        ),
                        _LegendChip(
                          label: 'Unavailable',
                          color: AppTheme.danger,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.md),
                    Text(
                      'Floor operates from ${formatTimeLabel(AppConstants.openHour)} to ${formatTimeLabel(AppConstants.closeHour)}.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    const SizedBox(height: AppSpace.md),
                    if (provider.isLoading)
                      const Center(child: CircularProgressIndicator())
                    else if (provider.availableSlots.isEmpty)
                      EmptyGlassState(
                        title: 'No booking slots are open',
                        message: provider.errorMessage ?? 'No slots available.',
                        icon: Icons.event_busy_outlined,
                      )
                    else
                      Wrap(
                        spacing: AppSpace.sm,
                        runSpacing: AppSpace.sm,
                        children: provider.availableSlots.map((slot) {
                          final disabled = !slot.available || _isPastSlot(slot);
                          final selected = selectedHours.contains(slot.hour);
                          return SlotChip(
                            slot: slot,
                            selected: selected,
                            disabled: disabled,
                            onTap: () {
                              setState(() {
                                if (selected) {
                                  selectedHours.remove(slot.hour);
                                } else {
                                  selectedHours.add(slot.hour);
                                }
                              });
                            },
                          );
                        }).toList(),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BookingControlsPanel extends StatelessWidget {
  final DateTime selectedDate;
  final String startLabel;
  final String endLabel;
  final VoidCallback onPickDate;

  const _BookingControlsPanel({
    required this.selectedDate,
    required this.startLabel,
    required this.endLabel,
    required this.onPickDate,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionTitle(
            title: 'Session details',
            subtitle:
                'Set the booking day first. Start and end time update automatically from your slot picks.',
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.md,
            runSpacing: AppSpace.md,
            children: [
              SizedBox(
                width: 280,
                child: AppSelectionField(
                  label: 'Booking date',
                  value: formatDateLong(selectedDate),
                  hint: 'Choose a booking date',
                  helper: 'Tap to change the session day.',
                  icon: Icons.calendar_today_outlined,
                  onTap: onPickDate,
                ),
              ),
              SizedBox(
                width: 220,
                child: AppSelectionField(
                  label: 'Start time',
                  value: startLabel,
                  hint: 'Select your first slot',
                  helper: 'Pulled from the earliest selected slot.',
                  icon: Icons.play_circle_outline_rounded,
                ),
              ),
              SizedBox(
                width: 220,
                child: AppSelectionField(
                  label: 'End time',
                  value: endLabel,
                  hint: 'Select your last slot',
                  helper: 'Pulled from the latest selected slot.',
                  icon: Icons.flag_circle_outlined,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BookingSummaryPanel extends StatelessWidget {
  final String sessionWindowLabel;
  final DateTime selectedDate;
  final int selectedCount;
  final double estimate;
  final VoidCallback onContinue;
  final VoidCallback onJoinWaitlist;
  final VoidCallback onOpenWaitlists;

  const _BookingSummaryPanel({
    required this.sessionWindowLabel,
    required this.selectedDate,
    required this.selectedCount,
    required this.estimate,
    required this.onContinue,
    required this.onJoinWaitlist,
    required this.onOpenWaitlists,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Booking summary',
            subtitle: sessionWindowLabel,
            trailing: GlowBadge(
              label: formatCurrency(estimate),
              color: AppTheme.primaryOrange,
              icon: Icons.payments_outlined,
            ),
          ),
          const SizedBox(height: AppSpace.md),
          AppDataRow(label: 'Date', value: formatDateLong(selectedDate)),
          AppDataRow(
            label: 'Duration',
            value: selectedCount == 0 ? '-' : '$selectedCount hour(s)',
          ),
          AppDataRow(
            label: 'Window',
            value: selectedCount == 0 ? '-' : sessionWindowLabel,
          ),
          AppDataRow(
            label: 'Estimated cost',
            value: formatCurrency(estimate),
            emphasize: true,
            padding: EdgeInsets.zero,
          ),
          const SizedBox(height: AppSpace.lg),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onContinue,
              icon: const Icon(Icons.arrow_forward_rounded),
              label: const Text('Review booking and payment'),
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onJoinWaitlist,
              icon: const Icon(Icons.notifications_active_outlined),
              label: const Text('Join waitlist for this window'),
            ),
          ),
          TextButton.icon(
            onPressed: onOpenWaitlists,
            icon: const Icon(Icons.list_alt_rounded),
            label: const Text('My waitlists'),
          ),
        ],
      ),
    );
  }
}

class _LegendChip extends StatelessWidget {
  final String label;
  final Color color;

  const _LegendChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          const SizedBox(width: AppSpace.xs),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
