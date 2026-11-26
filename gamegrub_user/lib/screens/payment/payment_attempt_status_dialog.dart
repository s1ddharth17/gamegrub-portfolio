import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

typedef PaymentAttemptStatusFetcher =
    Future<Map<String, dynamic>> Function({
      required String token,
      required String attemptId,
    });

class PaymentAttemptStatusDialog extends StatefulWidget {
  final String token;
  final String attemptId;
  final String checkoutUrl;
  final PaymentAttemptStatusFetcher fetchAttemptStatus;

  const PaymentAttemptStatusDialog({
    super.key,
    required this.token,
    required this.attemptId,
    required this.checkoutUrl,
    required this.fetchAttemptStatus,
  });

  @override
  State<PaymentAttemptStatusDialog> createState() =>
      _PaymentAttemptStatusDialogState();
}

class _PaymentAttemptStatusDialogState
    extends State<PaymentAttemptStatusDialog> {
  String _status = 'pending';
  bool _checking = false;

  String get _statusMessage => switch (_status) {
    'captured' =>
      'Payment verified. Refresh the bill to see the remaining balance.',
    'failed' => 'Razorpay reported a failed payment.',
    'cancelled' => 'Checkout was cancelled.',
    'expired' => 'The checkout window expired. Start a fresh payment attempt.',
    'captured_review' =>
      'Payment was received after the session changed. Contact café support.',
    _ =>
      'Payment is pending verification. Complete Razorpay checkout, return here, then check again.',
  };

  Future<void> _checkStatus() async {
    setState(() => _checking = true);
    try {
      final attempt = await widget.fetchAttemptStatus(
        token: widget.token,
        attemptId: widget.attemptId,
      );
      if (mounted) {
        setState(() => _status = '${attempt['status'] ?? 'pending'}');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _status = 'pending');
      }
    } finally {
      if (mounted) {
        setState(() => _checking = false);
      }
    }
  }

  Future<void> _openCheckout() async {
    final launched = await launchUrl(
      Uri.parse(widget.checkoutUrl),
      mode: LaunchMode.externalApplication,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open secure checkout.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Session payment status'),
      content: Text(_statusMessage),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, _status),
          child: const Text('Done'),
        ),
        TextButton(
          onPressed: _openCheckout,
          child: const Text('Open checkout'),
        ),
        FilledButton(
          onPressed: _checking || _status == 'captured' ? null : _checkStatus,
          child: _checking
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Check status'),
        ),
      ],
    );
  }
}
