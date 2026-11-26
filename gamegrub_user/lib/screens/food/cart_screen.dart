import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/order_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';

class CartScreen extends StatefulWidget {
  final int bookingId;

  const CartScreen({super.key, required this.bookingId});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final TextEditingController _customerNotesController =
      TextEditingController();

  @override
  void dispose() {
    _customerNotesController.dispose();
    super.dispose();
  }

  Future<void> _submitOrder(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) {
      return;
    }

    final provider = context.read<OrderProvider>();
    final cartTotal = provider.localSelectionTotal;

    final success = await provider.submitOrder(
      token,
      widget.bookingId,
      deferPayment: true,
      customerNotes: _customerNotesController.text.trim(),
    );

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Order placed. ${formatCurrency(cartTotal)} was added to session checkout.'
              : provider.errorMessage ?? 'Could not place the order.',
        ),
      ),
    );

    if (success && context.mounted) {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OrderProvider>();
    final cartEntries = provider.cartEntries;
    final activeOrders = provider.orderSummary?.orders ?? const [];

    return Scaffold(
      appBar: AppBar(title: const Text('Cart summary')),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 160),
          children: [
            HeroGlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      GlowBadge(
                        label: '${provider.cartItemCount} items',
                        color: AppTheme.primaryOrange,
                        icon: Icons.shopping_bag_outlined,
                      ),
                      const GlowBadge(
                        label: 'Pay with session checkout',
                        color: AppTheme.primaryTurquoise,
                        icon: Icons.receipt_long_outlined,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Everything ready for the kitchen',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Review your items, then send the order now. The amount is added to your live session bill.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    formatCurrency(provider.localSelectionTotal),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            if (cartEntries.isEmpty)
              const EmptyGlassState(
                title: 'Your cart is empty',
                message: 'Add items from the menu to place an order.',
                icon: Icons.remove_shopping_cart_outlined,
              )
            else ...[
              AppSectionTitle(
                title: 'Your order',
                subtitle: 'Adjust quantities before sending this to the cafe.',
                trailing: GlowBadge(
                  label: formatCurrency(provider.localSelectionTotal),
                  color: AppTheme.primaryOrange,
                ),
              ),
              const SizedBox(height: 14),
              ...cartEntries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _CartLineItem(entry: entry),
                ),
              ),
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Note for the kitchen',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _customerNotesController,
                      maxLength: 500,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Add an allergy or preparation request',
                        alignLabelWithHint: true,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              GlassPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bill details',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 14),
                    AppDataRow(
                      label: 'Items total',
                      value: formatCurrency(provider.localSelectionTotal),
                    ),
                    const AppDataRow(
                      label: 'Payment',
                      value: 'Added to live session checkout',
                    ),
                    AppDataRow(
                      label: 'To pay later',
                      value: formatCurrency(provider.localSelectionTotal),
                      emphasize: true,
                      valueColor: AppTheme.primaryOrange,
                      padding: const EdgeInsets.only(top: 8),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            GlassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'How this works',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'The kitchen starts preparing as soon as you place the order. You do not pay right away here; the amount is carried to your GameGrub session checkout.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            GlassPanel(
              glowColor: AppTheme.primaryTurquoise,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppSectionTitle(
                    title: 'Kitchen queue',
                    subtitle: 'Orders already placed for this booking.',
                    trailing: GlowBadge(
                      label: '${activeOrders.length} live',
                      color: AppTheme.primaryTurquoise,
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (activeOrders.isEmpty)
                    Text(
                      'No open food orders for this booking yet.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    )
                  else
                    ...activeOrders.map(
                      (order) => Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.7),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: AppTheme.subtleBorder.withValues(
                              alpha: 0.86,
                            ),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Order #${order.orderId}',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                ),
                                GlowBadge(
                                  label: titleCase(
                                    order.status.replaceAll('_', ' '),
                                  ),
                                  color: AppTheme.primaryTurquoise,
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (order.status == 'preparing' &&
                                order.etaAt != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                  _cartEtaLabel(order.etaAt!),
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        color: AppTheme.primaryTurquoise,
                                        fontWeight: FontWeight.w700,
                                      ),
                                ),
                              ),
                            if (order.notes.trim().isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                  'Your note for the kitchen: ${order.notes}',
                                ),
                              ),
                            ...order.items.map(
                              (item) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text('${item.name} x ${item.qty}'),
                                    ),
                                    Text(formatCurrency(item.total)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 10, 20, 18),
        child: GlassPanel(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          borderRadius: const BorderRadius.all(Radius.circular(24)),
          glowColor: provider.hasCartItems
              ? AppTheme.primaryOrange
              : AppTheme.primaryTurquoise,
          child: Row(
            children: [
              if (provider.hasCartItems)
                TextButton(
                  onPressed: provider.clearCart,
                  child: const Text('Clear'),
                ),
              if (provider.hasCartItems) const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: provider.isSubmitting || !provider.hasCartItems
                      ? null
                      : () => _submitOrder(context),
                  child: provider.isSubmitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          provider.hasCartItems
                              ? 'Place order for ${formatCurrency(provider.localSelectionTotal)}'
                              : 'Add items to continue',
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _cartEtaLabel(DateTime etaAt) {
  final remaining = etaAt.toLocal().difference(DateTime.now());
  if (remaining.isNegative) {
    return 'Estimated ready time has passed. The cafe may update this shortly.';
  }
  if (remaining.inMinutes < 1) {
    return 'Estimated ready in less than a minute';
  }
  return 'Estimated ready in ${remaining.inMinutes} min';
}

class _CartLineItem extends StatelessWidget {
  final CartEntry entry;

  const _CartLineItem({required this.entry});

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: entry.item.image.trim().isEmpty
                ? Container(
                    width: 86,
                    height: 86,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AppTheme.primaryOrange.withValues(alpha: 0.16),
                          AppTheme.raisedSurface,
                        ],
                      ),
                    ),
                    child: const Icon(Icons.fastfood_rounded, size: 28),
                  )
                : AppSmartImage(
                    source: entry.item.image,
                    width: 86,
                    height: 86,
                    fallback: Container(
                      width: 86,
                      height: 86,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppTheme.primaryOrange.withValues(alpha: 0.16),
                            AppTheme.raisedSurface,
                          ],
                        ),
                      ),
                      child: const Icon(Icons.fastfood_rounded, size: 28),
                    ),
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.item.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  '${entry.item.category} • ${entry.item.prepTimeMinutes} mins prep',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _CartStepButton(
                      icon: Icons.remove_rounded,
                      onTap: () => context.read<OrderProvider>().updateQuantity(
                        entry.item.id,
                        entry.quantity - 1,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        '${entry.quantity}',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    _CartStepButton(
                      icon: Icons.add_rounded,
                      onTap: () => context.read<OrderProvider>().updateQuantity(
                        entry.item.id,
                        entry.quantity + 1,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            formatCurrency(entry.item.amount * entry.quantity),
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _CartStepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _CartStepButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: AppTheme.primaryOrange.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.primaryOrange.withValues(alpha: 0.16),
          ),
        ),
        child: Icon(icon, size: 18, color: AppTheme.primaryOrange),
      ),
    );
  }
}
