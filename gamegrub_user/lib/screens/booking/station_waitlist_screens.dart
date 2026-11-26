import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/pc.dart';
import '../../providers/auth_provider.dart';
import '../../screens/payment/booking_checkout_screen.dart';
import '../../services/station_waitlist_service.dart';
import '../../utils/app_formatters.dart';

class StationWaitlistJoinScreen extends StatefulWidget {
  final PC pc;
  final DateTime initialDate;

  const StationWaitlistJoinScreen({
    super.key,
    required this.pc,
    required this.initialDate,
  });

  @override
  State<StationWaitlistJoinScreen> createState() => _StationWaitlistJoinScreenState();
}

class _StationWaitlistJoinScreenState extends State<StationWaitlistJoinScreen> {
  final _service = StationWaitlistService();
  late DateTime _date;
  int _startHour = 18;
  int _endHour = 20;
  bool _anyMatchingCategory = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _date = widget.initialDate;
    final now = DateTime.now();
    if (_date.year == now.year && _date.month == now.month && _date.day == now.day && now.hour >= 22) {
      _date = DateTime(now.year, now.month, now.day + 1);
    } else if (_date.year == now.year && _date.month == now.month && _date.day == now.day) {
      _startHour = (now.hour + 1).clamp(9, 22).toInt();
      _endHour = (_startHour + 1).clamp(10, 23).toInt();
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final value = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1),
      initialDate: _date,
    );
    if (value == null) return;
    setState(() {
      _date = value;
      final now = DateTime.now();
      final isToday = value.year == now.year && value.month == now.month && value.day == now.day;
      if (isToday && now.hour >= 22) {
        _date = DateTime(now.year, now.month, now.day + 1);
      } else if (isToday) {
        _startHour = (_startHour < now.hour + 1 ? now.hour + 1 : _startHour).clamp(9, 22).toInt();
        if (_endHour <= _startHour) _endHour = (_startHour + 1).clamp(10, 23).toInt();
      }
    });
  }

  String _dateString(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  Future<void> _join() async {
    final auth = context.read<AuthProvider>();
    if (auth.token == null || auth.token!.isEmpty) return;
    setState(() => _saving = true);
    try {
      await _service.join(
        token: auth.token!,
        businessId: widget.pc.businessId,
        bookingDate: _dateString(_date),
        startHour: _startHour,
        endHour: _endHour,
        preferredPcId: _anyMatchingCategory ? null : widget.pc.id,
        preferredCategory: _anyMatchingCategory ? widget.pc.category : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Waitlist request added. We will notify you when an opening is ready.')),
      );
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Join station waitlist')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Choose the window you want', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text('Requests are ranked by time joined. When a matching cancellation opens, you have 10 minutes to claim it from the notification.', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _pickDate,
            icon: const Icon(Icons.event_outlined),
            label: Text(formatDateLong(_date)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey(_startHour),
                  initialValue: _startHour,
                  decoration: const InputDecoration(labelText: 'Start'),
                  items: [for (var hour = 9; hour < 23; hour++) DropdownMenuItem(value: hour, child: Text(formatTimeLabel(hour)))],
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      _startHour = value;
                      if (_endHour <= value) _endHour = (value + 1).clamp(10, 23).toInt();
                    });
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey(_endHour),
                  initialValue: _endHour,
                  decoration: const InputDecoration(labelText: 'End'),
                  items: [for (var hour = _startHour + 1; hour <= 23; hour++) DropdownMenuItem(value: hour, child: Text(formatTimeLabel(hour)))],
                  onChanged: (value) => setState(() => _endHour = value ?? _endHour),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text('Station preference', style: Theme.of(context).textTheme.titleMedium),
          Wrap(
            spacing: 10,
            children: [
              ChoiceChip(
                label: Text('This station · ${widget.pc.stationTitle}'),
                selected: !_anyMatchingCategory,
                onSelected: (_) => setState(() => _anyMatchingCategory = false),
              ),
              ChoiceChip(
                label: Text('Any ${widget.pc.categoryLabel} at this café'),
                selected: _anyMatchingCategory,
                onSelected: (_) => setState(() => _anyMatchingCategory = true),
              ),
            ],
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _saving ? null : _join,
            icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.notifications_active_outlined),
            label: Text(_saving ? 'Adding request…' : 'Join waitlist'),
          ),
        ],
      ),
    );
  }
}

class StationWaitlistScreen extends StatefulWidget {
  const StationWaitlistScreen({super.key});

  @override
  State<StationWaitlistScreen> createState() => _StationWaitlistScreenState();
}

