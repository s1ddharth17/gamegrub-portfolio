import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../providers/theme_provider.dart';
import '../theme/app_theme.dart';

InputDecoration buildAppInputDecoration({
  required String label,
  String? hint,
  String? helper,
  IconData? icon,
  Widget? suffixIcon,
  bool alignLabelWithHint = false,
  String? counterText,
  InputBorder? border,
}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    prefixIcon: icon == null ? null : Icon(icon),
    suffixIcon: suffixIcon,
    alignLabelWithHint: alignLabelWithHint,
    counterText: counterText,
    border: border,
    enabledBorder: border,
    focusedBorder: border,
    errorBorder: border,
    focusedErrorBorder: border,
  );
}

Uint8List? _decodeInlineImageBytes(String? source) {
  final normalized = source?.trim() ?? '';
  if (!normalized.toLowerCase().startsWith('data:image/')) {
    return null;
  }

  final commaIndex = normalized.indexOf(',');
  if (commaIndex <= 0) {
    return null;
  }

  final metadata = normalized.substring(0, commaIndex).toLowerCase();
  if (!metadata.contains(';base64')) {
    return null;
  }

  final payload = normalized
      .substring(commaIndex + 1)
      .replaceAll(RegExp(r'\s+'), '');
  if (payload.isEmpty) {
    return null;
  }

  try {
    return base64Decode(payload);
  } on FormatException {
    return null;
  }
}

ImageProvider<Object>? resolveAppImageProvider(String? source) {
  final normalized = source?.trim() ?? '';
  if (normalized.isEmpty) {
    return null;
  }

  final inlineBytes = _decodeInlineImageBytes(normalized);
  if (inlineBytes != null) {
    return MemoryImage(inlineBytes);
  }

  final resolvedUrl = ApiConfig.resolveUpload(normalized);
  if (resolvedUrl.isEmpty) {
    return null;
  }

  return NetworkImage(resolvedUrl);
}

class AppSmartImage extends StatelessWidget {
  final String? source;
  final Widget fallback;
  final BoxFit fit;
  final Alignment alignment;
  final double? width;
  final double? height;
  final FilterQuality filterQuality;
  final Duration fadeDuration;

  const AppSmartImage({
    super.key,
    required this.source,
    required this.fallback,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.width,
    this.height,
    this.filterQuality = FilterQuality.medium,
    this.fadeDuration = AppMotion.slow,
  });

