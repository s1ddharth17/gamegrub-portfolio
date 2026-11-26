import 'dart:convert';
import 'dart:io';

void main() {
  const keys = <String>[
    'FIREBASE_API_KEY',
    'FIREBASE_APP_ID_WEB',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_STORAGE_BUCKET',
  ];
  final options = <String, String>{};
  for (final key in keys) {
    final value = Platform.environment[key]?.trim() ?? '';
    if (value.isNotEmpty) {
      final outputKey = switch (key) {
        'FIREBASE_API_KEY' => 'apiKey',
        'FIREBASE_APP_ID_WEB' => 'appId',
        'FIREBASE_MESSAGING_SENDER_ID' => 'messagingSenderId',
        'FIREBASE_PROJECT_ID' => 'projectId',
        'FIREBASE_AUTH_DOMAIN' => 'authDomain',
        'FIREBASE_STORAGE_BUCKET' => 'storageBucket',
        _ => key,
      };
      options[outputKey] = value;
    }
  }

  final file = File('web/firebase-messaging-config.js');
  file.writeAsStringSync(
    'self.gameGrubFirebaseOptions = ${jsonEncode(options)};\n',
  );
}
