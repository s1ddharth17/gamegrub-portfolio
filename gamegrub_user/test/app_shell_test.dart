import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:gamegrub_user/models/business.dart';
import 'package:gamegrub_user/providers/auth_provider.dart';
import 'package:gamegrub_user/providers/business_provider.dart';
import 'package:gamegrub_user/screens/shell/app_shell.dart';
import 'package:gamegrub_user/theme/app_theme.dart';

void main() {
  setUp(() {
    AppTheme.syncMode(ThemeMode.light);
  });

  tearDown(() {
    AppTheme.syncMode(ThemeMode.system);
  });

  testWidgets('mobile shell does not extend the page behind the bottom nav', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final businessProvider = _FakeBusinessProvider([
      _buildBusiness(
        id: 1,
        name: 'Respawn Arena',
        tagline: 'Valorant nights and loaded snack counters',
        city: 'Pune',
        state: 'Maharashtra',
        addressLine1: 'Somnath Nagar',
      ),
    ]);
    addTearDown(businessProvider.dispose);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>(create: (_) => AuthProvider()),
          ChangeNotifierProvider<BusinessProvider>.value(
            value: businessProvider,
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: ThemeMode.light,
          home: const AppShellScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle(const Duration(seconds: 1));

    final shellScaffold = tester
        .widgetList<Scaffold>(find.byType(Scaffold))
        .firstWhere((scaffold) => scaffold.bottomNavigationBar != null);

    expect(shellScaffold.extendBody, isFalse);
  });
}

class _FakeBusinessProvider extends BusinessProvider {
  _FakeBusinessProvider(List<Business> initialBusinesses) {
    businesses = initialBusinesses;
    selectedBusiness = initialBusinesses.isEmpty
        ? null
        : initialBusinesses.first;
    isLoading = false;
    errorMessage = null;
  }

  @override
  Future<void> loadBusinesses({bool forceRefresh = false}) async {}

  @override
  Future<void> selectBusiness(Business business) async {
    selectedBusiness = business;
    notifyListeners();
  }
}

Business _buildBusiness({
  required int id,
  required String name,
  required String tagline,
  required String city,
  required String state,
  required String addressLine1,
}) {
  return Business(
    id: id,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    name: name,
    tagline: tagline,
    description: tagline,
    city: city,
    state: state,
    addressLine1: addressLine1,
    phone: '',
    contactEmail: '',
    opensAt: '10:00:00',
    closesAt: '23:30:00',
    logoImage: '',
    coverImage: '',
    isFeatured: false,
    commissionRate: 0,
    convenienceFeeFlat: 0,
    convenienceFeeRate: 0,
    averageRating: 0,
    reviewCount: 0,
    totalRigs: 8,
    activeRigs: 8,
    availableRigs: 4,
    menuItemCount: 4,
    featuredMenuItemCount: 1,
    publishedTournamentCount: 0,
  );
}