  @override
  Widget build(BuildContext context) {
    final imageProvider = resolveAppImageProvider(source);
    if (imageProvider == null) {
      return fallback;
    }

    return SizedBox(
      width: width,
      height: height,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(child: fallback),
          Positioned.fill(
            child: Image(
              image: imageProvider,
              fit: fit,
              alignment: alignment,
              filterQuality: filterQuality,
              frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                return AnimatedOpacity(
                  duration: fadeDuration,
                  curve: Curves.easeOut,
                  opacity: wasSynchronouslyLoaded || frame != null ? 1 : 0,
                  child: child,
                );
              },
              errorBuilder: (context, error, stackTrace) {
                return const SizedBox.shrink();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class AppInteractiveSurface extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final BorderRadiusGeometry borderRadius;
  final double hoverOffset;
  final double hoverScale;
  final double pressedScale;

  const AppInteractiveSurface({
    super.key,
    required this.child,
    this.onTap,
    this.borderRadius = const BorderRadius.all(Radius.circular(AppRadius.card)),
    this.hoverOffset = 2,
    this.hoverScale = 1.0,
    this.pressedScale = 0.99,
  });

  @override
  State<AppInteractiveSurface> createState() => _AppInteractiveSurfaceState();
}

class _AppInteractiveSurfaceState extends State<AppInteractiveSurface> {
  bool _isHovered = false;
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final isEnabled = widget.onTap != null;
    final radius = widget.borderRadius.resolve(Directionality.of(context));
    final translateY = !isEnabled
        ? 0.0
        : _isPressed
        ? 1.0
        : _isHovered
        ? -widget.hoverOffset
        : 0.0;
    final scale = !isEnabled
        ? 1.0
        : _isPressed
        ? widget.pressedScale
        : _isHovered
        ? widget.hoverScale
        : 1.0;

    return MouseRegion(
      cursor: isEnabled ? SystemMouseCursors.click : MouseCursor.defer,
      onEnter: isEnabled
          ? (_) => setState(() {
              _isHovered = true;
            })
          : null,
      onExit: isEnabled
          ? (_) => setState(() {
              _isHovered = false;
              _isPressed = false;
            })
          : null,
      child: AnimatedContainer(
        duration: AppMotion.fast,
        curve: Curves.easeOut,
        transform: Matrix4.translationValues(0, translateY, 0),
        child: AnimatedScale(
          duration: AppMotion.fast,
          curve: Curves.easeOut,
          scale: scale,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: widget.onTap,
              onHighlightChanged: isEnabled
                  ? (value) => setState(() {
                      _isPressed = value;
                    })
                  : null,
              borderRadius: radius,
              splashColor: AppTheme.primaryOrange.withValues(alpha: 0.08),
              hoverColor: Colors.transparent,
              highlightColor: Colors.transparent,
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}

class AppBackdrop extends StatelessWidget {
  final Widget child;

  const AppBackdrop({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final gridPainter = AppTheme.isDark
        ? _BackdropGridPainter(
            verticalColor: AppTheme.lineOverlayColor.withValues(alpha: 0.18),
            horizontalColor: AppTheme.lineOverlayColor.withValues(alpha: 0.12),
          )
        : null;

    return DecoratedBox(
      decoration: BoxDecoration(gradient: AppTheme.shellGradient),
      child: Stack(
        children: [
          if (gridPainter != null)
            Positioned.fill(
              child: IgnorePointer(child: CustomPaint(painter: gridPainter)),
            ),
          if (!AppTheme.isDark)
            Positioned(
              top: -132,
              left: -48,
              right: -48,
              child: IgnorePointer(
                child: Container(
                  height: 300,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        const Color(0xFFFFD8E5).withValues(alpha: 0.76),
                        const Color(0xFFE9DDFF).withValues(alpha: 0.84),
                        const Color(0xFFDFF1FF).withValues(alpha: 0.62),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Positioned(
            top: -88,
            left: -40,
            child: IgnorePointer(
              child: _GlowBlob(
                size: 180,
                color: AppTheme.backdropPrimaryGlow,
                opacity: AppTheme.isDark ? 0.12 : 0.28,
              ),
            ),
          ),
          Positioned(
            top: 72,
            right: -56,
            child: IgnorePointer(
              child: _GlowBlob(
                size: 140,
                color: AppTheme.backdropSecondaryGlow,
                opacity: AppTheme.isDark ? 0.08 : 0.18,
              ),
            ),
          ),
          Positioned(
            bottom: -88,
            right: -32,
            child: IgnorePointer(
              child: _GlowBlob(
                size: 200,
                color: AppTheme.backdropTertiaryGlow,
                opacity: AppTheme.isDark ? 0.06 : 0.16,
              ),
            ),
          ),
          if (!AppTheme.isDark)
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.white.withValues(alpha: 0.18),
                        Colors.white.withValues(alpha: 0.02),
                        Colors.white.withValues(alpha: 0.12),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Positioned.fill(child: child),
        ],
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  final double size;
  final Color color;
  final double opacity;

  const _GlowBlob({
    required this.size,
    required this.color,
    required this.opacity,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            color.withValues(alpha: opacity),
            color.withValues(alpha: opacity * 0.45),
            Colors.transparent,
          ],
          stops: const [0, 0.42, 1],
        ),
      ),
    );
  }
}

class _BackdropGridPainter extends CustomPainter {
  final Color verticalColor;
  final Color horizontalColor;

  const _BackdropGridPainter({
    required this.verticalColor,
    required this.horizontalColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final verticalPaint = Paint()
      ..color = verticalColor
      ..strokeWidth = 1;
    final horizontalPaint = Paint()
      ..color = horizontalColor
      ..strokeWidth = 1;

    for (double x = 0; x <= size.width; x += AppSpace.xxxl) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), verticalPaint);
    }

    for (double y = 0; y <= size.height; y += AppSpace.xxxl) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), horizontalPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _BackdropGridPainter oldDelegate) {
    return oldDelegate.verticalColor != verticalColor ||
        oldDelegate.horizontalColor != horizontalColor;
  }
}

class GlassPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadiusGeometry borderRadius;
  final Gradient? gradient;
  final Color? glowColor;
  final double blur;
  final double shadowStrength;

  const GlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.margin,
    this.borderRadius = const BorderRadius.all(Radius.circular(AppRadius.card)),
    this.gradient,
    this.glowColor,
    this.blur = 0,
    this.shadowStrength = 0.9,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius.resolve(Directionality.of(context));
    final surface = Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: gradient ?? AppTheme.glassGradient,
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(
            alpha: AppTheme.isDark ? 0.92 : 0.76,
          ),
        ),
      ),
      child: Stack(
        children: [
          if (glowColor != null)
            Positioned(
              top: -48,
              right: -36,
              child: IgnorePointer(
                child: _GlowBlob(
                  size: 144,
                  color: glowColor!,
                  opacity: AppTheme.isDark ? 0.08 : 0.12,
                ),
              ),
            ),
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: radius,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(
                        alpha: AppTheme.isDark ? 0.05 : 0.24,
                      ),
                      Colors.white.withValues(
                        alpha: AppTheme.isDark ? 0 : 0.04,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );

    final clipped = ClipRRect(
      borderRadius: radius,
      child: blur > 0
          ? BackdropFilter(
              filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
              child: surface,
            )
          : surface,
    );

    final panel = Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: AppTheme.glowShadowColor.withValues(
              alpha: AppTheme.isDark
                  ? 0.28 * shadowStrength
                  : 0.12 * shadowStrength,
            ),
            blurRadius: AppTheme.isDark ? 24 : 28,
            offset: const Offset(0, 14),
          ),
          BoxShadow(
            color: AppTheme.softShadowColor.withValues(
              alpha: AppTheme.isDark
                  ? 0.44 * shadowStrength
                  : 0.18 * shadowStrength,
            ),
            blurRadius: AppTheme.isDark ? 8 : 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: clipped,
    );

    if (margin == null) {
      return panel;
    }

    return Padding(padding: margin!, child: panel);
  }
}

class HeroGlassPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const HeroGlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.xl),
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: padding,
      blur: AppTheme.isDark ? 6 : 0,
      shadowStrength: AppTheme.isDark ? 0.72 : 1.08,
      borderRadius: const BorderRadius.all(Radius.circular(30)),
      gradient: AppTheme.heroGradient(alpha: 0.98),
      glowColor: AppTheme.primaryOrange,
      child: child,
    );
  }
}

class AppResponsiveSplit extends StatelessWidget {
  final Widget primary;
  final Widget secondary;
  final int primaryFlex;
  final int secondaryFlex;
  final double spacing;
  final double minPrimaryWidth;
  final double minSecondaryWidth;
  final bool reverseOnNarrow;
  final CrossAxisAlignment rowCrossAxisAlignment;
  final CrossAxisAlignment columnCrossAxisAlignment;

