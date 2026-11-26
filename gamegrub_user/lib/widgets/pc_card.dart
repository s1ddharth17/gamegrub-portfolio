import 'package:flutter/material.dart';

import '../models/pc.dart';
import '../theme/app_theme.dart';
import '../utils/app_formatters.dart';
import 'app_chrome.dart';

class PcCard extends StatelessWidget {
  final PC pc;
  final VoidCallback? onBook;

  const PcCard({super.key, required this.pc, this.onBook});

  Color _stateColor() {
    if (pc.isDisabled) {
      return AppTheme.danger;
    }
    if (pc.isAvailable) {
      return AppTheme.success;
    }
    if (pc.availabilityLabel.toLowerCase() == 'reserved') {
      return AppTheme.primaryTurquoise;
    }
    return AppTheme.warning;
  }

  String get _ctaLabel {
    if (pc.isDisabled) {
      return 'Unavailable';
    }
    if (pc.isAvailable) {
      return 'Book now';
    }
    return 'Check slots';
  }

  String get _timerLabel {
    if (pc.overtimeMinutes != null && pc.overtimeMinutes! > 0) {
      return '${pc.overtimeMinutes} min overtime';
    }
    if (pc.remainingMinutes != null && pc.remainingMinutes! > 0) {
      return '${pc.remainingMinutes} min remaining';
    }
    if (pc.elapsedMinutes != null && pc.elapsedMinutes! > 0) {
      return '${pc.elapsedMinutes} min live';
    }
    return pc.isAvailable ? 'Ready now' : 'Status pending';
  }

  List<String> _specTokens() {
    return pc.specs
        .split(RegExp(r',|\||/'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  String _findToken(List<String> tokens, RegExp pattern, String fallback) {
    for (final token in tokens) {
      if (pattern.hasMatch(token.toLowerCase())) {
        return token;
      }
    }
    return fallback;
  }

  void _showDetails(BuildContext context) {
    final tokens = _specTokens();
    final gpu = _findToken(
      tokens,
      RegExp(r'(rtx|gtx|rx|arc|gpu)'),
      tokens.isNotEmpty ? tokens.first : pc.specs,
    );
    final cpu = _findToken(
      tokens,
      RegExp(r'(ryzen|intel|core|cpu|i[3579])'),
      tokens.length > 1 ? tokens[1] : 'CPU listed in specs',
    );
    final ram = _findToken(
      tokens,
      RegExp(r'(ram|\b\d+\s?gb\b)'),
      tokens.length > 2 ? tokens[2] : 'RAM listed in specs',
    );

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.md,
            AppSpace.md,
            AppSpace.md,
            AppSpace.lg,
          ),
          child: GlassPanel(
            glowColor: _stateColor(),
            padding: const EdgeInsets.all(AppSpace.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AppIconOrb(
                      icon: Icons.memory_rounded,
                      accent: _stateColor(),
                      size: 52,
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            pc.stationTitle,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            pc.availabilityLabel,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(color: AppTheme.secondaryText),
                          ),
                        ],
                      ),
                    ),
                    GlowBadge(label: pc.categoryLabel, color: AppTheme.primaryTurquoise),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: [
                    StatChip(
                      label: 'GPU',
                      value: gpu,
                      accent: AppTheme.primaryOrange,
                    ),
                    StatChip(
                      label: 'CPU',
                      value: cpu,
                      accent: AppTheme.primaryTurquoise,
                    ),
                    StatChip(
                      label: 'RAM',
                      value: ram,
                      accent: AppTheme.success,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
                Text(
                  pc.specs,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                AppDataRow(
                  label: 'Hourly rate',
                  value: '${formatCurrency(pc.price)}/hr',
                ),
                AppDataRow(label: 'Availability', value: pc.availabilityLabel),
                AppDataRow(
                  label: 'Live timer',
                  value: _timerLabel,
                  padding: EdgeInsets.zero,
                ),
                const SizedBox(height: AppSpace.lg),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: onBook == null
                        ? null
                        : () {
                            Navigator.pop(context);
                            onBook?.call();
                          },
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: Text(_ctaLabel),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final stateColor = _stateColor();
    final tokens = _specTokens();
    final gpu = _findToken(
      tokens,
      RegExp(r'(rtx|gtx|rx|arc|gpu)'),
      tokens.isNotEmpty ? tokens.first : 'Specs listed below',
    );
    final cpu = _findToken(
      tokens,
      RegExp(r'(ryzen|intel|core|cpu|i[3579])'),
      tokens.length > 1 ? tokens[1] : 'CPU listed',
    );
    final ram = _findToken(
      tokens,
      RegExp(r'(ram|\b\d+\s?gb\b)'),
      tokens.length > 2 ? tokens[2] : 'RAM listed',
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: GlassPanel(
        padding: const EdgeInsets.all(AppSpace.lg),
        glowColor: stateColor,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIconOrb(
                  icon: pc.isAvailable
                      ? Icons.computer_rounded
                      : pc.isDisabled
                      ? Icons.build_circle_outlined
                      : Icons.timer_outlined,
                  accent: stateColor,
                  size: 52,
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pc.stationTitle,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: AppSpace.xs),
                      Text(
                        pc.categoryLabel,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                GlowBadge(label: pc.availabilityLabel, color: stateColor),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Wrap(
              spacing: AppSpace.xs,
              runSpacing: AppSpace.xs,
              children: [
                GlowBadge(
                  label: gpu,
                  color: AppTheme.primaryOrange,
                  icon: Icons.developer_board_rounded,
                ),
                GlowBadge(
                  label: cpu,
                  color: AppTheme.primaryTurquoise,
                  icon: Icons.memory_outlined,
                ),
                GlowBadge(
                  label: ram,
                  color: AppTheme.success,
                  icon: Icons.bolt_rounded,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Text(
              pc.specs,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.secondaryText,
              ),
            ),
            const SizedBox(height: AppSpace.md),
            Wrap(
              spacing: AppSpace.sm,
              runSpacing: AppSpace.sm,
              children: [
                AppMetricTile(
                  label: 'Hourly rate',
                  value: '${formatCurrency(pc.price)}/hr',
                  caption: 'Premium setup pricing',
                  accent: AppTheme.primaryOrange,
                  icon: Icons.currency_rupee_rounded,
                  minWidth: 148,
                ),
                AppMetricTile(
                  label: 'Live timer',
                  value: _timerLabel,
                  caption: 'Updated from the floor feed',
                  accent: stateColor,
                  icon: Icons.timer_outlined,
                  minWidth: 148,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onBook,
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: Text(_ctaLabel),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showDetails(context),
                    icon: const Icon(Icons.info_outline_rounded),
                    label: const Text('View details'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
