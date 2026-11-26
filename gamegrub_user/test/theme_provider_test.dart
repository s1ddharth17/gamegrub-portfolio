import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:gamegrub_user/providers/theme_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('restores and follows device theme mode', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({'ui_theme_mode': 'system'});
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

    final themeProvider = ThemeProvider();
    addTearDown(themeProvider.dispose);

    await themeProvider.restore();

    expect(themeProvider.mode, ThemeMode.system);
    expect(themeProvider.isDark, isFalse);

    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    tester.binding.handlePlatformBrightnessChanged();
    await tester.pump();

    expect(themeProvider.isDark, isTrue);
  });

  testWidgets('setMode persists device theme preference', (
    WidgetTester tester,
  ) async {
    final themeProvider = ThemeProvider();
    addTearDown(themeProvider.dispose);

    await themeProvider.setMode(ThemeMode.system);

    final restoredProvider = ThemeProvider();
    addTearDown(restoredProvider.dispose);

    await restoredProvider.restore();

    expect(restoredProvider.mode, ThemeMode.system);
  });
}
