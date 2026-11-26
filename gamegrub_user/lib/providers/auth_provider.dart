import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';
import '../services/auth_service.dart';

class AuthProvider with ChangeNotifier {
  static const _tokenKey = 'auth_token';
  static const _refreshTokenKey = 'auth_refresh_token';
  static const _userKey = 'auth_user';

  final AuthService _authService = AuthService();
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  String? token;
  String? refreshToken;
  AppUser? user;
  bool isLoading = false;
  String? errorMessage;

  String? _pendingRegistrationToken;
  String? _pendingRegistrationEmail;
  String? _registrationDevelopmentOtp;

  String? _pendingPasswordResetToken;
  String? _pendingPasswordResetEmail;
  String? _passwordResetDevelopmentOtp;

  String? _pendingPasswordChangeToken;
  String? _passwordChangeDevelopmentOtp;

  bool get isLoggedIn =>
      token != null && user != null && !_isTokenExpired(token!);
  bool get hasPendingRegistration =>
      _pendingRegistrationToken != null && _pendingRegistrationEmail != null;
  bool get hasPendingPasswordReset =>
      _pendingPasswordResetToken != null && _pendingPasswordResetEmail != null;
  bool get hasPendingPasswordChange => _pendingPasswordChangeToken != null;

  String? get pendingRegistrationEmail => _pendingRegistrationEmail;
  String? get registrationDevelopmentOtp => _registrationDevelopmentOtp;
  String? get pendingPasswordResetEmail => _pendingPasswordResetEmail;
  String? get passwordResetDevelopmentOtp => _passwordResetDevelopmentOtp;
  String? get passwordChangeDevelopmentOtp => _passwordChangeDevelopmentOtp;

  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedToken = await _secureStorage.read(key: _tokenKey);
    final savedRefreshToken = await _secureStorage.read(key: _refreshTokenKey);
    final savedUser = prefs.getString(_userKey);

    if ((savedToken == null && savedRefreshToken == null) ||
        savedUser == null) {
      notifyListeners();
      return;
    }

    try {
      final decodedUser = jsonDecode(savedUser);
      if (decodedUser is! Map) {
        throw const FormatException('Invalid saved auth user.');
      }

      final restoredUser = AppUser.fromJson(
        Map<String, dynamic>.from(decodedUser),
      );

      if (savedToken != null &&
          savedToken.isNotEmpty &&
          !_isTokenExpired(savedToken)) {
        token = savedToken;
        refreshToken = savedRefreshToken;
        user = restoredUser;
        errorMessage = null;
        notifyListeners();
        return;
      }

      if (savedRefreshToken == null || savedRefreshToken.isEmpty) {
        token = null;
        refreshToken = null;
        user = null;
        await _clearSession();
        notifyListeners();
        return;
      }

      final refreshedSession = await _authService.refreshSession(
        savedRefreshToken,
      );
      final nextToken = refreshedSession['token']?.toString();
      final nextRefreshToken = refreshedSession['refresh_token']?.toString();
      final nextUserJson = refreshedSession['user'];

      if (nextToken == null ||
          nextToken.isEmpty ||
          nextRefreshToken == null ||
          nextRefreshToken.isEmpty ||
          nextUserJson is! Map) {
        throw const FormatException('Invalid refresh response.');
      }

      token = nextToken;
      refreshToken = nextRefreshToken;
      user = AppUser.fromJson(Map<String, dynamic>.from(nextUserJson));
      await _persistSession();
      errorMessage = null;
    } catch (_) {
      token = null;
      refreshToken = null;
      user = null;
      await _clearSession();
    }

