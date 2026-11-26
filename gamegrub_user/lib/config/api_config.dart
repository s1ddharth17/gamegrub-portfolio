import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String _overrideBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const String _overrideRootUrl = String.fromEnvironment(
    'API_ROOT_URL',
    defaultValue: '',
  );
  static const String _overrideHost = String.fromEnvironment(
    'API_HOST',
    defaultValue: '',
  );

  static String get baseUrl {
    if (_overrideBaseUrl.isNotEmpty) {
      return _normalizeApiBaseUrl(_overrideBaseUrl);
    }

    if (_overrideRootUrl.isNotEmpty) {
      return '${_normalizeRootUrl(_overrideRootUrl)}/api';
    }

    if (_overrideHost.isNotEmpty) {
      return 'http://${_overrideHost.trim()}:3001/api';
    }

    return '${_defaultRootUrl()}/api';
  }

  static String get rootUrl {
    if (_overrideRootUrl.isNotEmpty) {
      return _normalizeRootUrl(_overrideRootUrl);
    }

    if (_overrideBaseUrl.isNotEmpty) {
      return _normalizeApiBaseUrl(
        _overrideBaseUrl,
      ).replaceFirst(RegExp(r'/api$'), '');
    }

    if (_overrideHost.isNotEmpty) {
      return 'http://${_overrideHost.trim()}:3001';
    }

    return _defaultRootUrl();
  }

  static String resolveUpload(String? image) {
    final normalized = image?.trim() ?? '';

    if (normalized.isEmpty) {
      return '';
    }

    final lowerCased = normalized.toLowerCase();
    if (lowerCased.startsWith('http://') ||
        lowerCased.startsWith('https://') ||
        lowerCased.startsWith('data:') ||
        lowerCased.startsWith('blob:')) {
      return normalized;
    }

    final sanitized = normalized.replaceFirst(RegExp(r'^/+'), '');
    if (sanitized.startsWith('uploads/')) {
      return '$rootUrl/$sanitized';
    }

    return '$rootUrl/uploads/$sanitized';
  }

  static String _defaultRootUrl() {
    final hostedWebOrigin = inferHostedWebOrigin(Uri.base);
    if (hostedWebOrigin != null) {
      return hostedWebOrigin;
    }

    final isDesktop = <TargetPlatform>{
      TargetPlatform.windows,
      TargetPlatform.linux,
      TargetPlatform.macOS,
    }.contains(defaultTargetPlatform);

    final host = kIsWeb || isDesktop ? 'localhost' : '10.0.2.2';
    return 'http://$host:3001';
  }

  static String? inferHostedWebOrigin(Uri baseUri, {bool webEnabled = kIsWeb}) {
    if (!webEnabled) {
      return null;
    }

    final scheme = baseUri.scheme.trim().toLowerCase();
    final host = baseUri.host.trim().toLowerCase();

    if ((scheme != 'http' && scheme != 'https') || _isLocalHost(host)) {
      return null;
    }

    return '$scheme://${baseUri.authority}';
  }

  static bool _isLocalHost(String host) {
    return host.isEmpty ||
        host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '::1' ||
        host.endsWith('.local');
  }

  static String _normalizeRootUrl(String value) {
    return value.trim().replaceFirst(RegExp(r'/+$'), '');
  }

  static String _normalizeApiBaseUrl(String value) {
    final normalized = _normalizeRootUrl(value);
    return normalized.endsWith('/api') ? normalized : '$normalized/api';
  }
}
