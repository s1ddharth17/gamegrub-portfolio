import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';

class FirebasePushOptions {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _appIdWeb = String.fromEnvironment('FIREBASE_APP_ID_WEB');
  static const _appIdAndroid = String.fromEnvironment(
    'FIREBASE_APP_ID_ANDROID',
  );
  static const _appIdIos = String.fromEnvironment('FIREBASE_APP_ID_IOS');
  static const _authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
  );

  static FirebaseOptions? get current {
    final appId = kIsWeb
        ? _appIdWeb
        : switch (defaultTargetPlatform) {
            TargetPlatform.android => _appIdAndroid,
            TargetPlatform.iOS => _appIdIos,
            _ => '',
          };
    if (_apiKey.isEmpty ||
        _projectId.isEmpty ||
        _messagingSenderId.isEmpty ||
        appId.isEmpty) {
      return null;
    }
    return FirebaseOptions(
      apiKey: _apiKey,
      appId: appId,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      authDomain: _authDomain.isEmpty ? null : _authDomain,
      storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
    );
  }
}
