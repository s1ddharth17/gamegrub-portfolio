import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_core/firebase_core.dart';

import 'providers/auth_provider.dart';
import 'providers/business_provider.dart';
import 'providers/bill_provider.dart';
import 'providers/booking_provider.dart';
import 'providers/game_guru_provider.dart';
import 'providers/order_provider.dart';
import 'providers/notification_provider.dart';
import 'providers/pc_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/tournament_provider.dart';
import 'screens/auth/login_screen.dart';
import 'config/firebase_push_options.dart';
import 'screens/shell/app_shell.dart';
import 'theme/app_theme.dart';
import 'utils/notification_navigation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final firebaseOptions = FirebasePushOptions.current;
  if (firebaseOptions != null) {
    try {
      await Firebase.initializeApp(options: firebaseOptions);
    } catch (_) {
      // The app remains usable when optional push configuration is unavailable.
    }
  }

  final authProvider = AuthProvider();
  final themeProvider = ThemeProvider();

  runApp(MyApp(authProvider: authProvider, themeProvider: themeProvider));
}

class MyApp extends StatefulWidget {
  final AuthProvider authProvider;
  final ThemeProvider themeProvider;

  const MyApp({
    super.key,
    required this.authProvider,
    required this.themeProvider,
  });

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  late final Future<void> _bootstrapFuture;

  @override
  void initState() {
    super.initState();
    _bootstrapFuture = Future.wait([
      widget.authProvider.restoreSession(),
      widget.themeProvider.restore(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: widget.authProvider),
        ChangeNotifierProvider<ThemeProvider>.value(
          value: widget.themeProvider,
        ),
        ChangeNotifierProvider(create: (_) => BusinessProvider()),
        ChangeNotifierProvider(create: (_) => GameGuruProvider()),
        ChangeNotifierProvider(create: (_) => PcProvider()),
        ChangeNotifierProvider(create: (_) => BookingProvider()),
        ChangeNotifierProvider(create: (_) => OrderProvider()),
        ChangeNotifierProvider(create: (_) => BillProvider()),
        ChangeNotifierProvider(create: (_) => TournamentProvider()),
        ChangeNotifierProvider(
          create: (_) => NotificationProvider(),
          lazy: false,
        ),
      ],
      child: Consumer2<AuthProvider, ThemeProvider>(
        builder: (context, auth, theme, _) {
          context.read<NotificationProvider>().bindAuthToken(auth.token);
          return FutureBuilder<void>(
            future: _bootstrapFuture,
            builder: (context, snapshot) {
              return MaterialApp(
                navigatorKey: rootNavigatorKey,
                scaffoldMessengerKey: rootScaffoldMessengerKey,
                debugShowCheckedModeBanner: false,
                theme: AppTheme.light(),
                darkTheme: AppTheme.dark(),
                themeMode: theme.mode,
                themeAnimationCurve: Curves.easeInOut,
                themeAnimationDuration: AppMotion.normal,
                home: snapshot.connectionState == ConnectionState.done
                    ? _loggedInHome(auth.isLoggedIn)
                    : const _BootstrapScreen(),
              );
            },
          );
        },
      ),
    );
  }

  bool _launchDeepLinkHandled = false;

  Widget _loggedInHome(bool isLoggedIn) {
    if (isLoggedIn && !_launchDeepLinkHandled) {
      _launchDeepLinkHandled = true;
      final deepLink = Uri.base.queryParameters['deep_link'];
      if (deepLink != null && deepLink.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          NotificationNavigation.open(deepLink);
        });
      }
    }
    return isLoggedIn ? const AppShellScreen() : const LoginScreen();
  }
}

class _BootstrapScreen extends StatelessWidget {
  const _BootstrapScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(gradient: AppTheme.shellGradient),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
              const SizedBox(height: 16),
              Text(
                'Loading GameGrub...',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
