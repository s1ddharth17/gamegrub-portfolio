import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../utils/notification_navigation.dart';

class NotificationProvider with ChangeNotifier {
  static const Map<String, String> categoryLabels = {
    'booking_reminders': 'Booking reminders',
    'no_show_warnings': 'Check-in and no-show alerts',
    'session_updates': 'Session updates',
    'food_orders': 'Food orders',
    'payments': 'Payments',
    'refunds': 'Refund updates',
    'waitlist': 'Tournament waitlist',
    'tournaments': 'Tournament updates',
  };

  final List<Map<String, dynamic>> notifications = [];
  Map<String, dynamic> preferences = {
    'push_enabled': false,
    'timezone_name': 'Asia/Kolkata',
    'categories': {for (final key in categoryLabels.keys) key: true},
  };

  bool isLoading = false;
  bool isSaving = false;
  bool serverPushConfigured = false;
  String webVapidKey = '';
  String? errorMessage;
  String? _activeToken;
  String? _pendingDeepLink;
  String? _installationId;
  StreamSubscription<String>? _registeredSubscription;
  StreamSubscription<String>? _unregisteredSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;

  NotificationProvider() {
    if (Firebase.apps.isNotEmpty) _wireFirebaseMessaging();
  }

  bool get canEnablePush =>
      serverPushConfigured &&
      Firebase.apps.isNotEmpty &&
      (!kIsWeb || webVapidKey.isNotEmpty);

  String get pushUnavailableReason {
    if (!serverPushConfigured) {
      return 'Push delivery is not configured on the server yet.';
    }
    if (Firebase.apps.isEmpty) {
      return 'This build does not include Firebase app configuration.';
    }
    if (kIsWeb && webVapidKey.isEmpty) {
      return 'Web push requires a Firebase VAPID key.';
    }
    return '';
  }