  const AppResponsiveSplit({
    super.key,
    required this.primary,
    required this.secondary,
    this.primaryFlex = 1,
    this.secondaryFlex = 1,
    this.spacing = AppSpace.md,
    this.minPrimaryWidth = 320,
    this.minSecondaryWidth = 280,
    this.reverseOnNarrow = false,
    this.rowCrossAxisAlignment = CrossAxisAlignment.start,
    this.columnCrossAxisAlignment = CrossAxisAlignment.stretch,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final totalFlex = primaryFlex + secondaryFlex;
        final rowWidth = constraints.maxWidth - spacing;
        final primaryWidth = rowWidth * (primaryFlex / totalFlex);
        final secondaryWidth = rowWidth * (secondaryFlex / totalFlex);
        final canSplit =
            constraints.maxWidth.isFinite &&
            rowWidth > 0 &&
            primaryWidth >= minPrimaryWidth &&
            secondaryWidth >= minSecondaryWidth;

        if (!canSplit) {
          final children = reverseOnNarrow
              ? <Widget>[secondary, primary]
              : <Widget>[primary, secondary];

          return Column(
            crossAxisAlignment: columnCrossAxisAlignment,
            children: [
              children.first,
              SizedBox(height: spacing),
              children.last,
            ],
          );
        }

        return Row(
          crossAxisAlignment: rowCrossAxisAlignment,
          children: [
            Expanded(flex: primaryFlex, child: primary),
            SizedBox(width: spacing),
            Expanded(flex: secondaryFlex, child: secondary),
          ],
        );
      },
    );
  }
}

