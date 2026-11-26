import 'package:flutter/material.dart';

import '../models/slot.dart';
import '../theme/app_theme.dart';

class SlotChip extends StatelessWidget {
  final Slot slot;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  const SlotChip({
    super.key,
    required this.slot,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final background = disabled
        ? AppTheme.surface.withValues(alpha: 0.62)
        : selected
        ? AppTheme.primaryOrange.withValues(alpha: 0.18)
        : AppTheme.raisedSurface.withValues(alpha: 0.78);

    final foreground = disabled
        ? AppTheme.disabledText
        : selected
        ? AppTheme.primaryText
        : AppTheme.primaryText;

    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        constraints: const BoxConstraints(minWidth: 94),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected
                ? AppTheme.primaryOrange
                : disabled
                ? AppTheme.subtleBorder.withValues(alpha: 0.58)
                : AppTheme.subtleBorder.withValues(alpha: 0.92),
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppTheme.primaryOrange.withValues(alpha: 0.18),
                    blurRadius: 26,
                    spreadRadius: -10,
                    offset: const Offset(0, 10),
                  ),
                ]
              : null,
        ),
        child: Text(
          slot.label,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            color: foreground,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
