import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_service.dart';

class AuthService {
  Future<dynamic> login(String email, String password) async {
    return ApiService.post("/user/login", {
      "email": email,
      "password": password,
    });
  }

  Future<dynamic> refreshSession(String refreshToken) async {
    return ApiService.post("/user/refresh", {"refresh_token": refreshToken});
  }

  Future<dynamic> fetchProfile(String token) async {
    return ApiService.get(
      "/user/profile",
      headers: {"authorization": "Bearer $token"},
    );
  }

  Future<dynamic> logout(String token) async {
    return ApiService.postWithHeaders(
      "/user/logout",
      const {},
      headers: {"authorization": "Bearer $token"},
    );
  }

  Future<dynamic> register(
    String name,
    String email,
    String mobile,
    String password,
  ) async {
    return ApiService.post("/user/register", {
      "name": name,
      "email": email,
      "mobile": mobile,
      "password": password,
    });
  }

  Future<dynamic> verifyRegistrationOtp({
    required String email,
    required String verificationToken,
    required String otp,
  }) async {
    return ApiService.post("/user/register/verify-otp", {
      "email": email,
      "verification_token": verificationToken,
      "otp": otp,
    });
  }

  Future<dynamic> requestPasswordResetOtp({
    required String email,
    required String newPassword,
  }) async {
    return ApiService.post("/user/forgot-password/request-otp", {
      "email": email,
      "new_password": newPassword,
    });
  }

  Future<dynamic> verifyPasswordResetOtp({
    required String email,
    required String verificationToken,
    required String otp,
  }) async {
    return ApiService.post("/user/forgot-password/verify-otp", {
      "email": email,
      "verification_token": verificationToken,
      "otp": otp,
    });
  }

  Future<dynamic> requestPasswordChangeOtp({
    required String token,
    required String currentPassword,
    required String newPassword,
  }) async {
    return ApiService.postWithHeaders(
      "/user/password-change/request-otp",
      {"current_password": currentPassword, "new_password": newPassword},
      headers: {"authorization": "Bearer $token"},
    );
  }

  Future<dynamic> verifyPasswordChangeOtp({
    required String token,
    required String verificationToken,
    required String otp,
  }) async {
    return ApiService.postWithHeaders(
      "/user/password-change/verify-otp",
      {"verification_token": verificationToken, "otp": otp},
      headers: {"authorization": "Bearer $token"},
    );
  }

  Future<dynamic> updateProfile({
    required String token,
    required String name,
    required String email,
    required String mobile,
    String gamerTag = "",
    String favoriteGame = "",
    String playerBio = "",
    String dateOfBirth = "",
    Uint8List? avatarBytes,
    String? avatarFileName,
    bool removeAvatar = false,
  }) async {
    final files = <http.MultipartFile>[];

    if (avatarBytes != null && avatarBytes.isNotEmpty) {
      files.add(
        http.MultipartFile.fromBytes(
          "avatar",
          avatarBytes,
          filename: avatarFileName != null && avatarFileName.trim().isNotEmpty
              ? avatarFileName.trim()
              : "avatar.jpg",
        ),
      );
    }

    return ApiService.multipart(
      "PUT",
      "/user/profile",
      headers: {"authorization": "Bearer $token"},
      fields: {
        "name": name,
        "email": email,
        "mobile": mobile,
        "gamer_tag": gamerTag,
        "favorite_game": favoriteGame,
        "player_bio": playerBio,
        "date_of_birth": dateOfBirth,
        if (removeAvatar) "remove_avatar": "true",
      },
      files: files,
    );
  }
}
