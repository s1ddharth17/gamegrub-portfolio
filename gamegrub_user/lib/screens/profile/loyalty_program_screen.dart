import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../services/loyalty_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';

class LoyaltyProgramScreen extends StatefulWidget {
  final LoyaltyService service;

  LoyaltyProgramScreen({super.key, LoyaltyService? service})
    : service = service ?? LoyaltyService();

  @override
  State<LoyaltyProgramScreen> createState() => _LoyaltyProgramScreenState();
}

class _LoyaltyProgramScreenState extends State<LoyaltyProgramScreen> {
  final _referralCodeController = TextEditingController();
  Map<String, dynamic>? _summary;
  bool _loading = true;
  bool _submittingReferral = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadSummary());
  }

  @override
  void dispose() {
    _referralCodeController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? value
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
      : <Map<String, dynamic>>[];

  Future<void> _loadSummary() async {
    final auth = context.read<AuthProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Sign in again to load your rewards.';
      });
      return;
    }

    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final summary = await widget.service.fetchSummary(token: token);
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loading = false;
      });
      if (_map(summary['birthday_offer'])['credited'] == true) {
        await auth.refreshProfile();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Rewards could not load. Check your connection and try again.';
      });
    }
  }

  Future<void> _applyReferral() async {
    final code = _referralCodeController.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a referral code first.')),
      );
      return;
    }

    final token = context.read<AuthProvider>().token;
    if (token == null || token.isEmpty) return;

    setState(() => _submittingReferral = true);
    try {
      final result = await widget.service.applyReferral(
        token: token,
        referralCode: code,
      );
      _referralCodeController.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${result['message'] ?? 'Referral applied.'}')),
      );
      await _loadSummary();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'That referral code could not be applied. Check it and try again.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _submittingReferral = false);
    }
  }

  Future<void> _copyReferralCode(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Referral code copied.')));
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Card(
      color: AppTheme.raisedSurface,
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: AppTheme.subtleBorder.withValues(alpha: 0.7)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary ?? const <String, dynamic>{};
    final referral = _map(summary['referral']);
    final streak = _map(summary['streak']);
    final challenge = _map(summary['challenge']);
    final birthday = _map(summary['birthday_offer']);
    final rules = _map(summary['rules']);
    final badges = _maps(summary['badges']);
    final history = _maps(summary['history']);
    final balance = int.tryParse('${summary['balance'] ?? 0}') ?? 0;
    final referralCode = '${referral['code'] ?? ''}';

    return Scaffold(
      appBar: AppBar(title: const Text('Loyalty & rewards')),
      body: RefreshIndicator(
        onRefresh: _loadSummary,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
          children: [
            if (_loading && _summary == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 56),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && _summary == null)
              _sectionCard(
                title: 'Rewards unavailable',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_error!),
                    TextButton(
                      onPressed: _loadSummary,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              )
            else ...[
              _sectionCard(
                title: 'Your points',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$balance pts',
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            color: AppTheme.lightTurquoise,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text('${summary['tier'] ?? 'Starter'} member'),
                    const SizedBox(height: 12),
                    Text('${rules['earning'] ?? ''}'),
                    const SizedBox(height: 6),
                    Text('${rules['redemption'] ?? ''}'),
                    const SizedBox(height: 6),
                    Text('${rules['expiration'] ?? ''}'),
                  ],
                ),
              ),
              _sectionCard(
                title: 'Invite a friend',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${referral['rule'] ?? ''}'),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: SelectableText(
                            referralCode.isEmpty
                                ? 'Loading code…'
                                : referralCode,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(
                                  letterSpacing: 2,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Copy referral code',
                          onPressed: referralCode.isEmpty
                              ? null
                              : () => _copyReferralCode(referralCode),
                          icon: const Icon(Icons.copy_rounded),
                        ),
                      ],
                    ),
                    Text(
                      '${referral['rewarded_count'] ?? 0} friends completed a first visit',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _referralCodeController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Have a referral code?',
                        hintText: 'GG1234ABCD',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.tonal(
                      onPressed: _submittingReferral ? null : _applyReferral,
                      child: Text(
                        _submittingReferral ? 'Applying…' : 'Apply code',
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'A code must be applied before your first paid café visit. Self-referrals and repeat claims are blocked.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              _sectionCard(
                title: 'Visit streak',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${streak['current'] ?? 0} consecutive days'),
                    Text('Best streak: ${streak['best'] ?? 0} days'),
                    const SizedBox(height: 8),
                    const Text(
                      'Earn one visit day per completed paid session day.',
                    ),
                  ],
                ),
              ),
              if (challenge.isNotEmpty)
                _sectionCard(
                  title: '${challenge['title'] ?? 'Monthly challenge'}',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${challenge['description'] ?? ''}'),
                      const SizedBox(height: 10),
                      LinearProgressIndicator(
                        value:
                            (int.tryParse('${challenge['progress'] ?? 0}') ??
                                0) /
                            (int.tryParse(
                                  '${challenge['target_visits'] ?? 1}',
                                ) ??
                                1),
                        minHeight: 8,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${challenge['progress'] ?? 0}/${challenge['target_visits'] ?? 0} visit days · ${challenge['reward_points'] ?? 0} pts',
                      ),
                      if (challenge['completed'] == true)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Text('Completed — points credited.'),
                        ),
                    ],
                  ),
                ),
              _sectionCard(
                title: 'Birthday offer',
                child: Text(
                  birthday['birthday_today'] == true
                      ? 'Your ${birthday['reward_points'] ?? 100}-point birthday reward has been credited.'
                      : '${birthday['rule'] ?? ''}',
                ),
              ),
              _sectionCard(
                title: 'Achievements',
                child: badges.isEmpty
                    ? const Text(
                        'Complete café visits to earn your first badge.',
                      )
                    : Column(
                        children: badges.map((badge) {
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(
                              Icons.workspace_premium_outlined,
                              color: AppTheme.warning,
                            ),
                            title: Text('${badge['name'] ?? 'Achievement'}'),
                            subtitle: Text('${badge['description'] ?? ''}'),
                            trailing: Text('+${badge['reward_points'] ?? 0}'),
                          );
                        }).toList(),
                      ),
              ),
              _sectionCard(
                title: 'Points history',
                child: history.isEmpty
                    ? const Text(
                        'Your earned, redeemed, and bonus points will appear here.',
                      )
                    : Column(
                        children: history.map((entry) {
                          final points =
                              int.tryParse('${entry['points'] ?? 0}') ?? 0;
                          final createdAt = DateTime.tryParse(
                            '${entry['created_at'] ?? ''}',
                          );
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('${entry['note'] ?? 'Loyalty update'}'),
                            subtitle: Text(
                              '${entry['transaction_type'] ?? 'adjusted'}${createdAt == null ? '' : ' · ${formatDateTime(createdAt)}'}',
                            ),
                            trailing: Text(
                              '${points > 0 ? '+' : ''}$points pts',
                              style: TextStyle(
                                color: points < 0
                                    ? AppTheme.warning
                                    : AppTheme.lightTurquoise,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
