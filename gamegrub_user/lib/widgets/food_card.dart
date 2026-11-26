import 'package:flutter/material.dart';

import '../models/menu.dart';
import '../theme/app_theme.dart';
import '../utils/app_formatters.dart';
import 'app_chrome.dart';

class FoodCard extends StatelessWidget {
  final MenuItemModel item;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;
  final bool isOrderingEnabled;
  final String disabledMessage;

  const FoodCard({
    super.key,
    required this.item,
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
    this.isOrderingEnabled = true,
    this.disabledMessage = 'Order during your session.',
  });

  @override
  Widget build(BuildContext context) {
    final accent = item.isFeatured
        ? AppTheme.primaryOrange
        : AppTheme.primaryTurquoise;

    return GlassPanel(
      padding: const EdgeInsets.all(16),
      glowColor: item.isFeatured ? accent : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (item.isFeatured)
                      const _MiniBadge(
                        label: 'Featured',
                        color: AppTheme.primaryOrange,
                        icon: Icons.local_fire_department_rounded,
                      ),
                    _MiniBadge(
                      label: item.category,
                      color: AppTheme.primaryTurquoise,
                      icon: Icons.restaurant_menu_rounded,
                    ),
                    if (!item.isAvailable)
                      const _MiniBadge(
                        label: 'Unavailable',
                        color: Colors.redAccent,
                        icon: Icons.block_outlined,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(item.name, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                  item.description.isEmpty
                      ? 'Freshly prepared and delivered to your setup.'
                      : item.description,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 14,
                  runSpacing: 8,
                  children: [
                    Text(
                      formatCurrency(item.amount),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      '${item.prepTimeMinutes} min prep',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                if (isOrderingEnabled && item.isAvailable)
                  _QuantityControl(
                    quantity: quantity,
                    onAdd: onAdd,
                    onRemove: onRemove,
                    amount: item.amount,
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.raisedSurface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AppTheme.subtleBorder.withValues(alpha: 0.9),
                      ),
                    ),
                    child: Text(
                      item.isAvailable
                          ? disabledMessage
                          : 'Currently unavailable. Check back soon.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: item.image.trim().isEmpty
                    ? _FoodPreview(accent: accent)
                    : AppSmartImage(
                        source: item.image,
                        width: 112,
                        height: 112,
                        fallback: _FoodPreview(accent: accent),
                      ),
              ),
              const SizedBox(height: 12),
              if (isOrderingEnabled && item.isAvailable)
                quantity == 0
                    ? SizedBox(
                        width: 112,
                        child: ElevatedButton(
                          onPressed: onAdd,
                          child: const Text('ADD'),
                        ),
                      )
                    : Container(
                        width: 112,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryOrange.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: AppTheme.primaryOrange.withValues(
                              alpha: 0.16,
                            ),
                          ),
                        ),
                        child: Row(
                          children: [
                            _StepperButton(
                              icon: Icons.remove_rounded,
                              onTap: onRemove,
                            ),
                            Expanded(
                              child: Text(
                                '$quantity',
                                textAlign: TextAlign.center,
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w800),
                              ),
                            ),
                            _StepperButton(
                              icon: Icons.add_rounded,
                              onTap: onAdd,
                            ),
                          ],
                        ),
                      ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuantityControl extends StatelessWidget {
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;
  final double amount;

  const _QuantityControl({
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
    required this.amount,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            quantity > 0
                ? '$quantity item${quantity == 1 ? '' : 's'} in cart'
                : 'Tap add to start your order',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          quantity > 0
              ? formatCurrency(amount * quantity)
              : formatCurrency(amount),
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: quantity > 0 ? AppTheme.primaryOrange : AppTheme.primaryText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _FoodPreview extends StatelessWidget {
  final Color accent;

  const _FoodPreview({required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 112,
      height: 112,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [accent.withValues(alpha: 0.16), AppTheme.raisedSurface],
        ),
      ),
      child: Icon(Icons.fastfood_rounded, size: 34, color: accent),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;

  const _MiniBadge({
    required this.label,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.16)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _StepperButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _StepperButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.primaryOrange.withValues(alpha: 0.12),
          ),
        ),
        child: Icon(icon, size: 16, color: AppTheme.primaryOrange),
      ),
    );
  }
}
