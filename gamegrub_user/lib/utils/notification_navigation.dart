import 'package:flutter/material.dart';

import '../screens/bill/bill_screen.dart';
import '../screens/profile/notification_center_screen.dart';
import '../screens/booking/station_waitlist_screens.dart';
import '../screens/tournaments/tournament_screen.dart';

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> rootScaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

class NotificationNavigation {
  static void open(String value) {
    final navigator = rootNavigatorKey.currentState;
    if (navigator == null) return;
    final uri = Uri.tryParse(value.trim());
    if (uri == null) return;
    final segments = uri.pathSegments.where((part) => part.isNotEmpty).toList();
    if (segments.isEmpty || segments.first == 'notifications') {
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const NotificationCenterScreen(),
        ),
      );
      return;
    }

    final first = segments.first.toLowerCase();
    final entityId = segments.length > 1 ? int.tryParse(segments[1]) : null;
    if (first == 'booking' && entityId != null) {
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => BillScreen(bookingId: entityId),
        ),
      );
      return;
    }
    if (first == 'waitlist' && segments.length > 2 && segments[1] == 'offers') {
      final offerId = int.tryParse(segments[2]);
      if (offerId != null) {
        navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => StationWaitlistOfferScreen(offerId: offerId),
          ),
        );
      }
      return;
    }
    if (first == 'orders') {
      final bookingId = int.tryParse(uri.queryParameters['booking_id'] ?? '');
      if (bookingId != null) {
        navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => BillScreen(bookingId: bookingId),
          ),
        );
      }
      return;
    }
    if (first == 'bills' && entityId != null) {
      navigator.push(
        MaterialPageRoute<void>(builder: (_) => BillScreen(billId: entityId)),
      );
      return;
    }
    if (first == 'tournaments' && entityId != null) {
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => TournamentScreen(initialTournamentId: entityId),
        ),
      );
    }
  }
}
