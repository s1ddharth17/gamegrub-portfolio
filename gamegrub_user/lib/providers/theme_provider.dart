import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';

class ThemeProvider with ChangeNotifier, WidgetsBindingObserver {
  static const _themeModeKey = 'ui_theme_mode';

  ThemeMode _mode = ThemeMode.light;

  ThemeProvider() {
    WidgetsBinding.instance.addObserver(this);
    _syncAppTheme();
  }

  ThemeMode get mode => _mode;
  ThemeMode get effectiveMode => _resolveEffectiveMode();
  bool get isDark => effectiveMode == ThemeMode.dark;
  bool get usesSystemTheme => _mode == ThemeMode.system;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final storedMode = prefs.getString(_themeModeKey);

    if (storedMode == 'light') {
      _mode = ThemeMode.light;
    } else if (storedMode == 'system') {
      _mode = ThemeMode.system;
    } else {
      _mode = ThemeMode.light;
    }

    _syncAppTheme();
    notifyListeners();
  }

  Future<void> toggle() async {
    await setMode(isDark ? ThemeMode.light : ThemeMode.dark);
  }

  Future<void> setMode(ThemeMode nextMode) async {
    if (_mode == nextMode) {
      return;
    }

    _mode = nextMode;
    _syncAppTheme();
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeModeKey, _encodeMode(_mode));
  }

  @override
  void didChangePlatformBrightness() {
    if (!usesSystemTheme) {
      return;
    }

    _syncAppTheme();
    notifyListeners();
  }

  ThemeMode _resolveEffectiveMode() {
    if (_mode != ThemeMode.system) {
      return _mode;
    }

    final brightness =
        WidgetsBinding.instance.platformDispatcher.platformBrightness;
    return brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light;
  }

  void _syncAppTheme() {
    AppTheme.syncMode(effectiveMode);
  }

  String _encodeMode(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.system:
        return 'system';
      case ThemeMode.dark:
        return 'dark';
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
