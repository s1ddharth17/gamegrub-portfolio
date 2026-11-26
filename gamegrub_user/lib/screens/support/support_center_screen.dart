import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/business.dart';
import '../../providers/auth_provider.dart';
import '../../services/business_service.dart';
import '../../services/support_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../bill/bill_screen.dart';

class SupportCenterScreen extends StatefulWidget {
  final int? businessId;
  final String? businessName;
  final int? bookingId;
  final int? orderId;
  final int? billId;

  const SupportCenterScreen({
    super.key,
    this.businessId,
    this.businessName,
    this.bookingId,
    this.orderId,
    this.billId,
  });

  @override
  State<SupportCenterScreen> createState() => _SupportCenterScreenState();
}

class _SupportCenterScreenState extends State<SupportCenterScreen> {
  final SupportService _service = SupportService();
  final BusinessService _businessService = BusinessService();
  final TextEditingController _subjectController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();
  List<Map<String, dynamic>> _faqs = const [];
  List<Map<String, dynamic>> _issues = const [];
  Business? _business;
  String _category = 'service';
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final token = context.read<AuthProvider>().token?.trim() ?? '';
    try {
      final faqFuture = _service.fetchFaqs(businessId: widget.businessId);
      final issueFuture = token.isEmpty
          ? Future<List>.value(const [])
          : _service.fetchIssues(token);
      final businessFuture = widget.businessId == null
          ? Future<Map<String, dynamic>?>.value(null)
          : _businessService.fetchBusinessDetails('${widget.businessId}');
      final results = await Future.wait<dynamic>([
        faqFuture,
        issueFuture,
        businessFuture,
      ]);
      if (!mounted) return;
      setState(() {
        _faqs = (results[0] as List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _issues = (results[1] as List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        if (results[2] != null) {
          _business = Business.fromJson(
            Map<String, dynamic>.from(results[2] as Map),
          );
        }
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitIssue() async {
    final token = context.read<AuthProvider>().token?.trim() ?? '';
    if (token.isEmpty) {
      setState(() => _error = 'Sign in to send a support request.');
      return;
    }
    if (_subjectController.text.trim().length < 4 ||
        _descriptionController.text.trim().length < 10) {
      setState(
        () => _error =
            'Add a short subject and a few details so the cafe can help.',
      );
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final response = await _service.createIssue(
        token: token,
        category: _category,
        subject: _subjectController.text.trim(),
        description: _descriptionController.text.trim(),
        businessId: widget.businessId,
        bookingId: widget.bookingId,
        orderId: widget.orderId,
        billId: widget.billId,
      );
      final issue = Map<String, dynamic>.from(response['issue'] as Map);
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => SupportIssueDetailScreen(
            issueId: int.tryParse('${issue['issue_id'] ?? 0}') ?? 0,
          ),
        ),
      );
      if (mounted) {
        _subjectController.clear();
        _descriptionController.clear();
        await _load();
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _contactPanel(BuildContext context) {
    final phone = _business?.phone.trim() ?? '';
    final email = _business?.contactEmail.trim() ?? '';
    return GlassPanel(
      padding: const EdgeInsets.all(20),
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: widget.businessName ?? _business?.name ?? 'GameGrub support',
            subtitle:
                'Contact the cafe about your visit or send a private support request.',
            trailing: const Icon(Icons.support_agent_rounded),
          ),
          const SizedBox(height: 12),
          if (phone.isNotEmpty)
            _ContactLine(icon: Icons.phone_outlined, label: phone),
          if (email.isNotEmpty)
            _ContactLine(icon: Icons.email_outlined, label: email),
          if (phone.isEmpty && email.isEmpty)
            Text(
              'Cafe phone and email are not listed. Send the cafe a message below and its team can reply here.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
          if (_business?.fullAddress.trim().isNotEmpty == true) ...[
            const SizedBox(height: 8),
            _ContactLine(
              icon: Icons.place_outlined,
              label: _business!.fullAddress,
            ),
          ],
        ],
      ),
    );
  }

  Widget _requestForm(BuildContext context) {
    final contextLabel = [
      if (widget.bookingId != null) 'Booking #${widget.bookingId}',
      if (widget.orderId != null) 'Order #${widget.orderId}',
      if (widget.billId != null) 'Bill #${widget.billId}',
    ].join(' · ');
    return GlassPanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Send a support request',
            subtitle: contextLabel.isEmpty
                ? 'Choose a cafe to contact or open Help from a booking, order, or bill.'
                : 'Linked to $contextLabel',
            trailing: const Icon(Icons.edit_note_rounded),
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(
              labelText: 'What do you need help with?',
            ),
            items: const [
              DropdownMenuItem(value: 'booking', child: Text('Booking')),
              DropdownMenuItem(value: 'order', child: Text('Food order')),
              DropdownMenuItem(value: 'refund', child: Text('Refund')),
              DropdownMenuItem(value: 'payment', child: Text('Payment')),
              DropdownMenuItem(value: 'service', child: Text('Cafe service')),
              DropdownMenuItem(value: 'other', child: Text('Something else')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _category = value);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _subjectController,
            maxLength: 160,
            decoration: const InputDecoration(labelText: 'Subject'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _descriptionController,
            minLines: 3,
            maxLines: 6,
            maxLength: 4000,
            decoration: const InputDecoration(
              labelText: 'Tell us what happened',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submitIssue,
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_rounded),
              label: Text(_submitting ? 'Sending…' : 'Send request'),
            ),
          ),
          if (widget.billId != null || widget.bookingId != null) ...[
            const SizedBox(height: 10),
            Text(
              'Refund requests for cancelled bookings and completed food orders are available from the linked booking or bill.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Help & support')),
      body: AppBackdrop(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
                children: [
                  HeroGlassPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'We can help with your visit',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Get help with a booking, kitchen order, payment, or refund. Your case updates stay in the app.',
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _ErrorPanel(message: _error!),
                  ],
                  const SizedBox(height: 14),
                  _contactPanel(context),
                  const SizedBox(height: 14),
                  _requestForm(context),
                  if (_issues.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    AppSectionTitle(
                      title: 'Your requests',
                      subtitle:
                          'Follow replies and status changes from the cafe team.',
                    ),
                    const SizedBox(height: 12),
                    ..._issues.map(
                      (issue) => _SupportIssueTile(
                        issue: issue,
                        onTap: () => Navigator.of(context).push<void>(
                          MaterialPageRoute<void>(
                            builder: (_) => SupportIssueDetailScreen(
                              issueId:
                                  int.tryParse('${issue['issue_id'] ?? 0}') ??
                                  0,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (_faqs.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    AppSectionTitle(
                      title: 'Frequently asked questions',
                      subtitle:
                          'Quick answers for common booking, food, payment, and refund questions.',
                    ),
                    const SizedBox(height: 12),
                    GlassPanel(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 6,
                      ),
                      child: Column(
                        children: _faqs
                            .map(
                              (faq) => ExpansionTile(
                                tilePadding: EdgeInsets.zero,
                                title: Text('${faq['question'] ?? ''}'),
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 14),
                                    child: Align(
                                      alignment: Alignment.centerLeft,
                                      child: Text('${faq['answer'] ?? ''}'),
                                    ),
                                  ),
                                ],
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

class SupportIssueDetailScreen extends StatefulWidget {
  final int issueId;

  const SupportIssueDetailScreen({super.key, required this.issueId});

  @override
  State<SupportIssueDetailScreen> createState() =>
      _SupportIssueDetailScreenState();
}

class _SupportIssueDetailScreenState extends State<SupportIssueDetailScreen> {
  final SupportService _service = SupportService();
  final TextEditingController _replyController = TextEditingController();
  Map<String, dynamic>? _issue;
  String? _error;
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadIssue);
  }

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _loadIssue() async {
    final token = context.read<AuthProvider>().token?.trim() ?? '';
    try {
      final issue = await _service.fetchIssue(
        token: token,
        issueId: widget.issueId,
      );
      if (mounted) {
        setState(() {
          _issue = issue;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendReply() async {
    final message = _replyController.text.trim();
    if (message.length < 2) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final token = context.read<AuthProvider>().token?.trim() ?? '';
      await _service.addCustomerComment(
        token: token,
        issueId: widget.issueId,
        message: message,
      );
      _replyController.clear();
      await _loadIssue();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final issue = _issue;
    final events = (issue?['events'] as List? ?? const [])
        .map((item) => Map<String, dynamic>.from(item as Map))
        .toList();
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(issue?['issue_number']?.toString() ?? 'Support request'),
      ),
      body: AppBackdrop(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : issue == null
            ? Center(child: Text(_error ?? 'Support request not found.'))
            : ListView(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
                children: [
                  if (_error != null) _ErrorPanel(message: _error!),
                  GlassPanel(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          issue['subject']?.toString() ?? '',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${issue['business_name'] ?? 'Cafe'} · ${titleCase('${issue['status'] ?? 'open'}'.replaceAll('_', ' '))}',
                        ),
                        const SizedBox(height: 14),
                        Text(issue['description']?.toString() ?? ''),
                        if (issue['resolution_summary']
                                ?.toString()
                                .trim()
                                .isNotEmpty ==
                            true) ...[
                          const SizedBox(height: 14),
                          Text(
                            'Resolution',
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          const SizedBox(height: 5),
                          Text(issue['resolution_summary'].toString()),
                        ],
                        if (issue['bill_id'] != null ||
                            issue['booking_id'] != null) ...[
                          const SizedBox(height: 16),
                          OutlinedButton.icon(
                            onPressed: () => Navigator.of(context).push<void>(
                              MaterialPageRoute<void>(
                                builder: (_) => issue['bill_id'] != null
                                    ? BillScreen(
                                        billId: int.tryParse(
                                          '${issue['bill_id']}',
                                        ),
                                      )
                                    : BillScreen(
                                        bookingId: int.tryParse(
                                          '${issue['booking_id']}',
                                        ),
                                      ),
                              ),
                            ),
                            icon: const Icon(Icons.receipt_long_outlined),
                            label: const Text(
                              'Open linked bill and refund options',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  AppSectionTitle(
                    title: 'Status timeline',
                    subtitle:
                        'Replies and status changes from you and the cafe team.',
                  ),
                  const SizedBox(height: 12),
                  ...events.map((event) => _SupportEventTile(event: event)),
                  if (!['closed'].contains('${issue['status']}')) ...[
                    const SizedBox(height: 12),
                    GlassPanel(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          TextField(
                            controller: _replyController,
                            minLines: 2,
                            maxLines: 5,
                            maxLength: 3000,
                            decoration: const InputDecoration(
                              labelText: 'Reply to the cafe team',
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              onPressed: _sending ? null : _sendReply,
                              icon: const Icon(Icons.reply_rounded),
                              label: Text(_sending ? 'Sending…' : 'Send reply'),
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
}

class _ContactLine extends StatelessWidget {
  final IconData icon;
  final String label;

  const _ContactLine({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.primaryTurquoise),
        const SizedBox(width: 9),
        Expanded(child: SelectableText(label)),
      ],
    ),
  );
}

class _SupportIssueTile extends StatelessWidget {
  final Map<String, dynamic> issue;
  final VoidCallback onTap;

  const _SupportIssueTile({required this.issue, required this.onTap});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: GlassPanel(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(
              Icons.support_agent_rounded,
              color: AppTheme.primaryTurquoise,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    issue['subject']?.toString() ?? 'Support request',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${issue['issue_number'] ?? ''} · ${issue['business_name'] ?? ''}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
            GlowBadge(
              label: titleCase(
                '${issue['status'] ?? 'open'}'.replaceAll('_', ' '),
              ),
              color: AppTheme.primaryOrange,
            ),
          ],
        ),
      ),
    ),
  );
}

class _SupportEventTile extends StatelessWidget {
  final Map<String, dynamic> event;

  const _SupportEventTile({required this.event});

  @override
  Widget build(BuildContext context) {
    final time = DateTime.tryParse('${event['created_at'] ?? ''}');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassPanel(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    event['actor_name']?.toString() ?? 'Support update',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Text(
                  time == null ? '' : formatDateTime(time),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
              ],
            ),
            if ('${event['message'] ?? ''}'.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(event['message'].toString()),
            ],
          ],
        ),
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  final String message;

  const _ErrorPanel({required this.message});

  @override
  Widget build(BuildContext context) => GlassPanel(
    padding: const EdgeInsets.all(14),
    child: Text(message, style: const TextStyle(color: AppTheme.danger)),
  );
}
