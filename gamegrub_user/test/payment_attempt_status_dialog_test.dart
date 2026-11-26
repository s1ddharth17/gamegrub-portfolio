import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/screens/payment/payment_attempt_status_dialog.dart';

void main() {
  testWidgets(
    'payment status dialog refreshes and displays a verified result',
    (WidgetTester tester) async {
      var fetchCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: PaymentAttemptStatusDialog(
                token: 'session-token',
                attemptId: 'attempt-17',
                checkoutUrl: 'https://checkout.example.test/pay',
                fetchAttemptStatus:
                    ({required token, required attemptId}) async {
                      fetchCount++;
                      expect(token, 'session-token');
                      expect(attemptId, 'attempt-17');
                      return {'status': 'captured'};
                    },
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Check status'));
      await tester.pumpAndSettle();

      expect(fetchCount, 1);
      expect(
        find.text(
          'Payment verified. Refresh the bill to see the remaining balance.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('payment status dialog leaves a failed status check pending', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: PaymentAttemptStatusDialog(
              token: 'session-token',
              attemptId: 'attempt-18',
              checkoutUrl: 'https://checkout.example.test/pay',
              fetchAttemptStatus: ({required token, required attemptId}) async {
                throw StateError('network unavailable');
              },
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Check status'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Payment is pending verification. Complete Razorpay checkout, return here, then check again.',
      ),
      findsOneWidget,
    );
  });
}