  void bindAuthToken(String? token) {
    _activeToken = token;
    final pendingLink = _pendingDeepLink;
    if (token != null && token.isNotEmpty && pendingLink != null) {
      _pendingDeepLink = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        NotificationNavigation.open(pendingLink);
      });
    }
  }

  void _handleDeepLink(String? deepLink) {
    if (deepLink == null || deepLink.isEmpty) return;
    if (_activeToken == null || _activeToken!.isEmpty) {
      _pendingDeepLink = deepLink;
      return;
    }
    NotificationNavigation.open(deepLink);
  }

  void _wireFirebaseMessaging() {
    final messaging = FirebaseMessaging.instance;
    if (!kIsWeb) {
      unawaited(
        messaging
            .setForegroundNotificationPresentationOptions(
              alert: true,
              badge: true,
              sound: true,
            )
            .catchError((_) {}),
      );
    }
    _registeredSubscription ??= messaging.onRegistered.listen((installationId) {
      _installationId = installationId;
      final token = _activeToken;
      if (token != null && token.isNotEmpty) {
        unawaited(_registerInstallation(token, installationId));
      }
    });
    _unregisteredSubscription ??= messaging.onUnregistered.listen((
      installationId,
    ) {
      final token = _activeToken;
      if (token != null && token.isNotEmpty) {
        unawaited(_unregisterInstallation(token, installationId));
      }
    });
    _openedSubscription ??= FirebaseMessaging.onMessageOpenedApp.listen((
      message,
    ) {
      final deepLink = message.data['deep_link']?.toString();
      _handleDeepLink(deepLink);
      final token = _activeToken;
      if (token != null) unawaited(load(token));
    });
    _messageSubscription ??= FirebaseMessaging.onMessage.listen((message) {
      final token = _activeToken;
      if (token != null) unawaited(load(token));
      final notification = message.notification;
      if (notification != null) {
        rootScaffoldMessengerKey.currentState?.showSnackBar(
          SnackBar(
            content: Text(
              notification.body?.isNotEmpty == true
                  ? '${notification.title ?? 'GameGrub update'}: ${notification.body}'
                  : notification.title ?? 'GameGrub update',
            ),
          ),
        );
      }
    });
    unawaited(
      messaging
          .getInitialMessage()
          .then((message) {
            final deepLink = message?.data['deep_link']?.toString();
            if (deepLink != null) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _handleDeepLink(deepLink);
              });
            }
          })
          .catchError((_) {}),
    );
  }

  Future<void> load(String token) async {
    if (token.isEmpty) return;
    _activeToken = token;
    isLoading = true;
    errorMessage = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        ApiService.get('/notifications', headers: _headers(token)),
        ApiService.get('/notifications/preferences', headers: _headers(token)),
        ApiService.get('/notifications/push/config', headers: _headers(token)),
      ]);
      notifications
        ..clear()
        ..addAll(
          (results[0] as List? ?? const []).map(
            (row) => Map<String, dynamic>.from(row as Map),
          ),
        );
      preferences = Map<String, dynamic>.from(results[1] as Map);
      final config = Map<String, dynamic>.from(results[2] as Map);
      serverPushConfigured = config['configured'] == true;
      webVapidKey = config['web_vapid_key']?.toString() ?? '';
      if (Firebase.apps.isNotEmpty) _wireFirebaseMessaging();
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> setPushEnabled({
    required String token,
    required bool enabled,
  }) async {
    if (enabled && !canEnablePush) {
      errorMessage = pushUnavailableReason;
      notifyListeners();
      return;
    }
    isSaving = true;
    errorMessage = null;
    notifyListeners();
    try {
      if (enabled) {
        final settings = await FirebaseMessaging.instance.requestPermission();
        if (settings.authorizationStatus == AuthorizationStatus.denied) {
          throw Exception(
            'Notification permission was denied in device settings.',
          );
        }
        _activeToken = token;
        await _savePreferences(token, {'push_enabled': true});
        await FirebaseMessaging.instance.register(
          vapidKey: kIsWeb ? webVapidKey : null,
          serviceWorkerScriptPath: kIsWeb ? 'firebase-messaging-sw.js' : null,
        );
      } else {
        await _savePreferences(token, {'push_enabled': false});
        final installationId = _installationId;
        if (installationId != null) {
          await _unregisterInstallation(token, installationId);
        }
        if (Firebase.apps.isNotEmpty) {
          await FirebaseMessaging.instance.unregister();
        }
      }
    } catch (error) {
      errorMessage = error.toString();
      if (enabled) {
        try {
          await _savePreferences(token, {'push_enabled': false});
        } catch (_) {}
      }
    } finally {
      isSaving = false;
      notifyListeners();
    }
  }

  Future<void> setCategory({
    required String token,
    required String category,
    required bool enabled,
  }) async {
    try {
      await _savePreferences(token, {
        'categories': {category: enabled},
      });
    } catch (_) {}
  }

  Future<void> setTimezone({
    required String token,
    required String timezone,
  }) async {
    try {
      await _savePreferences(token, {'timezone_name': timezone});
    } catch (_) {}
  }

  Future<void> _savePreferences(
    String token,
    Map<String, dynamic> changes,
  ) async {
    isSaving = true;
    errorMessage = null;
    notifyListeners();
    try {
      final result = await ApiService.put(
        '/notifications/preferences',
        changes,
        headers: _headers(token),
      );
      preferences = Map<String, dynamic>.from(result as Map);
    } catch (error) {
      errorMessage = error.toString();
      rethrow;
    } finally {
      isSaving = false;
      notifyListeners();
    }
  }

  Future<void> markRead(String token, int notificationId) async {
    final index = notifications.indexWhere(
      (item) => item['notification_id'] == notificationId,
    );
    if (index >= 0) notifications[index]['is_read'] = true;
    notifyListeners();
    try {
      final result = await ApiService.post(
        '/notifications/$notificationId/read',
        const {},
        headers: _headers(token),
      );
      if (index >= 0) {
        notifications[index] = Map<String, dynamic>.from(result as Map);
      }
      notifyListeners();
    } catch (error) {
      errorMessage = error.toString();
      notifyListeners();
    }
  }

  Future<void> _registerInstallation(
    String token,
    String installationId,
  ) async {
    try {
      await ApiService.post('/notifications/push/registration', {
        'installation_id': installationId,
        'platform': kIsWeb
            ? 'web'
            : defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios'
            : 'android',
      }, headers: _headers(token));
    } catch (error) {
      errorMessage = error.toString();
      notifyListeners();
    }
  }

  Future<void> _unregisterInstallation(
    String token,
    String installationId,
  ) async {
    try {
      await ApiService.post('/notifications/push/unregister', {
        'installation_id': installationId,
      }, headers: _headers(token));
    } catch (_) {
      // Registration is marked inactive by the server when explicitly removed.
    }
  }

  Map<String, String> _headers(String token) => {
    'authorization': 'Bearer $token',
  };

  @override
  void dispose() {
    _registeredSubscription?.cancel();
    _unregisteredSubscription?.cancel();
    _openedSubscription?.cancel();
    _messageSubscription?.cancel();
    super.dispose();
  }
}
