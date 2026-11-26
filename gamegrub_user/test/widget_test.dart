import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:gamegrub_user/providers/auth_provider.dart';
import 'package:gamegrub_user/providers/theme_provider.dart';
import 'package:gamegrub_user/screens/auth/login_screen.dart';
import 'package:gamegrub_user/theme/app_theme.dart';
import 'package:gamegrub_user/widgets/app_chrome.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('login screen smoke test', (WidgetTester tester) async {
    final themeProvider = ThemeProvider();
    addTearDown(themeProvider.dispose);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>(create: (_) => AuthProvider()),
          ChangeNotifierProvider<ThemeProvider>.value(value: themeProvider),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: themeProvider.mode,
          home: const LoginScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('GameGrub'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsWidgets);
    expect(find.widgetWithText(ElevatedButton, 'Sign in'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
  });

  testWidgets('theme toggle switches between dark and light modes', (
    WidgetTester tester,
  ) async {
    final themeProvider = ThemeProvider();
    addTearDown(themeProvider.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider<ThemeProvider>.value(
        value: themeProvider,
        child: MaterialApp(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: themeProvider.mode,
          home: const Scaffold(body: Center(child: AppThemeToggle())),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(themeProvider.mode, ThemeMode.light);

    await tester.tap(find.text('Light'));
    await tester.pumpAndSettle();

    expect(themeProvider.mode, ThemeMode.dark);
    expect(find.text('Dark'), findsOneWidget);
  });
}
