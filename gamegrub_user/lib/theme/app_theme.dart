import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppSpace {
  static const double xs2 = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
  static const double xxxl = 64;
}

class AppRadius {
  static const double small = 8;
  static const double medium = 12;
  static const double large = 16;
  static const double card = 18;
}

class AppMotion {
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 200);
  static const Duration slow = Duration(milliseconds: 300);
}

class AppTheme {
  static const Color primaryOrange = Color(0xFFFF3D57);
  static const Color hoverOrange = Color(0xFFFF5C72);
  static const Color darkOrange = Color(0xFFE0314A);
  static const Color primaryTurquoise = Color(0xFF7C5CFF);
  static const Color lightTurquoise = Color(0xFF9684FF);
  static const Color darkTurquoise = Color(0xFF6A4FF0);
  static const Color success = Color(0xFF00C853);
  static const Color warning = Color(0xFFFFAB00);
  static const Color danger = Color(0xFFFF5252);

  static final _ThemePalette _darkPalette = _ThemePalette(
    background: const Color(0xFF151022),
    backgroundDeep: const Color(0xFF100B1A),
    surface: const Color(0xFF1E1730),
    elevatedSurface: const Color(0xFF271E3D),
    raisedSurface: const Color(0xFF30254A),
    primaryText: const Color(0xFFF8F6FF),
    secondaryText: const Color(0xFFC8C1DD),
    disabledText: const Color(0xFF948DAE),
    subtleBorder: const Color(0xFF3B2F58),
    shellGradient: const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF140E21), Color(0xFF1B1430), Color(0xFF22183A)],
      stops: [0, 0.56, 1],
    ),
    glassGradient: const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF211933), Color(0xFF261D3B), Color(0xFF2C2242)],
      stops: [0, 0.56, 1],
    ),
    heroBase: const [Color(0xFF201534), Color(0xFF291B41), Color(0xFF311F49)],
    glowShadowColor: const Color(0x30080514),
    softShadowColor: const Color(0x18080514),
    lineOverlayColor: const Color(0x14FFFFFF),
    backdropPrimaryGlow: const Color(0xFFFF7EA2),
    backdropSecondaryGlow: const Color(0xFFBCB1FF),
    backdropTertiaryGlow: const Color(0xFFB6D8FF),
    onPrimary: const Color(0xFFFFFFFF),
    onSecondary: const Color(0xFFFFFFFF),
  );

  static final _ThemePalette _lightPalette = _ThemePalette(
    background: const Color(0xFFF8F5FB),
    backgroundDeep: const Color(0xFFF1ECF7),
    surface: const Color(0xFFFFFFFF),
    elevatedSurface: const Color(0xFFFEFCFF),
    raisedSurface: const Color(0xFFF7F1FB),
    primaryText: const Color(0xFF231F35),
    secondaryText: const Color(0xFF79748C),
    disabledText: const Color(0xFFA9A4B9),
    subtleBorder: const Color(0xFFEDE2F4),
    shellGradient: const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFFDF7FF), Color(0xFFF7F1FF), Color(0xFFF5F8FF)],
      stops: [0, 0.54, 1],
    ),
    glassGradient: const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFFFFFFF), Color(0xFFFCF9FF), Color(0xFFF8F3FD)],
      stops: [0, 0.5, 1],
    ),
    heroBase: const [Color(0xFFFFFFFF), Color(0xFFFDF7FF), Color(0xFFF9F2FF)],
    glowShadowColor: const Color(0x160F172A),
    softShadowColor: const Color(0x120F172A),
    lineOverlayColor: const Color(0x0B6D6786),
    backdropPrimaryGlow: const Color(0xFFFFDDE7),
    backdropSecondaryGlow: const Color(0xFFE9DFFF),
    backdropTertiaryGlow: const Color(0xFFE5F1FF),
    onPrimary: const Color(0xFFFFFFFF),
    onSecondary: const Color(0xFFFFFFFF),
  );

  static _ThemePalette _activePalette = _lightPalette;

  static void syncMode(ThemeMode mode) {
    _activePalette = mode == ThemeMode.light ? _lightPalette : _darkPalette;
  }

  static bool get isDark => identical(_activePalette, _darkPalette);

  static Color get background => _activePalette.background;
  static Color get backgroundDeep => _activePalette.backgroundDeep;
  static Color get surface => _activePalette.surface;
  static Color get elevatedSurface => _activePalette.elevatedSurface;
  static Color get raisedSurface => _activePalette.raisedSurface;
  static Color get primaryText => _activePalette.primaryText;
  static Color get secondaryText => _activePalette.secondaryText;
  static Color get disabledText => _activePalette.disabledText;
  static Color get subtleBorder => _activePalette.subtleBorder;
  static LinearGradient get shellGradient => _activePalette.shellGradient;
  static LinearGradient get glassGradient => _activePalette.glassGradient;
  static Color get glowShadowColor => _activePalette.glowShadowColor;
  static Color get softShadowColor => _activePalette.softShadowColor;
  static Color get lineOverlayColor => _activePalette.lineOverlayColor;
  static Color get backdropPrimaryGlow => _activePalette.backdropPrimaryGlow;
  static Color get backdropSecondaryGlow =>
      _activePalette.backdropSecondaryGlow;
  static Color get backdropTertiaryGlow => _activePalette.backdropTertiaryGlow;
  static Color get onPrimary => _activePalette.onPrimary;
  static Color get onSecondary => _activePalette.onSecondary;

  static LinearGradient heroGradient({double alpha = 1}) {
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        _activePalette.heroBase[0].withValues(alpha: alpha),
        primaryOrange.withValues(alpha: (isDark ? 0.18 : 0.12) * alpha),
        _activePalette.heroBase[1].withValues(alpha: alpha),
        primaryTurquoise.withValues(alpha: (isDark ? 0.16 : 0.09) * alpha),
        _activePalette.heroBase[2].withValues(alpha: alpha),
      ],
      stops: const [0, 0.22, 0.56, 0.82, 1],
    );
  }

  static ThemeData dark() => _buildTheme(_darkPalette, Brightness.dark);

  static ThemeData light() => _buildTheme(_lightPalette, Brightness.light);

  static ThemeData _buildTheme(_ThemePalette palette, Brightness brightness) {
    final isDarkTheme = brightness == Brightness.dark;
    final baseTextTheme = GoogleFonts.plusJakartaSansTextTheme(
      const TextTheme(
        displayLarge: TextStyle(
          fontSize: 46,
          fontWeight: FontWeight.w800,
          height: 1.05,
          letterSpacing: -1.6,
        ),
        headlineSmall: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w800,
          height: 1.08,
          letterSpacing: -1.2,
        ),
        titleLarge: TextStyle(
          fontSize: 23,
          fontWeight: FontWeight.w700,
          height: 1.18,
          letterSpacing: -0.55,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          height: 1.25,
          letterSpacing: -0.3,
        ),
        titleSmall: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          height: 1.3,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          height: 1.5,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          height: 1.5,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          height: 1.45,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          height: 1.1,
        ),
      ),
    ).apply(bodyColor: palette.primaryText, displayColor: palette.primaryText);

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: primaryOrange,
      onPrimary: palette.onPrimary,
      secondary: primaryTurquoise,
      onSecondary: palette.onSecondary,
      error: danger,
      onError: Colors.white,
      surface: palette.surface,
      onSurface: palette.primaryText,
      outline: palette.subtleBorder,
      outlineVariant: palette.subtleBorder,
      shadow: palette.glowShadowColor,
      scrim: Colors.black.withValues(alpha: isDarkTheme ? 0.62 : 0.28),
      inverseSurface: isDarkTheme ? Colors.white : const Color(0xFF111827),
      onInverseSurface: isDarkTheme
          ? const Color(0xFF111827)
          : const Color(0xFFFFFFFF),
      tertiary: success,
      onTertiary: Colors.white,
    );

    final inputShape = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.medium),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      fontFamily: GoogleFonts.plusJakartaSans().fontFamily,
      scaffoldBackgroundColor: palette.background,
      canvasColor: palette.background,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      textTheme: baseTextTheme,
      dividerColor: palette.subtleBorder,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: palette.primaryText,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        titleTextStyle: baseTextTheme.titleLarge,
        iconTheme: IconThemeData(color: palette.primaryText),
      ),
      cardTheme: CardThemeData(
        color: palette.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shadowColor: palette.softShadowColor,
        surfaceTintColor: Colors.transparent,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: palette.subtleBorder),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: palette.subtleBorder),
        ),
        titleTextStyle: baseTextTheme.titleLarge,
        contentTextStyle: baseTextTheme.bodyMedium,
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: palette.subtleBorder),
        ),
        headerForegroundColor: palette.primaryText,
        headerHeadlineStyle: baseTextTheme.headlineSmall,
        headerHelpStyle: baseTextTheme.bodySmall?.copyWith(
          color: palette.secondaryText,
        ),
        weekdayStyle: baseTextTheme.bodySmall?.copyWith(
          color: palette.secondaryText,
        ),
        dayStyle: baseTextTheme.bodyMedium,
        todayForegroundColor: WidgetStatePropertyAll(palette.primaryText),
        todayBackgroundColor: WidgetStatePropertyAll(
          primaryOrange.withValues(alpha: isDarkTheme ? 0.14 : 0.08),
        ),
        dayForegroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return palette.disabledText;
          }
          if (states.contains(WidgetState.selected)) {
            return palette.onPrimary;
          }
          return palette.primaryText;
        }),
        dayBackgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return primaryOrange;
          }
          if (states.contains(WidgetState.hovered)) {
            return primaryOrange.withValues(alpha: isDarkTheme ? 0.14 : 0.08);
          }
          return Colors.transparent;
        }),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.elevatedSurface,
        prefixIconColor: palette.secondaryText,
        suffixIconColor: palette.secondaryText,
        hintStyle: baseTextTheme.bodyMedium?.copyWith(
          color: palette.disabledText,
        ),
        labelStyle: baseTextTheme.bodyMedium?.copyWith(
          color: palette.secondaryText,
          fontWeight: FontWeight.w500,
        ),
        helperStyle: baseTextTheme.bodySmall?.copyWith(
          color: palette.secondaryText,
        ),
        helperMaxLines: 3,
        errorMaxLines: 4,
        floatingLabelStyle: baseTextTheme.bodySmall?.copyWith(
          color: primaryOrange,
          fontWeight: FontWeight.w600,
        ),
        border: inputShape.copyWith(
          borderSide: BorderSide(color: palette.subtleBorder),
        ),
        enabledBorder: inputShape.copyWith(
          borderSide: BorderSide(color: palette.subtleBorder),
        ),
        focusedBorder: inputShape.copyWith(
          borderSide: const BorderSide(color: primaryOrange, width: 1.2),
        ),
        errorBorder: inputShape.copyWith(
          borderSide: const BorderSide(color: danger, width: 1.2),
        ),
        focusedErrorBorder: inputShape.copyWith(
          borderSide: const BorderSide(color: danger, width: 1.2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpace.md,
          vertical: AppSpace.md,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return primaryOrange.withValues(alpha: 0.5);
            }
            if (states.contains(WidgetState.pressed)) {
              return darkOrange;
            }
            if (states.contains(WidgetState.hovered)) {
              return hoverOrange;
            }
            return primaryOrange;
          }),
          foregroundColor: WidgetStatePropertyAll(palette.onPrimary),
          shadowColor: const WidgetStatePropertyAll(Colors.transparent),
          elevation: const WidgetStatePropertyAll(0),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: AppSpace.sm,
            ),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
          ),
          textStyle: WidgetStatePropertyAll(baseTextTheme.labelLarge),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return primaryTurquoise.withValues(alpha: 0.5);
            }
            if (states.contains(WidgetState.pressed)) {
              return darkTurquoise;
            }
            if (states.contains(WidgetState.hovered)) {
              return lightTurquoise;
            }
            return primaryTurquoise;
          }),
          foregroundColor: WidgetStatePropertyAll(palette.onSecondary),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: AppSpace.sm,
            ),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
          ),
          textStyle: WidgetStatePropertyAll(baseTextTheme.labelLarge),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
          foregroundColor: WidgetStatePropertyAll(palette.primaryText),
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return BorderSide(
                color: palette.subtleBorder.withValues(alpha: 0.5),
              );
            }
            if (states.contains(WidgetState.focused)) {
              return const BorderSide(color: primaryOrange, width: 1.1);
            }
            return BorderSide(color: palette.subtleBorder);
          }),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.hovered)) {
              return palette.raisedSurface;
            }
            return palette.surface;
          }),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: AppSpace.sm,
            ),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
          ),
          textStyle: WidgetStatePropertyAll(baseTextTheme.labelLarge),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primaryOrange,
          textStyle: baseTextTheme.titleSmall,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStatePropertyAll(palette.elevatedSurface),
          foregroundColor: WidgetStatePropertyAll(palette.primaryText),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.medium),
              side: BorderSide(color: palette.subtleBorder),
            ),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: Colors.transparent,
        height: 76,
        elevation: 0,
        indicatorColor: primaryOrange.withValues(
          alpha: isDarkTheme ? 0.16 : 0.1,
        ),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          return IconThemeData(
            color: states.contains(WidgetState.selected)
                ? primaryOrange
                : palette.secondaryText,
          );
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          return baseTextTheme.bodySmall?.copyWith(
            color: states.contains(WidgetState.selected)
                ? palette.primaryText
                : palette.secondaryText,
            fontWeight: FontWeight.w600,
          );
        }),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: palette.elevatedSurface,
        disabledColor: palette.elevatedSurface.withValues(alpha: 0.9),
        selectedColor: primaryOrange.withValues(
          alpha: isDarkTheme ? 0.15 : 0.1,
        ),
        secondarySelectedColor: primaryOrange.withValues(
          alpha: isDarkTheme ? 0.12 : 0.08,
        ),
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        side: BorderSide(color: palette.subtleBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
        labelStyle: baseTextTheme.bodyMedium ?? const TextStyle(),
        secondaryLabelStyle: baseTextTheme.bodyMedium ?? const TextStyle(),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.sm,
          vertical: AppSpace.xs,
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return palette.secondaryText;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return primaryTurquoise;
          }
          return palette.subtleBorder;
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDarkTheme ? const Color(0xFF18181B) : Colors.white,
        contentTextStyle: baseTextTheme.bodyMedium?.copyWith(
          color: palette.primaryText,
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: primaryTurquoise,
        circularTrackColor: palette.subtleBorder,
      ),
      badgeTheme: BadgeThemeData(
        backgroundColor: primaryOrange,
        textColor: palette.onPrimary,
      ),
      listTileTheme: ListTileThemeData(
        tileColor: Colors.transparent,
        iconColor: palette.secondaryText,
        textColor: palette.primaryText,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: palette.subtleBorder,
        thickness: 1,
        space: AppSpace.lg,
      ),
    );
  }
}

