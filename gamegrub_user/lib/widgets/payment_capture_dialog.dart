import 'package:flutter/material.dart';

import '../models/payment.dart';
import '../services/payment_service.dart';
import '../utils/app_formatters.dart';
import 'app_chrome.dart';

class PaymentCaptureResult {
  final String paymentMethod;
  final String? paymentReference;

  const PaymentCaptureResult({
    required this.paymentMethod,
    this.paymentReference,
  });
}

class PaymentCaptureDetail {
  final String label;
  final String value;

  const PaymentCaptureDetail({required this.label, required this.value});
}

Future<PaymentCaptureResult?> showPaymentCaptureDialog(
  BuildContext context, {
  required String title,
  required String subtitle,
  required double amount,
  required String confirmLabel,
  List<PaymentCaptureDetail> details = const [],
}) {
  return showDialog<PaymentCaptureResult>(
    context: context,
    builder: (_) => PaymentCaptureDialog(
      title: title,
      subtitle: subtitle,
      amount: amount,
      confirmLabel: confirmLabel,
      details: details,
    ),
  );
}

class PaymentCaptureDialog extends StatefulWidget {
  final String title;
  final String subtitle;
  final double amount;
  final String confirmLabel;
  final List<PaymentCaptureDetail> details;

  const PaymentCaptureDialog({
    super.key,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.confirmLabel,
    this.details = const [],
  });

  @override
  State<PaymentCaptureDialog> createState() => _PaymentCaptureDialogState();
}

class _PaymentCaptureDialogState extends State<PaymentCaptureDialog> {
  final PaymentService _paymentService = PaymentService();
  final TextEditingController _referenceController = TextEditingController();

  List<PaymentMethodOption> _methods = const [];
  String _paymentMethod = 'cash';
  bool _isLoading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadMethods();
  }

  @override
  void dispose() {
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _loadMethods() async {
    setState(() {
      _isLoading = true;
      _loadError = null;
    });

    try {
      final methods = await _paymentService.fetchMethods();
      if (!mounted) {
        return;
      }

      setState(() {
        _methods = methods;
        _paymentMethod = methods.isEmpty ? 'cash' : methods.first.code;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadError = error.toString();
        _isLoading = false;
      });
    }
  }

  bool get _requiresReference => _paymentMethod != 'cash';

  String get _referenceLabel {
    switch (_paymentMethod) {
      case 'upi':
        return 'UPI reference';
      case 'card':
        return 'Card slip / approval code';
      case 'wallet':
        return 'Wallet transaction ID';
      default:
        return 'Transaction reference';
    }
  }

  String get _referenceHint {
    switch (_paymentMethod) {
      case 'upi':
        return 'Enter UTR or UPI app reference';
      case 'card':
        return 'Enter terminal approval code';
      case 'wallet':
        return 'Enter wallet transaction ID';
      default:
        return 'Optional';
    }
  }

  void _confirm() {
    if (_requiresReference && _referenceController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Add $_referenceLabel before continuing.')),
      );
      return;
    }

    Navigator.pop(
      context,
      PaymentCaptureResult(
        paymentMethod: _paymentMethod,
        paymentReference: _referenceController.text.trim().isEmpty
            ? null
            : _referenceController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 420,
        child: _isLoading
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              )
            : _loadError != null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_loadError!),
                  const SizedBox(height: 16),
                  OutlinedButton(
                    onPressed: _loadMethods,
                    child: const Text('Retry'),
                  ),
                ],
              )
            : SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.subtitle),
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        color: Theme.of(
                          context,
                        ).colorScheme.primary.withValues(alpha: 0.1),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Amount to collect',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            formatCurrency(widget.amount),
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ],
                      ),
                    ),
                    if (widget.details.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      ...widget.details.map(
                        (detail) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: Text(detail.label)),
                              const SizedBox(width: 12),
                              Flexible(
                                child: Text(
                                  detail.value,
                                  textAlign: TextAlign.right,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Text(
                      'Payment method',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 10),
                    ..._methods.map(
                      (method) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: InkWell(
                          onTap: () {
                            setState(() {
                              _paymentMethod = method.code;
                            });
                          },
                          borderRadius: BorderRadius.circular(18),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(18),
                              color: _paymentMethod == method.code
                                  ? Theme.of(
                                      context,
                                    ).colorScheme.primary.withValues(alpha: 0.1)
                                  : Colors.white.withValues(alpha: 0.03),
                              border: Border.all(
                                color: _paymentMethod == method.code
                                    ? Theme.of(context).colorScheme.primary
                                          .withValues(alpha: 0.3)
                                    : Colors.white.withValues(alpha: 0.08),
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  _paymentMethod == method.code
                                      ? Icons.radio_button_checked
                                      : Icons.radio_button_off,
                                  color: _paymentMethod == method.code
                                      ? Theme.of(context).colorScheme.primary
                                      : Colors.white.withValues(alpha: 0.5),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        method.label,
                                        style: Theme.of(
                                          context,
                                        ).textTheme.titleMedium,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(method.description),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _referenceController,
                      enabled: _requiresReference,
                      decoration: buildAppInputDecoration(
                        label: _referenceLabel,
                        hint: _referenceHint,
                        helper:
                            'Required for non-cash payments so the staff can match the payment record.',
                        icon: Icons.receipt_long_outlined,
                      ),
                    ),
                  ],
                ),
              ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading || _loadError != null ? null : _confirm,
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
