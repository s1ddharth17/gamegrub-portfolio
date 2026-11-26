import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class ApiException implements Exception {
  final String message;

  ApiException(this.message);

  @override
  String toString() => message;
}

class ApiService {
  static const Duration _requestTimeout = Duration(seconds: 12);

  static Future<dynamic> get(
    String endpoint, {
    Map<String, dynamic>? queryParameters,
    Map<String, String>? headers,
  }) async {
    final response = await http
        .get(
          _buildUri(endpoint, queryParameters: queryParameters),
          headers: headers,
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  static Future<Uint8List> getBytes(
    String endpoint, {
    Map<String, String>? headers,
  }) async {
    final response = await http
        .get(_buildUri(endpoint), headers: headers)
        .timeout(_requestTimeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      _decode(response);
    }
    return response.bodyBytes;
  }

  static Future<dynamic> post(
    String endpoint,
    Map<String, dynamic> data, {
    Map<String, String>? headers,
  }) async {
    final response = await http
        .post(
          _buildUri(endpoint),
          headers: {
            "Content-Type": "application/json",
            ...?headers,
          },
          body: jsonEncode(data),
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  static Future<dynamic> postWithHeaders(
    String endpoint,
    Map<String, dynamic> data, {
    Map<String, String>? headers,
  }) async {
    return post(endpoint, data, headers: headers);
  }

  static Future<dynamic> put(
    String endpoint,
    Map<String, dynamic> data, {
    Map<String, String>? headers,
  }) async {
    final response = await http
        .put(
          _buildUri(endpoint),
          headers: {
            "Content-Type": "application/json",
            ...?headers,
          },
          body: jsonEncode(data),
        )
        .timeout(_requestTimeout);
    return _decode(response);
  }

  static Future<dynamic> delete(
    String endpoint, {
    Map<String, String>? headers,
  }) async {
    final response = await http
        .delete(_buildUri(endpoint), headers: headers)
        .timeout(_requestTimeout);
    return _decode(response);
  }

  static Future<dynamic> multipart(
    String method,
    String endpoint, {
    Map<String, String>? headers,
    Map<String, String>? fields,
    List<http.MultipartFile>? files,
  }) async {
    final request = http.MultipartRequest(method, _buildUri(endpoint));

    if (headers != null) {
      request.headers.addAll(headers);
    }

    if (fields != null) {
      request.fields.addAll(fields);
    }

    if (files != null && files.isNotEmpty) {
      request.files.addAll(files);
    }

    final streamedResponse = await request.send().timeout(_requestTimeout);
    final response = await http.Response.fromStream(
      streamedResponse,
    ).timeout(_requestTimeout);

    return _decode(response);
  }

  static Uri _buildUri(
    String endpoint, {
    Map<String, dynamic>? queryParameters,
  }) {
    final normalizedEndpoint = endpoint.startsWith('/')
        ? endpoint
        : '/$endpoint';
    final baseUri = Uri.parse(ApiConfig.baseUrl);

    return baseUri.replace(
      path: '${baseUri.path}$normalizedEndpoint',
      queryParameters: queryParameters?.map(
        (key, value) => MapEntry(key, value.toString()),
      ),
    );
  }

  static dynamic _decode(http.Response response) {
    final body = response.body.trim();
    dynamic data;

    if (body.isEmpty) {
      data = null;
    } else {
      try {
        data = jsonDecode(body);
      } on FormatException {
        data = body;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 401) {
        throw ApiException(
          _extractMessage(data) ?? 'Session expired. Please log in again.',
        );
      }

      final message =
          _extractMessage(data) ??
          'Request failed with status ${response.statusCode}';
      throw ApiException(message);
    }

    return data;
  }

  static String? _extractMessage(dynamic data) {
    if (data is Map<String, dynamic>) {
      final message = data['message'] ?? data['error'];
      if (message != null) {
        return message.toString();
      }
    }

    if (data is String) {
      final trimmed = data.trim();
      if (trimmed.isEmpty) {
        return null;
      }

      if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
        return 'Server returned an unexpected HTML error page. Check the backend logs.';
      }

      return trimmed;
    }

    return null;
  }
}