    notifyListeners();
  }

  void clearError() {
    errorMessage = null;
    notifyListeners();
  }

  void clearPendingRegistration() {
    _pendingRegistrationToken = null;
    _pendingRegistrationEmail = null;
    _registrationDevelopmentOtp = null;
    notifyListeners();
  }

  void clearPendingPasswordReset() {
    _pendingPasswordResetToken = null;
    _pendingPasswordResetEmail = null;
    _passwordResetDevelopmentOtp = null;
    notifyListeners();
  }

  void clearPendingPasswordChange() {
    _pendingPasswordChangeToken = null;
    _passwordChangeDevelopmentOtp = null;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final res = await _authService.login(email, password);

      if (res['token'] != null &&
          res['refresh_token'] != null &&
          res['user'] != null) {
        token = res['token'].toString();
        refreshToken = res['refresh_token']?.toString();
        user = AppUser.fromJson(Map<String, dynamic>.from(res['user'] as Map));
        await _persistSession();
        return true;
      }

      errorMessage = 'Invalid login response from server.';
      return false;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> register(
    String name,
    String email,
    String mobile,
    String password,
  ) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final res = await _authService.register(name, email, mobile, password);
      final verificationToken = res['verification_token']?.toString();

      if (verificationToken == null || verificationToken.isEmpty) {
        errorMessage =
            'Invalid registration verification response from server.';
        return false;
      }

      _pendingRegistrationToken = verificationToken;
      _pendingRegistrationEmail = email.trim();
      _registrationDevelopmentOtp = res['development_otp']?.toString();
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> verifyRegistrationOtp(String otp) async {
    final verificationToken = _pendingRegistrationToken;
    final email = _pendingRegistrationEmail;

    if (verificationToken == null || email == null) {
      errorMessage =
          'Registration verification has expired. Please request a new code.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      await _authService.verifyRegistrationOtp(
        email: email,
        verificationToken: verificationToken,
        otp: otp,
      );

      _pendingRegistrationToken = null;
      _pendingRegistrationEmail = null;
      _registrationDevelopmentOtp = null;
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> requestPasswordResetOtp({
    required String email,
    required String newPassword,
  }) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final res = await _authService.requestPasswordResetOtp(
        email: email,
        newPassword: newPassword,
      );
      final verificationToken = res['verification_token']?.toString();

      if (verificationToken == null || verificationToken.isEmpty) {
        errorMessage =
            'Invalid password reset verification response from server.';
        return false;
      }

      _pendingPasswordResetToken = verificationToken;
      _pendingPasswordResetEmail = email.trim();
      _passwordResetDevelopmentOtp = res['development_otp']?.toString();
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> verifyPasswordResetOtp(String otp) async {
    final verificationToken = _pendingPasswordResetToken;
    final email = _pendingPasswordResetEmail;

    if (verificationToken == null || email == null) {
      errorMessage =
          'Password reset verification has expired. Please request a new code.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      await _authService.verifyPasswordResetOtp(
        email: email,
        verificationToken: verificationToken,
        otp: otp,
      );

      _pendingPasswordResetToken = null;
      _pendingPasswordResetEmail = null;
      _passwordResetDevelopmentOtp = null;
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> requestPasswordChangeOtp({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (token == null || user == null) {
      errorMessage = 'Please log in again to change your password.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final res = await _authService.requestPasswordChangeOtp(
        token: token!,
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      final verificationToken = res['verification_token']?.toString();

      if (verificationToken == null || verificationToken.isEmpty) {
        errorMessage =
            'Invalid password change verification response from server.';
        return false;
      }

      _pendingPasswordChangeToken = verificationToken;
      _passwordChangeDevelopmentOtp = res['development_otp']?.toString();
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> verifyPasswordChangeOtp(String otp) async {
    if (token == null || user == null) {
      errorMessage = 'Please log in again to change your password.';
      notifyListeners();
      return false;
    }

    final verificationToken = _pendingPasswordChangeToken;

    if (verificationToken == null) {
      errorMessage =
          'Password change verification has expired. Please request a new code.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      await _authService.verifyPasswordChangeOtp(
        token: token!,
        verificationToken: verificationToken,
        otp: otp,
      );

      _pendingPasswordChangeToken = null;
      _passwordChangeDevelopmentOtp = null;
      return true;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateProfile({
    required String name,
    required String email,
    required String mobile,
    String gamerTag = '',
    String favoriteGame = '',
    String playerBio = '',
    String dateOfBirth = '',
    Uint8List? avatarBytes,
    String? avatarFileName,
    bool removeAvatar = false,
  }) async {
    if (token == null || user == null) {
      errorMessage = 'Please log in again to update your profile.';
      notifyListeners();
      return false;
    }

    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final res = await _authService.updateProfile(
        token: token!,
        name: name,
        email: email,
        mobile: mobile,
        gamerTag: gamerTag,
        favoriteGame: favoriteGame,
        playerBio: playerBio,
        dateOfBirth: dateOfBirth,
        avatarBytes: avatarBytes,
        avatarFileName: avatarFileName,
        removeAvatar: removeAvatar,
      );

      if (res['user'] != null) {
        user = AppUser.fromJson(Map<String, dynamic>.from(res['user'] as Map));
        await _persistSession();
        return true;
      }

      errorMessage = 'Invalid profile update response from server.';
      return false;
    } catch (e) {
      errorMessage = e.toString();
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> refreshProfile() async {
    if (token == null || token!.isEmpty) {
      errorMessage = 'Please log in again to load your profile.';
      notifyListeners();
      return false;
    }

    try {
      final res = await _authService.fetchProfile(token!);
      final userJson = res['user'];

      if (userJson is! Map) {
        errorMessage = 'Invalid profile response from server.';
        notifyListeners();
        return false;
      }

      user = AppUser.fromJson(Map<String, dynamic>.from(userJson));
      await _persistSession();
      errorMessage = null;
      notifyListeners();
      return true;
    } catch (e) {
      errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> logout({bool revokeServerSession = true}) async {
    final currentToken = token;

    if (revokeServerSession &&
        currentToken != null &&
        currentToken.isNotEmpty &&
        !_isTokenExpired(currentToken)) {
      try {
        await _authService.logout(currentToken);
      } catch (_) {
        // Clear local state even if the server session is already invalid.
      }
    }

    token = null;
    refreshToken = null;
    user = null;
    errorMessage = null;
    _pendingRegistrationToken = null;
    _pendingRegistrationEmail = null;
    _registrationDevelopmentOtp = null;
    _pendingPasswordResetToken = null;
    _pendingPasswordResetEmail = null;
    _passwordResetDevelopmentOtp = null;
    _pendingPasswordChangeToken = null;
    _passwordChangeDevelopmentOtp = null;
    notifyListeners();
    await _clearSession();
  }

  void syncUser(AppUser updatedUser) {
    user = updatedUser;
    notifyListeners();
    _persistSession();
  }

  Future<void> _persistSession() async {
    if (token == null || user == null) {
      await _clearSession();
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await _secureStorage.write(key: _tokenKey, value: token!);
    if (refreshToken != null && refreshToken!.isNotEmpty) {
      await _secureStorage.write(key: _refreshTokenKey, value: refreshToken!);
    } else {
      await _secureStorage.delete(key: _refreshTokenKey);
    }
    await prefs.setString(_userKey, jsonEncode(user!.toJson()));
  }

  Future<void> _clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await _secureStorage.delete(key: _tokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    await prefs.remove(_userKey);
  }

  bool _isTokenExpired(String rawToken) {
    try {
      final segments = rawToken.split('.');
      if (segments.length < 2) {
        return true;
      }

      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(segments[1]))),
      );

      if (payload is! Map) {
        return true;
      }

      final exp = payload['exp'];
      final expirySeconds = exp is num ? exp.toInt() : int.tryParse('$exp');

      if (expirySeconds == null) {
        return false;
      }

      final nowSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      return nowSeconds >= expirySeconds;
    } catch (_) {
      return true;
    }
  }
}
