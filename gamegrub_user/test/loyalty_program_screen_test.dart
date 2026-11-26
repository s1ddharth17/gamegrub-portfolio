import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:gamegrub_user/models/user.dart';
import 'package:gamegrub_user/providers/auth_provider.dart';
import 'package:gamegrub_user/screens/profile/loyalty_program_screen.dart';
import 'package:gamegrub_user/services/loyalty_service.dart';
import 'package:gamegrub_user/theme/app_theme.dart';

void main() {
  setUp(() => AppTheme.syncMode(ThemeMode.light));
  tearDown(() => AppTheme.syncMode(ThemeMode.system));

  test('AppUser round-trips the private birthday profile field', () {
    final user = AppUser.fromJson({'uid': 7, 'date_of_birth': '2001-04-12'});
    expect(user.dateOfBirth, '2001-04-12');
    expect(user.toJson()['date_of_birth'], '2001-04-12');
    expect(user.copyWith(dateOfBirth: '2002-05-13').dateOfBirth, '2002-05-13');
  });

  testWidgets('loyalty screen explains rewards and applies a referral code', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final auth = AuthProvider()..token = 'test-token';
    addTearDown(auth.dispose);
    final service = _FakeLoyaltyService();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthProvider>.value(
        value: auth,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: LoyaltyProgramScreen(service: service),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Loyalty & rewards'), findsOneWidget);
    expect(find.text('1240 pts'), findsOneWidget);
    expect(
      find.text(
        'Earn 5% of the eligible session amount in points after settlement.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '1 point equals ₹1 and can cover the service subtotal; fees may remain due.',
      ),
      findsOneWidget,
    );
    expect(find.text('GG1234ABCD'), findsWidgets);

    await tester.scrollUntilVisible(
      find.text('Apply code'),
      420,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(ListView), const Offset(0, 140));
    await tester.pumpAndSettle();
    final codeField = find.widgetWithText(TextField, 'Have a referral code?');
    await tester.enterText(codeField, 'GG8765WXYZ');
    await tester.tap(find.text('Apply code'));
    await tester.pumpAndSettle();

    expect(service.appliedCodes, ['GG8765WXYZ']);
    expect(service.fetchCount, 2);

    await tester.scrollUntilVisible(
      find.text('Regular monthly challenge'),
      420,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Regular monthly challenge'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Regular Player'),
      420,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Regular Player'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Monthly challenge completed.'),
      420,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Monthly challenge completed.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _FakeLoyaltyService extends LoyaltyService {
  int fetchCount = 0;
  final List<String> appliedCodes = [];

  @override
  Future<Map<String, dynamic>> fetchSummary({required String token}) async {
    expect(token, 'test-token');
    fetchCount += 1;
    return {
      'balance': 1240,
      'tier': 'Regular',
      'referral': {
        'code': 'GG1234ABCD',
        'referral_count': 2,
        'rewarded_count': 1,
        'rule':
            'You and your friend each earn 150 points after their first paid café visit.',
      },
      'streak': {'current': 2, 'best': 4},
      'challenge': {
        'title': 'Regular monthly challenge',
        'description':
            'Visit on 3 different days this month to earn 75 bonus points.',
        'progress': 3,
        'target_visits': 3,
        'reward_points': 75,
        'completed': true,
      },
      'birthday_offer': {
        'birthday_today': false,
        'reward_points': 100,
        'credited': false,
        'rule':
            'Add your birthday to your profile to receive the annual reward.',
      },
      'rules': {
        'earning':
            'Earn 5% of the eligible session amount in points after settlement.',
        'redemption':
            '1 point equals ₹1 and can cover the service subtotal; fees may remain due.',
        'expiration':
            'Points do not expire automatically. Refunds and corrections appear in history.',
      },
      'badges': [
        {
          'code': 'five_visit_days',
          'name': 'Regular Player',
          'description': 'Visit on five different days.',
          'reward_points': 50,
          'awarded_at': '2026-10-20 10:00:00',
        },
      ],
      'history': [
        {
          'id': 1,
          'booking_id': 22,
          'points': 75,
          'transaction_type': 'bonus',
          'note': 'Monthly challenge completed.',
          'created_at': '2026-10-20 10:00:00',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> applyReferral({
    required String token,
    required String referralCode,
  }) async {
    expect(token, 'test-token');
    appliedCodes.add(referralCode);
    return {'message': 'Referral connected.'};
  }
}
