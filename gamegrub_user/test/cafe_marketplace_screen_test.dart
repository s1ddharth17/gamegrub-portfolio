import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:gamegrub_user/models/business.dart';
import 'package:gamegrub_user/providers/auth_provider.dart';
import 'package:gamegrub_user/providers/business_provider.dart';
import 'package:gamegrub_user/screens/home/cafe_marketplace_screen.dart';
import 'package:gamegrub_user/theme/app_theme.dart';

void main() {
  setUp(() {
    AppTheme.syncMode(ThemeMode.light);
  });

  tearDown(() {
    AppTheme.syncMode(ThemeMode.system);
  });

  testWidgets('cafe marketplace renders the gamer-style home feed', (
    WidgetTester tester,
  ) async {
    final businessProvider = _FakeBusinessProvider([
      _buildBusiness(
        id: 1,
        name: 'Respawn Arena',
        tagline: 'Valorant nights and loaded snack counters',
        city: 'Pune',
        state: 'Maharashtra',
        addressLine1: 'Somnath Nagar',
        isFeatured: true,
        averageRating: 4.6,
        reviewCount: 1480,
        totalRigs: 24,
        availableRigs: 11,
        menuItemCount: 18,
        publishedTournamentCount: 3,
      ),
      _buildBusiness(
        id: 2,
        name: 'Checkpoint Cafe',
        tagline: 'Console setups, casual squads, and quick bites',
        city: 'Pune',
        state: 'Maharashtra',
        addressLine1: 'Airport Road',
        averageRating: 4.1,
        reviewCount: 420,
        totalRigs: 16,
        availableRigs: 5,
        menuItemCount: 10,
        publishedTournamentCount: 1,
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
          home: const CafeMarketplaceScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('EXPLORE CAFES'), findsOneWidget);
    expect(find.text('GameGuru setup planner'), findsOneWidget);
    expect(find.text('EXPLORE MORE'), findsOneWidget);
    expect(find.text('FEATURED CAFES'), findsOneWidget);
    expect(find.text('Respawn Arena'), findsWidgets);
    expect(find.text('Squad'), findsOneWidget);
  });

  testWidgets(
    'cafe marketplace keeps promo and selected cafe content separated on phone widths',
    (WidgetTester tester) async {
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
          isFeatured: true,
          averageRating: 4.6,
          reviewCount: 1480,
          totalRigs: 24,
          availableRigs: 11,
          menuItemCount: 18,
          publishedTournamentCount: 3,
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
            home: const CafeMarketplaceScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle(const Duration(seconds: 1));

      final headlineRect = tester.getRect(find.text('UNLOCK WEEKEND BOOSTS'));
      final subtitleRect = tester.getRect(
        find.textContaining('Start with Respawn Arena'),
      );
      final selectedMessageRect = tester.getRect(
        find.textContaining('Respawn Arena has 11 rigs open'),
      );
      final selectedCtaRect = tester.getRect(find.text('Open selected cafe'));
      final exploreCafesRect = tester.getRect(find.text('EXPLORE CAFES'));
      final featuredFilterRect = tester.getRect(find.text('Featured cafes'));

      expect(headlineRect.bottom, lessThanOrEqualTo(subtitleRect.top));
      expect(
        selectedMessageRect.bottom,
        lessThanOrEqualTo(selectedCtaRect.top),
      );
      expect(exploreCafesRect.top, lessThan(featuredFilterRect.top));
    },
  );
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
  bool isFeatured = false,
  double averageRating = 0,
  int reviewCount = 0,
  int totalRigs = 0,
  int availableRigs = 0,
  int menuItemCount = 0,
  int publishedTournamentCount = 0,
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
    isFeatured: isFeatured,
    commissionRate: 0,
    convenienceFeeFlat: 0,
    convenienceFeeRate: 0,
    averageRating: averageRating,
    reviewCount: reviewCount,
    totalRigs: totalRigs,
    activeRigs: totalRigs,
    availableRigs: availableRigs,
    menuItemCount: menuItemCount,
    featuredMenuItemCount: menuItemCount > 0 ? 3 : 0,
    publishedTournamentCount: publishedTournamentCount,
  );
}
