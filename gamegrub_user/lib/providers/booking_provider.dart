import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../models/slot.dart';
import '../services/booking_service.dart';

class BookingProvider with ChangeNotifier {
  final BookingService _service = BookingService();

  List<Booking> bookings = [];
  List<Slot> availableSlots = [];
  bool isLoading = false;
  bool isCreating = false;
  String? errorMessage;
  String? cancellationMessage;

  Booking? get currentBooking {
    final candidates =
        bookings.where((booking) => booking.canSettlePayment).toList()
          ..sort(_sortCurrentBookings);

    if (candidates.isEmpty) {
      return null;
    }

    return candidates.first;
  }

  Booking? get upcomingBooking {
    final candidates = bookings.where((booking) => booking.isUpcoming).toList()
      ..sort(_sortByEarliestStart);

    if (candidates.isEmpty) {
      return null;
    }

    return candidates.first;
  }

  Future<void> loadUserBookings({
    required String token,
    required int userId,
  }) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final data = await _service.fetchUserBookings(
        token: token,
        userId: userId,
      );
      bookings = data
          .map(
            (item) => Booking.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadAvailableSlots({
    required String token,
    required int pcId,
    required DateTime date,
  }) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final data = await _service.fetchAvailableSlots(
        token: token,
        pcId: pcId,
        date: _formatDate(date),
      );
      availableSlots = data
          .map((item) => Slot.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
    } catch (e) {
      errorMessage = e.toString();
      availableSlots = [];
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<BookingCreationResult?> createBooking({
    required String token,
    required int userId,
    required int pcId,
    required DateTime date,
    required List<int> slots,
    required String paymentMethod,
    required String idempotencyKey,
    String? paymentReference,
    bool useLoyalty = false,
    int? waitlistOfferId,
  }) async {
    isCreating = true;
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _service.createBooking(
        token: token,
        pcId: pcId,
        bookingDate: _formatDate(date),
        slots: slots,
        paymentMethod: paymentMethod,
        idempotencyKey: idempotencyKey,
        paymentReference: paymentReference,
        useLoyalty: useLoyalty,
        waitlistOfferId: waitlistOfferId,
      );
      await loadUserBookings(token: token, userId: userId);
      return BookingCreationResult.fromJson(response);
    } catch (e) {
      errorMessage = e.toString();
      return null;
    } finally {
      isCreating = false;
      notifyListeners();
    }
  }

  Future<BookingExtensionResult?> extendBooking({
    required String token,
    required int bookingId,
    required int userId,
  }) async {
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _service.extendBooking(
        token: token,
        bookingId: bookingId,
      );
      await loadUserBookings(token: token, userId: userId);
      return BookingExtensionResult.fromJson(response);
    } catch (e) {
      errorMessage = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> cancelBooking({
    required String token,
    required int bookingId,
    required int userId,
    double? refundAmount,
  }) async {
    errorMessage = null;
    cancellationMessage = null;
    notifyListeners();

    try {
      final result = await _service.cancelBooking(
        token: token,
        bookingId: bookingId,
        refundAmount: refundAmount,
      );
      cancellationMessage = result['message']?.toString();
      final refund = result['refund_request'];
      if (refund is Map && refund['refund_number'] != null) {
        cancellationMessage = '${cancellationMessage ?? 'Booking cancelled.'} Reference ${refund['refund_number']}.';
      }
      await loadUserBookings(token: token, userId: userId);
      return true;
    } catch (e) {
      errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  static int _sortByLatestStart(Booking left, Booking right) {
    final leftValue =
        left.startTime ??
        left.bookingDate ??
        DateTime.fromMillisecondsSinceEpoch(0);
    final rightValue =
        right.startTime ??
        right.bookingDate ??
        DateTime.fromMillisecondsSinceEpoch(0);
    return rightValue.compareTo(leftValue);
  }

  static int _sortCurrentBookings(Booking left, Booking right) {
    final priorityCompare = _currentBookingPriority(
      right,
    ).compareTo(_currentBookingPriority(left));
    if (priorityCompare != 0) {
      return priorityCompare;
    }

    final startCompare = _sortByLatestStart(left, right);
    if (startCompare != 0) {
      return startCompare;
    }

    return right.bookingId.compareTo(left.bookingId);
  }

  static int _currentBookingPriority(Booking booking) {
    switch (booking.normalizedStatus) {
      case 'running':
        return 3;
      case 'session_over':
        return 2;
      case 'confirmed':
        return booking.hasStarted ? 1 : 0;
      default:
        return 0;
    }
  }

  static int _sortByEarliestStart(Booking left, Booking right) {
    final leftValue =
        left.startTime ??
        left.bookingDate ??
        DateTime.fromMillisecondsSinceEpoch(0);
    final rightValue =
        right.startTime ??
        right.bookingDate ??
        DateTime.fromMillisecondsSinceEpoch(0);
    return leftValue.compareTo(rightValue);
  }
}
