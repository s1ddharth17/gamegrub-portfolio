import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:gamegrub_user/models/business.dart';
import 'package:gamegrub_user/models/tournament.dart';
import 'package:gamegrub_user/providers/auth_provider.dart';
import 'package:gamegrub_user/providers/business_provider.dart';
import 'package:gamegrub_user/providers/tournament_provider.dart';
import 'package:gamegrub_user/screens/tournaments/tournament_screen.dart';
import 'package:gamegrub_user/theme/app_theme.dart';

void main() {
  setUp(() {
    AppTheme.syncMode(ThemeMode.light);
  });

  tearDown(() {
    AppTheme.syncMode(ThemeMode.system);
  });

  testWidgets(
    'main tournaments tab loads all cafes instead of inheriting the selected cafe',
    (WidgetTester tester) async {
      final tournamentProvider = _FakeTournamentProvider();
      final businessProvider = _FakeBusinessProvider(
        businesses: [
          _buildBusiness(
            id: 1,
            name: 'Respawn Arena',
            city: 'Pune',
            state: 'Maharashtra',
            addressLine1: 'Somnath Nagar',
          ),
          _buildBusiness(
            id: 2,
            name: 'Pixel Pit',
            city: 'Mumbai',
            state: 'Maharashtra',
            addressLine1: 'Andheri West',
          ),
        ],
        selectedBusinessId: 1,
      );
      addTearDown(tournamentProvider.dispose);
      addTearDown(businessProvider.dispose);

      await tester.pumpWidget(
        _buildHarness(
          tournamentProvider: tournamentProvider,
          businessProvider: businessProvider,
          child: const TournamentScreen(),
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 800));

      expect(tournamentProvider.requestedBusinessIds, isNotEmpty);
      expect(tournamentProvider.requestedBusinessIds.first, isNull);
      expect(find.text('Active cafe filter'), findsNothing);
      expect(find.text('Tournaments'), findsOneWidget);
      expect(find.widgetWithText(FilterChip, 'All states'), findsOneWidget);
      expect(find.widgetWithText(FilterChip, 'All cities'), findsOneWidget);
    },
  );

  testWidgets(
    'discover list surfaces cafe, game, prize pool, entry fee, and location',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final tournamentProvider = _FakeTournamentProvider(
        initialTournaments: [
          _buildTournament(
            tournamentId: 101,
            businessId: 1,
            businessName: 'Respawn Arena',
            businessCity: 'Pune',
            businessState: 'Maharashtra',
            title: 'Weekend Valorant Cup',
            gameTitle: 'Valorant',
            entryFee: 499,
            prizePool: 12000,
            locationLabel: 'Somnath Nagar, Pune',
          ),
          _buildTournament(
            tournamentId: 102,
            businessId: 2,
            businessName: 'Pixel Pit',
            businessCity: 'Mumbai',
            businessState: 'Maharashtra',
            title: 'FIFA Friday Faceoff',
            gameTitle: 'EA FC 26',
            entryFee: 299,
            prizePool: 8000,
            locationLabel: 'Andheri West, Mumbai',
          ),
        ],
      );
      final businessProvider = _FakeBusinessProvider(
        businesses: [
          _buildBusiness(
            id: 1,
            name: 'Respawn Arena',
            city: 'Pune',
            state: 'Maharashtra',
            addressLine1: 'Somnath Nagar',
          ),
          _buildBusiness(
            id: 2,
            name: 'Pixel Pit',
            city: 'Mumbai',
            state: 'Maharashtra',
            addressLine1: 'Andheri West',
          ),
        ],
        selectedBusinessId: 1,
      );
      addTearDown(tournamentProvider.dispose);
      addTearDown(businessProvider.dispose);

      await tester.pumpWidget(
        _buildHarness(
          tournamentProvider: tournamentProvider,
          businessProvider: businessProvider,
          child: const TournamentScreen(),
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 800));

      await _scrollUntilVisible(tester, find.text('Respawn Arena'));

      expect(find.text('Respawn Arena'), findsOneWidget);
      expect(find.text('Valorant'), findsWidgets);
      expect(find.text('1v1'), findsWidgets);
      expect(find.text('Rs 499'), findsOneWidget);
      expect(find.text('Rs 12000'), findsOneWidget);
      expect(find.text('Somnath Nagar, Pune'), findsOneWidget);

      await _scrollUntilVisible(tester, find.text('Pixel Pit'));
      expect(find.text('Pixel Pit'), findsOneWidget);

      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('state and city filters narrow the discover tournament feed', (
    WidgetTester tester,
  ) async {
    final tournamentProvider = _FakeTournamentProvider(
      initialTournaments: [
        _buildTournament(
          tournamentId: 201,
          businessId: 1,
          businessName: 'Respawn Arena',
          businessCity: 'Pune',
          businessState: 'Maharashtra',
          title: 'Weekend Valorant Cup',
          gameTitle: 'Valorant',
          entryFee: 499,
          prizePool: 12000,
          locationLabel: 'Somnath Nagar, Pune',
        ),
        _buildTournament(
          tournamentId: 202,
          businessId: 2,
          businessName: 'Console Corner',
          businessCity: 'Bengaluru',
          businessState: 'Karnataka',
          title: 'Tekken Clash Night',
          gameTitle: 'Tekken 8',
          entryFee: 399,
          prizePool: 9000,
          locationLabel: 'Koramangala, Bengaluru',
        ),
        _buildTournament(
          tournamentId: 203,
          businessId: 3,
          businessName: 'Pixel Pit',
          businessCity: 'Mumbai',
          businessState: 'Maharashtra',
          title: 'FIFA Friday Faceoff',
          gameTitle: 'EA FC 26',
          entryFee: 299,
          prizePool: 8000,
          locationLabel: 'Andheri West, Mumbai',
        ),
      ],
    );
    final businessProvider = _FakeBusinessProvider(
      businesses: [
        _buildBusiness(
          id: 1,
          name: 'Respawn Arena',
          city: 'Pune',
          state: 'Maharashtra',
          addressLine1: 'Somnath Nagar',
        ),
        _buildBusiness(
          id: 2,
          name: 'Console Corner',
          city: 'Bengaluru',
          state: 'Karnataka',
          addressLine1: 'Koramangala',
        ),
        _buildBusiness(
          id: 3,
          name: 'Pixel Pit',
          city: 'Mumbai',
          state: 'Maharashtra',
          addressLine1: 'Andheri West',
        ),
      ],
      selectedBusinessId: 1,
    );
    addTearDown(tournamentProvider.dispose);
    addTearDown(businessProvider.dispose);

    await tester.pumpWidget(
      _buildHarness(
        tournamentProvider: tournamentProvider,
        businessProvider: businessProvider,
        child: const TournamentScreen(),
      ),
    );
    await tester.pumpAndSettle(const Duration(milliseconds: 800));

    await tester.tap(find.widgetWithText(FilterChip, 'Karnataka'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilterChip, 'Bengaluru'));
    await tester.pumpAndSettle();
    await _scrollUntilVisible(tester, find.text('Console Corner'));

    expect(find.text('Console Corner'), findsOneWidget);
    expect(find.text('Respawn Arena'), findsNothing);
    expect(find.text('Pixel Pit'), findsNothing);
    expect(find.text('Tekken 8'), findsWidgets);
    expect(find.text('Koramangala, Bengaluru'), findsOneWidget);
  });

  testWidgets('cafe detail tournaments screen keeps the explicit cafe filter', (
    WidgetTester tester,
  ) async {
    final tournamentProvider = _FakeTournamentProvider();
    final businessProvider = _FakeBusinessProvider(
      businesses: [
        _buildBusiness(
          id: 7,
          name: 'Console Corner',
          city: 'Bengaluru',
          state: 'Karnataka',
          addressLine1: 'Koramangala',
        ),
      ],
      selectedBusinessId: 7,
    );
    addTearDown(tournamentProvider.dispose);
    addTearDown(businessProvider.dispose);

    await tester.pumpWidget(
      _buildHarness(
        tournamentProvider: tournamentProvider,
        businessProvider: businessProvider,
        child: const TournamentScreen(
          initialBusinessId: 7,
          initialBusinessName: 'Console Corner',
        ),
      ),
    );
    await tester.pump();
    await _scrollUntilVisible(tester, find.text('Active cafe filter'));

    expect(tournamentProvider.requestedBusinessIds, isNotEmpty);
    expect(tournamentProvider.requestedBusinessIds.first, 7);
    expect(find.text('Active cafe filter'), findsOneWidget);
    expect(find.text('Console Corner'), findsOneWidget);
  });

  testWidgets(
    'anonymous customers can browse community posts and open a linked event outside the current feed',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(390, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final linkedEvent = _buildTournament(
        tournamentId: 701,
        businessId: 2,
        businessName: 'Pixel Pit',
        businessCity: 'Mumbai',
        businessState: 'Maharashtra',
        title: 'Weekend Valorant Finals',
        gameTitle: 'Valorant',
        entryFee: 0,
        prizePool: 20000,
        locationLabel: 'Andheri West, Mumbai',
      );
      final provider = _FakeTournamentProvider(
        initialTournaments: [
          _buildTournament(
            tournamentId: 702,
            businessId: 1,
            businessName: 'Respawn Arena',
            businessCity: 'Pune',
            businessState: 'Maharashtra',
            title: 'Another event',
            gameTitle: 'Tekken 8',
            entryFee: 0,
            prizePool: 5000,
            locationLabel: 'Pune',
          ),
        ],
        initialCommunityPosts: [
          _buildCommunityPost(
            postId: 801,
            title: 'Top community post',
            summary: 'A staff-curated event update.',
            body: 'Plain text details stay readable in the post view.',
            linkedTournamentId: linkedEvent.tournamentId,
            linkedTournamentSlug: 'weekend-valorant-finals',
            linkedTournamentTitle: linkedEvent.title,
            ctaLabel: 'Open event',
          ),
          _buildCommunityPost(
            postId: 802,
            title: 'Second community post',
            summary: 'A recap from the tournament desk.',
          ),
        ],
        publicDetailTournament: linkedEvent,
      );
      final businessProvider = _FakeBusinessProvider(
        businesses: [
          _buildBusiness(
            id: 1,
            name: 'Respawn Arena',
            city: 'Pune',
            state: 'Maharashtra',
            addressLine1: 'Somnath Nagar',
          ),
        ],
      );
      addTearDown(provider.dispose);
      addTearDown(businessProvider.dispose);

      await tester.pumpWidget(
        _buildHarness(
          tournamentProvider: provider,
          businessProvider: businessProvider,
          child: const TournamentScreen(),
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 800));

      await tester.tap(find.text('Updates (2)'));
      await tester.pumpAndSettle();

      await _scrollUntilVisible(tester, find.text('Top community post'));
      expect(find.text('Top community post'), findsOneWidget);

      await tester.tap(find.text('Open event').first);
      await tester.pumpAndSettle();
      expect(
        find.text('Plain text details stay readable in the post view.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Open event').last);
      await tester.pumpAndSettle();

      expect(provider.requestedPublicDetailLookup, 'weekend-valorant-finals');
      expect(find.text('Weekend Valorant Finals'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'community feed exposes loading, retryable error, and empty states',
    (WidgetTester tester) async {
      final provider = _FakeTournamentProvider(
        communityPostsLoading: true,
        communityError: 'private backend error details',
        recoveredCommunityPosts: [
          _buildCommunityPost(
            postId: 803,
            title: 'Recovered community post',
            summary: 'The retry completed.',
          ),
        ],
      );
      final businessProvider = _FakeBusinessProvider(businesses: const []);
      addTearDown(provider.dispose);
      addTearDown(businessProvider.dispose);

      await tester.pumpWidget(
        _buildHarness(
          tournamentProvider: provider,
          businessProvider: businessProvider,
          child: const TournamentScreen(),
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 800));

      await tester.tap(find.text('Updates (0)'));
      await tester.pumpAndSettle();
      await _scrollUntilVisible(
        tester,
        find.text('Loading tournament community…'),
        settle: false,
      );
      expect(find.text('Loading tournament community…'), findsOneWidget);

      provider.isCommunityPostsLoading = false;
      provider.communityPostsError = 'private backend error details';
      provider.notifyListeners();
      await tester.pumpAndSettle();
      await _scrollUntilVisible(
        tester,
        find.text(
          'Community posts could not load. Check your connection and try again.',
        ),
      );
      expect(
        find.text(
          'Community posts could not load. Check your connection and try again.',
        ),
        findsOneWidget,
      );
      expect(find.text('private backend error details'), findsNothing);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      await _scrollUntilVisible(tester, find.text('Recovered community post'));
      expect(find.text('Recovered community post'), findsOneWidget);

      provider.communityPosts = [];
      provider.notifyListeners();
      await tester.pumpAndSettle();
      await _scrollUntilVisible(tester, find.text('No community posts yet'));
      expect(find.text('No community posts yet'), findsOneWidget);
    },
  );
}

Widget _buildHarness({
  required TournamentProvider tournamentProvider,
  required BusinessProvider businessProvider,
  required Widget child,
}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AuthProvider>(create: (_) => AuthProvider()),
      ChangeNotifierProvider<BusinessProvider>.value(value: businessProvider),
      ChangeNotifierProvider<TournamentProvider>.value(
        value: tournamentProvider,
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.light,
      home: child,
    ),
  );
}

Future<void> _scrollUntilVisible(
  WidgetTester tester,
  Finder finder, {
  bool settle = true,
}) async {
  await tester.scrollUntilVisible(
    finder,
    240,
    scrollable: find.byType(Scrollable).first,
  );
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

class _FakeTournamentProvider extends TournamentProvider {
  _FakeTournamentProvider({
    List<Tournament> initialTournaments = const [],
    List<TournamentCommunityPost> initialCommunityPosts = const [],
    this.recoveredCommunityPosts = const [],
    this.publicDetailTournament,
    bool communityPostsLoading = false,
    String? communityError,
  }) {
    tournaments = initialTournaments;
    myTournaments = [];
    notifications = [];
    communityPosts = initialCommunityPosts;
    isCommunityPostsLoading = communityPostsLoading;
    communityPostsError = communityError;
    leaderboard = [];
    teams = [];
    teamInvites = [];
    isLoading = false;
    errorMessage = null;
  }

  final List<int?> requestedBusinessIds = [];
  final List<TournamentCommunityPost> recoveredCommunityPosts;
  final Tournament? publicDetailTournament;
  String? requestedPublicDetailLookup;

  @override
  Future<void> loadCommunityPosts() async {
    communityPosts = recoveredCommunityPosts;
    communityPostsError = null;
    isCommunityPostsLoading = false;
    notifyListeners();
  }

  @override
  Future<Tournament> fetchPublicTournamentDetails({
    required String slugOrId,
  }) async {
    requestedPublicDetailLookup = slugOrId;
    if (publicDetailTournament == null) {
      throw StateError('Tournament not found.');
    }
    return publicDetailTournament!;
  }

  @override
  Future<void> loadBracket({required int tournamentId}) async {}

  @override
  Future<void> loadTournaments({String? token, int? businessId}) async {
    requestedBusinessIds.add(businessId);
    loadedBusinessId = businessId;
    if (tournaments.isEmpty) {
      tournaments = [
        _buildTournament(
          tournamentId: 999,
          businessId: businessId ?? 0,
          businessName: businessId == null ? 'All cafes' : 'Filtered cafe',
          businessCity: 'Pune',
          businessState: 'Maharashtra',
          title: 'Test Tournament',
          gameTitle: 'Valorant',
          entryFee: 0,
          prizePool: 0,
          locationLabel: 'Testing venue',
        ),
      ];
    }
    notifyListeners();
  }
}

TournamentCommunityPost _buildCommunityPost({
  required int postId,
  required String title,
  required String summary,
  String body = '',
  String ctaLabel = 'Read more',
  int? linkedTournamentId,
  String linkedTournamentSlug = '',
  String linkedTournamentTitle = '',
}) {
  return TournamentCommunityPost.fromJson({
    'post_id': postId,
    'linked_tournament_id': linkedTournamentId,
    'content_type': 'community_update',
    'status': 'published',
    'accent_tone': 'turquoise',
    'title': title,
    'subtitle': '',
    'summary': summary,
    'body': body,
    'badge_label': 'Community update',
    'cta_label': ctaLabel,
    'priority': 1,
    'is_active_now': true,
    'starts_at': '2026-10-20T12:00:00.000Z',
    'ends_at': '2099-10-20T12:00:00.000Z',
    'published_at': '2026-10-20T12:00:00.000Z',
    if (linkedTournamentId != null)
      'linked_tournament': {
        'tournament_id': linkedTournamentId,
        'slug': linkedTournamentSlug,
        'title': linkedTournamentTitle,
        'game_title': 'Valorant',
        'status': 'published',
        'start_at': '2026-11-20T18:00:00.000Z',
        'is_featured': false,
      },
  });
}

class _FakeBusinessProvider extends BusinessProvider {
  _FakeBusinessProvider({
    required List<Business> businesses,
    int? selectedBusinessId,
  }) {
    this.businesses = businesses;
    selectedBusiness = businessForId(selectedBusinessId);
    selectedBusiness ??= businesses.isEmpty ? null : businesses.first;
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
  required String city,
  required String state,
  required String addressLine1,
}) {
  return Business(
    id: id,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    name: name,
    tagline: '$name tournaments',
    description: '$name tournaments',
    city: city,
    state: state,
    addressLine1: addressLine1,
    phone: '',
    contactEmail: '',
    opensAt: '10:00:00',
    closesAt: '23:00:00',
    logoImage: '',
    coverImage: '',
    isFeatured: false,
    commissionRate: 0,
    convenienceFeeFlat: 0,
    convenienceFeeRate: 0,
    averageRating: 0,
    reviewCount: 0,
    totalRigs: 10,
    activeRigs: 10,
    availableRigs: 5,
    menuItemCount: 8,
    featuredMenuItemCount: 2,
    publishedTournamentCount: 2,
  );
}

Tournament _buildTournament({
  required int tournamentId,
  required int businessId,
  required String businessName,
  required String businessCity,
  required String businessState,
  required String title,
  required String gameTitle,
  required double entryFee,
  required double prizePool,
  required String locationLabel,
}) {
  return Tournament.fromJson({
    'tournament_id': tournamentId,
    'business_id': businessId,
    'business_name': businessName,
    'business_city': businessCity,
    'business_state': businessState,
    'title': title,
    'game_title': gameTitle,
    'format': 'solo',
    'team_size': 1,
    'max_participants': 32,
    'registered_count': 12,
    'available_slots': 20,
    'entry_fee': entryFee,
    'prize_pool': prizePool,
    'effective_prize_pool': prizePool,
    'location_label': locationLabel,
    'summary': 'Fast brackets and live cafe shoutcasting.',
    'status': 'published',
    'operations_stage': 'registrations',
    'can_register': true,
    'can_join_waitlist': false,
    'has_registration': false,
    'is_registered': false,
    'is_waitlisted': false,
    'can_withdraw_registration': false,
    'waitlist_count': 0,
    'start_at': '2026-06-14T18:00:00.000',
    'end_at': '2026-06-14T23:00:00.000',
    'registration_close_at': '2026-06-14T16:00:00.000',
    'published_at': '2026-06-01T10:00:00.000',
  });
}