class _ThemePalette {
  final Color background;
  final Color backgroundDeep;
  final Color surface;
  final Color elevatedSurface;
  final Color raisedSurface;
  final Color primaryText;
  final Color secondaryText;
  final Color disabledText;
  final Color subtleBorder;
  final LinearGradient shellGradient;
  final LinearGradient glassGradient;
  final List<Color> heroBase;
  final Color glowShadowColor;
  final Color softShadowColor;
  final Color lineOverlayColor;
  final Color backdropPrimaryGlow;
  final Color backdropSecondaryGlow;
  final Color backdropTertiaryGlow;
  final Color onPrimary;
  final Color onSecondary;

  const _ThemePalette({
    required this.background,
    required this.backgroundDeep,
    required this.surface,
    required this.elevatedSurface,
    required this.raisedSurface,
    required this.primaryText,
    required this.secondaryText,
    required this.disabledText,
    required this.subtleBorder,
    required this.shellGradient,
    required this.glassGradient,
    required this.heroBase,
    required this.glowShadowColor,
    required this.softShadowColor,
    required this.lineOverlayColor,
    required this.backdropPrimaryGlow,
    required this.backdropSecondaryGlow,
    required this.backdropTertiaryGlow,
    required this.onPrimary,
    required this.onSecondary,
  });
}
