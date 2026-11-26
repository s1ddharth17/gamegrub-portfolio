import 'dart:typed_data';
import 'dart:math';

import 'package:flutter/material.dart';

import '../models/bill.dart';
import '../models/session.dart';
import '../services/bill_service.dart';
import '../services/booking_service.dart';

class BillProvider with ChangeNotifier {
  final BillService _billService = BillService();
  final BookingService _bookingService = BookingService();

  List<Bill> bills = [];
  Bill? selectedBill;
  SessionSnapshot? liveSession;
  Map<String, dynamic>? latestSettlement;
  bool isLoading = false;
  bool isSettling = false;
  bool isRefunding = false;
  String? errorMessage;
  String? refundMessage;

  Future<void> loadUserBills({
    required String token,
    required int userId,
  }) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final data = await _billService.fetchUserBills(
        token: token,
        userId: userId,
      );
      bills = data
          .map((item) => Bill.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadBillDetail({
    required String token,
    required int billId,
  }) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _billService.fetchBillDetail(
        token: token,
        billId: billId,
      );
      selectedBill = Bill.fromDetailResponse(response);
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<Uint8List?> downloadReceipt({
    required String token,
    required int billId,
  }) async {
    errorMessage = null;
    try {
      return await _billService.downloadReceipt(token: token, billId: billId);
    } catch (e) {
      errorMessage = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> requestOrderRefund({
    required String token,
    required int billId,
    required int bookingId,
    required int orderId,
    required double amount,
    required String reason,
  }) async {
    isRefunding = true;
    errorMessage = null;
    refundMessage = null;
    notifyListeners();
    try {
      final requestKey = '${bookingId}_${orderId}_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}';
      final response = await _billService.requestOrderRefund(
        token: token,
        bookingId: bookingId,
        orderId: orderId,
        amount: amount,
        reason: reason,
        idempotencyKey: requestKey,
      );
      refundMessage = response['message']?.toString() ?? 'Refund request received.';
      await loadBillDetail(token: token, billId: billId);
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isRefunding = false;
      notifyListeners();
    }
  }

  Future<void> loadLiveSession({
    required String token,
    required int bookingId,
  }) async {
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _bookingService.fetchLiveMinuteBill(
        token: token,
        bookingId: bookingId,
      );
      liveSession = SessionSnapshot.fromJson(response, bookingId: bookingId);
    } catch (e) {
      errorMessage = e.toString();
      liveSession = null;
    }
    notifyListeners();
  }

  void clearLiveSession() {
    liveSession = null;
    latestSettlement = null;
    errorMessage = null;
    notifyListeners();
  }

  Future<bool> settleBill({
    required String token,
    required int bookingId,
    required bool useLoyalty,
    required String paymentMethod,
    String? paymentReference,
    double? overrideAmount,
  }) async {
    isSettling = true;
    errorMessage = null;
    notifyListeners();

    try {
      latestSettlement = await _bookingService.settleBill(
        token: token,
        bookingId: bookingId,
        useLoyalty: useLoyalty,
        paymentMethod: paymentMethod,
        paymentReference: paymentReference,
        overrideAmount: overrideAmount,
      );
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isSettling = false;
      notifyListeners();
    }
  }
}
