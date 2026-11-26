import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamegrub_user/models/menu.dart';
import 'package:gamegrub_user/models/order.dart';
import 'package:gamegrub_user/widgets/food_card.dart';

void main() {
  test('order tickets parse lifecycle state, kitchen note, and ETA', () {
    final order = OrderTicket.fromJson({
      'order_id': 44,
      'booking_id': 501,
      'status': 'preparing',
      'customer_notes': 'No onions',
      'accepted_at': '2026-10-25T08:00:00Z',
      'preparing_at': '2026-10-25T08:04:00Z',
      'eta_at': '2026-10-25T08:24:00Z',
      'eta_minutes': 20,
      'items': const [],
    });

    expect(order.status, 'preparing');
    expect(order.notes, 'No onions');
    expect(order.etaMinutes, 20);
    expect(order.acceptedAt, DateTime.parse('2026-10-25T08:00:00Z'));
    expect(order.etaAt, DateTime.parse('2026-10-25T08:24:00Z'));
  });

  testWidgets('unavailable menu items remain visible without add controls', (
    WidgetTester tester,
  ) async {
    final item = MenuItemModel(
      id: 2,
      businessId: 1,
      name: 'Chilli Fries',
      amount: 120,
      image: '',
      category: 'Snacks',
      description: 'Crispy fries',
      prepTimeMinutes: 10,
      isAvailable: false,
      isFeatured: false,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FoodCard(
            item: item,
            quantity: 0,
            isOrderingEnabled: true,
            onAdd: () {},
            onRemove: () {},
          ),
        ),
      ),
    );

    expect(find.text('Chilli Fries'), findsOneWidget);
    expect(find.text('Unavailable'), findsOneWidget);
    expect(
      find.text('Currently unavailable. Check back soon.'),
      findsOneWidget,
    );
    expect(find.text('ADD'), findsNothing);
  });
}