class AppThemeToggle extends StatelessWidget {
  final bool showLabel;

  const AppThemeToggle({super.key, this.showLabel = true});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>();
    final isDark = theme.isDark;
    final width = showLabel ? 160.0 : 88.0;
    final thumbWidth = showLabel ? 90.0 : 36.0;

    return Tooltip(
      message: isDark ? 'Switch to light mode' : 'Switch to dark mode',
      child: AppInteractiveSurface(
        onTap: () {
          context.read<ThemeProvider>().toggle();
        },
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        child: AnimatedContainer(
          duration: AppMotion.normal,
          curve: Curves.easeOut,
          width: width,
          height: 48,
          padding: const EdgeInsets.all(AppSpace.xs),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: AppTheme.surface,
            border: Border.all(color: AppTheme.subtleBorder),
          ),
          child: Stack(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Center(
                      child: Icon(
                        Icons.dark_mode_rounded,
                        size: 16,
                        color: isDark
                            ? AppTheme.primaryText
                            : AppTheme.secondaryText,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: Icon(
                        Icons.light_mode_rounded,
                        size: 16,
                        color: isDark
                            ? AppTheme.secondaryText
                            : AppTheme.primaryText,
                      ),
                    ),
                  ),
                ],
              ),
              AnimatedAlign(
                duration: AppMotion.normal,
                curve: Curves.easeOut,
                alignment: isDark
                    ? Alignment.centerLeft
                    : Alignment.centerRight,
                child: Container(
                  width: thumbWidth,
                  height: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    gradient: LinearGradient(
                      colors: isDark
                          ? [AppTheme.primaryOrange, AppTheme.primaryTurquoise]
                          : [AppTheme.primaryTurquoise, AppTheme.primaryOrange],
                    ),
                  ),
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: AppMotion.normal,
                      child: FittedBox(
                        key: ValueKey(isDark),
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              isDark
                                  ? Icons.dark_mode_rounded
                                  : Icons.light_mode_rounded,
                              size: 14,
                              color: Colors.white,
                            ),
                            if (showLabel) ...[
                              const SizedBox(width: AppSpace.xs),
                              Text(
                                isDark ? 'Dark' : 'Light',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
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

class AppIconOrb extends StatelessWidget {
  final IconData icon;
  final Color accent;
  final double size;

  const AppIconOrb({
    super.key,
    required this.icon,
    required this.accent,
    this.size = 44,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.38),
        color: accent.withValues(alpha: AppTheme.isDark ? 0.16 : 0.12),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Icon(icon, color: accent, size: size * 0.44),
    );
  }
}

class AppHeroBanner extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color accent;
  final Widget? trailing;
  final List<Widget> stats;
  final List<Widget> actions;
  final EdgeInsetsGeometry padding;

  const AppHeroBanner({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.accent = AppTheme.primaryOrange,
    this.trailing,
    this.stats = const [],
    this.actions = const [],
    this.padding = const EdgeInsets.all(AppSpace.lg),
  });

  @override
  Widget build(BuildContext context) {
    return HeroGlassPanel(
      padding: padding,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stackTitle = constraints.maxWidth < 520;
          final showTrailingInline =
              trailing != null && constraints.maxWidth >= 920;
          final header = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GlowBadge(label: eyebrow, color: accent),
              const SizedBox(height: AppSpace.md),
              stackTitle
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppIconOrb(icon: icon, accent: accent, size: 52),
                        const SizedBox(height: AppSpace.md),
                        Text(
                          title,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: AppSpace.sm),
                        Text(
                          subtitle,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: AppTheme.secondaryText,
                                height: 1.6,
                              ),
                        ),
                      ],
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppIconOrb(icon: icon, accent: accent, size: 52),
                        const SizedBox(width: AppSpace.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: Theme.of(
                                  context,
                                ).textTheme.headlineSmall,
                              ),
                              const SizedBox(height: AppSpace.sm),
                              Text(
                                subtitle,
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(
                                      color: AppTheme.secondaryText,
                                      height: 1.6,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
            ],
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (trailing == null)
                header
              else if (showTrailingInline)
                AppResponsiveSplit(
                  primary: header,
                  secondary: Align(
                    alignment: Alignment.topRight,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 280),
                      child: SizedBox(width: double.infinity, child: trailing!),
                    ),
                  ),
                  spacing: AppSpace.lg,
                  primaryFlex: 11,
                  secondaryFlex: 7,
                  minPrimaryWidth: 360,
                  minSecondaryWidth: 240,
                  columnCrossAxisAlignment: CrossAxisAlignment.start,
                )
              else ...[
                header,
                const SizedBox(height: AppSpace.lg),
                trailing!,
              ],
              if (stats.isNotEmpty) ...[
                const SizedBox(height: AppSpace.md),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: stats,
                ),
              ],
              if (actions.isNotEmpty) ...[
                const SizedBox(height: AppSpace.md),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: actions,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class AppMetricTile extends StatelessWidget {
  final String label;
  final String value;
  final String? caption;
  final Color accent;
  final IconData? icon;
  final double minWidth;

  const AppMetricTile({
    super.key,
    required this.label,
    required this.value,
    this.caption,
    this.accent = AppTheme.primaryTurquoise,
    this.icon,
    this.minWidth = 140,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(minWidth: minWidth),
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppTheme.elevatedSurface.withValues(
          alpha: AppTheme.isDark ? 0.88 : 0.98,
        ),
        borderRadius: BorderRadius.circular(AppRadius.large + 4),
        border: Border.all(
          color: accent.withValues(alpha: AppTheme.isDark ? 0.2 : 0.12),
        ),
        boxShadow: AppTheme.isDark
            ? null
            : [
                BoxShadow(
                  color: AppTheme.softShadowColor.withValues(alpha: 0.08),
                  blurRadius: 16,
                  offset: const Offset(0, 10),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: accent),
                const SizedBox(width: AppSpace.xs),
              ],
              Flexible(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
          if (caption != null) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              caption!,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class GlowBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const GlowBadge({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.elevatedSurface.withValues(
          alpha: AppTheme.isDark ? 0.9 : 0.98,
        ),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
        boxShadow: AppTheme.isDark
            ? null
            : [
                BoxShadow(
                  color: color.withValues(alpha: 0.08),
                  blurRadius: 14,
                  offset: const Offset(0, 8),
                ),
              ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: AppSpace.xs),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class StatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;
  final IconData? icon;

  const StatChip({
    super.key,
    required this.label,
    required this.value,
    this.accent = AppTheme.primaryTurquoise,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 120),
      padding: const EdgeInsets.all(AppSpace.sm),
      decoration: BoxDecoration(
        color: AppTheme.elevatedSurface.withValues(
          alpha: AppTheme.isDark ? 0.92 : 0.98,
        ),
        borderRadius: BorderRadius.circular(AppRadius.large + 2),
        border: Border.all(color: accent.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: accent),
                const SizedBox(width: AppSpace.xs),
              ],
              Flexible(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class AppReveal extends StatefulWidget {
  final Widget child;
  final Duration delay;

  const AppReveal({super.key, required this.child, this.delay = Duration.zero});

  @override
  State<AppReveal> createState() => _AppRevealState();
}

class _AppRevealState extends State<AppReveal> {
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.delay, () {
      if (!mounted) {
        return;
      }
      setState(() {
        _visible = true;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      duration: AppMotion.slow,
      curve: Curves.easeOut,
      offset: _visible ? Offset.zero : const Offset(0, 0.04),
      child: AnimatedOpacity(
        duration: AppMotion.normal,
        curve: Curves.easeOut,
        opacity: _visible ? 1 : 0,
        child: widget.child,
      ),
    );
  }
}

class AppSectionTitle extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const AppSectionTitle({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: AppSpace.xs),
          Text(
            subtitle!,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppTheme.secondaryText,
              height: 1.55,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );

    if (trailing == null) {
      return copy;
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final shouldStack = constraints.maxWidth < 560;
        if (shouldStack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              copy,
              const SizedBox(height: AppSpace.sm),
              trailing!,
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: AppSpace.md),
            Flexible(child: trailing!),
          ],
        );
      },
    );
  }
}

class EmptyGlassState extends StatelessWidget {
  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  const EmptyGlassState({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.hourglass_empty_rounded,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: const EdgeInsets.all(AppSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          AppIconOrb(icon: icon, accent: AppTheme.primaryOrange),
          const SizedBox(height: AppSpace.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
          ),
          if (action != null) ...[
            const SizedBox(height: AppSpace.lg),
            Align(alignment: Alignment.center, child: action!),
          ],
        ],
      ),
    );
  }
}

class AppDataRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasize;
  final Color? valueColor;
  final EdgeInsetsGeometry padding;

  const AppDataRow({
    super.key,
    required this.label,
    required this.value,
    this.emphasize = false,
    this.valueColor,
    this.padding = const EdgeInsets.only(bottom: AppSpace.sm),
  });

  @override
  Widget build(BuildContext context) {
    final valueStyle = emphasize
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyMedium;

    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: valueStyle?.copyWith(
                color: valueColor ?? AppTheme.primaryText,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AppSelectionField extends StatelessWidget {
  final String label;
  final String value;
  final String? hint;
  final String? helper;
  final IconData icon;
  final VoidCallback? onTap;

  const AppSelectionField({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.hint,
    this.helper,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasValue = value.trim().isNotEmpty;
    final content = Container(
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppTheme.elevatedSurface,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppTheme.subtleBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppTheme.secondaryText),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (onTap != null)
                Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: AppTheme.secondaryText,
                ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            hasValue ? value : (hint ?? 'Not selected'),
            style:
                (hasValue
                        ? Theme.of(context).textTheme.titleMedium
                        : Theme.of(context).textTheme.bodyMedium)
                    ?.copyWith(
                      color: hasValue
                          ? AppTheme.primaryText
                          : AppTheme.disabledText,
                      fontWeight: hasValue ? FontWeight.w600 : FontWeight.w400,
                    ),
          ),
          if (helper != null) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              helper!,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
        ],
      ),
    );

    if (onTap == null) {
      return content;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: content,
      ),
    );
  }
}