class _StationWaitlistScreenState extends State<StationWaitlistScreen> {
  final _service = StationWaitlistService();
  late Future<List<Map<String, dynamic>>> _requests;

  @override
  void initState() {
    super.initState();
    _requests = _load();
  }

  Future<List<Map<String, dynamic>>> _load() {
    final token = context.read<AuthProvider>().token ?? '';
    return _service.list(token: token);
  }

  Future<void> _refresh() async => setState(() => _requests = _load());

  Future<void> _cancel(int id) async {
    final token = context.read<AuthProvider>().token ?? '';
    try {
      await _service.cancel(token: token, waitlistId: id);
      await _refresh();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My waitlists')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _requests,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return Center(child: Text('${snapshot.error}'));
          final rows = snapshot.data ?? const [];
          if (rows.isEmpty) return const Center(child: Text('You have no active station waitlists.'));
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: rows.length,
              itemBuilder: (context, index) {
                final row = rows[index];
                final offerId = int.tryParse('${row['offer_id'] ?? ''}');
                final id = int.tryParse('${row['waitlist_id'] ?? 0}') ?? 0;
                final date = DateTime.tryParse('${row['booking_date']}');
                final start = int.tryParse('${row['start_hour']}') ?? 0;
                final end = int.tryParse('${row['end_hour']}') ?? 0;
                final target = row['preferred_pc_id'] != null
                    ? 'Station ${row['preferred_pc_id']}'
                    : (row['preferred_category']?.toString() ?? 'Any station');
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: Icon(offerId == null ? Icons.hourglass_top_rounded : Icons.notifications_active_rounded),
                    title: Text('${row['business_name'] ?? 'Café'} · $target'),
                    subtitle: Text('${date == null ? row['booking_date'] : formatDateLong(date)} · ${formatHourRangeLabel(start, end)}\n${offerId == null ? 'Waiting in join order' : 'Opening ready · claim within ${row['hold_minutes'] ?? 10} minutes'}'),
                    isThreeLine: true,
                    trailing: offerId == null
                        ? IconButton(tooltip: 'Cancel waitlist', onPressed: () => _cancel(id), icon: const Icon(Icons.close_rounded))
                        : const Icon(Icons.chevron_right_rounded),
                    onTap: offerId == null
                        ? null
                        : () => Navigator.push<void>(context, MaterialPageRoute(builder: (_) => StationWaitlistOfferScreen(offerId: offerId))),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class StationWaitlistOfferScreen extends StatefulWidget {
  final int offerId;

  const StationWaitlistOfferScreen({super.key, required this.offerId});

  @override
  State<StationWaitlistOfferScreen> createState() => _StationWaitlistOfferScreenState();
}

class _StationWaitlistOfferScreenState extends State<StationWaitlistOfferScreen> {
  final _service = StationWaitlistService();
  late Future<Map<String, dynamic>> _offer;

  @override
  void initState() {
    super.initState();
    _offer = _load();
  }

  Future<Map<String, dynamic>> _load() => _service.offer(
    token: context.read<AuthProvider>().token ?? '',
    offerId: widget.offerId,
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Station opening')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _offer,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('${snapshot.error}')));
          final offer = snapshot.data!;
          final pc = PC.fromJson(Map<String, dynamic>.from(offer['pc'] as Map));
          final date = DateTime.parse('${offer['booking_date']}');
          final start = int.parse('${offer['start_hour']}');
          final end = int.parse('${offer['end_hour']}');
          final holdMinutes = int.tryParse('${offer['hold_minutes'] ?? 10}') ?? 10;
          final hours = List<int>.generate(end - start, (index) => start + index);
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text('Your waitlist opening is ready', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(pc.stationTitle, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text('${formatDateLong(date)} · ${formatHourRangeLabel(start, end)}'),
                    Text('${pc.categoryLabel} · ${formatCurrency(pc.price)}/hr'),
                    const SizedBox(height: 14),
                    Text('This opening is held for you for $holdMinutes minutes. Complete checkout now to claim it.'),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () async {
                  final result = await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => BookingCheckoutScreen(
                        pc: pc,
                        selectedDate: date,
                        selectedHours: hours,
                        waitlistOfferId: widget.offerId,
                      ),
                    ),
                  );
                  if (result != null && context.mounted) Navigator.pop(context, result);
                },
                icon: const Icon(Icons.lock_clock_rounded),
                label: const Text('Claim opening and continue to checkout'),
              ),
            ],
          );
        },
      ),
    );
  }
}
