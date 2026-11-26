import '../services/api_service.dart';

class TournamentService {
  Map<String, String> _authHeaders(String token) => {
    'authorization': 'Bearer $token',
  };

  Future<List> fetchTournaments({int? businessId}) async {
    final response = await ApiService.get(
      '/tournament/all',
      queryParameters: businessId == null
          ? null
          : <String, dynamic>{'business_id': businessId},
    );
    return (response as List?) ?? const [];
  }

  Future<List> fetchMyTournaments({required String token}) async {
    final response = await ApiService.get(
      '/tournament/my',
      headers: _authHeaders(token),
    );
    return (response as List?) ?? const [];
  }

  Future<List> fetchLeaderboard({int limit = 10}) async {
    final response = await ApiService.get(
      '/tournament/leaderboard?limit=$limit',
    );
    return (response as List?) ?? const [];
  }

  Future<List> fetchCommunityPosts({int limit = 8}) async {
    final response = await ApiService.get('/tournament/community?limit=$limit');
    return (response as List?) ?? const [];
  }

  Future<List> fetchMatchHighlights({int limit = 8}) async {
    final response = await ApiService.get(
      '/tournament/highlights',
      queryParameters: <String, dynamic>{'limit': limit},
    );
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> fetchTournamentPlayerProfile({
    required String token,
  }) async {
    final response = await ApiService.get(
      '/tournament/player-profile',
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> updateTournamentPlayerProfile({
    required String token,
    required Map<String, dynamic> profile,
  }) async {
    final response = await ApiService.put(
      '/tournament/player-profile',
      profile,
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<List> fetchPublicTournamentPlayers({
    String game = '',
    String city = '',
    String state = '',
    String skillLevel = '',
    bool lookingForTeam = false,
    int limit = 24,
  }) async {
    final response = await ApiService.get(
      '/tournament/players',
      queryParameters: <String, dynamic>{
        if (game.trim().isNotEmpty) 'game': game.trim(),
        if (city.trim().isNotEmpty) 'city': city.trim(),
        if (state.trim().isNotEmpty) 'state': state.trim(),
        if (skillLevel.trim().isNotEmpty) 'skill_level': skillLevel.trim(),
        if (lookingForTeam) 'looking_for_team': true,
        'limit': limit,
      },
    );
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> toggleCommunityReaction({
    required String token,
    required int postId,
  }) async {
    final response = await ApiService.post(
      '/tournament/community/$postId/reaction',
      const {},
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> reportCommunityPost({
    required String token,
    required int postId,
    required String reason,
    String details = '',
  }) async {
    final response = await ApiService.post(
      '/tournament/community/$postId/report',
      <String, dynamic>{
        'reason': reason,
        if (details.trim().isNotEmpty) 'details': details.trim(),
      },
      headers: _authHeaders(token),
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> fetchTournamentDetails({
    required String slugOrId,
  }) async {
    final encodedSlugOrId = Uri.encodeComponent(slugOrId.trim());
    final response = await ApiService.get(
      '/tournament/details/$encodedSlugOrId',
    );
    return Map<String, dynamic>.from(response as Map);
  }

  Future<List> fetchTeams({required String token}) async {
    final response = await ApiService.get(
      '/tournament/teams',
      headers: _authHeaders(token),
    );
    return (response as List?) ?? const [];
  }

  Future<List> fetchTeamInvites({required String token}) async {
    final response = await ApiService.get(
      '/tournament/team-invites',
      headers: _authHeaders(token),
    );
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> saveTeam({
    required String token,
    int? teamId,
    required String teamName,
    String? teamTag,
    String? preferredGame,
    String? teamBio,
    List<Map<String, dynamic>> roster = const [],
  }) async {
    final payload = {
      'team_name': teamName.trim(),
      if (teamTag?.trim().isNotEmpty ?? false) 'team_tag': teamTag!.trim(),
      if (preferredGame?.trim().isNotEmpty ?? false)
        'preferred_game': preferredGame!.trim(),
      if (teamBio?.trim().isNotEmpty ?? false) 'team_bio': teamBio!.trim(),
      'roster': roster,
    };

    final response = teamId == null
        ? await ApiService.post(
            '/tournament/teams',
            payload,
            headers: _authHeaders(token),
          )
        : await ApiService.put(
            '/tournament/teams/$teamId',
            payload,
            headers: _authHeaders(token),
          );

    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> sendTeamInvite({
    required String token,
    required int teamId,
    required int teamMemberId,
    String message = '',
  }) async {
    final response =
        await ApiService.post('/tournament/teams/$teamId/invites', {
          'team_member_id': teamMemberId,
          if (message.trim().isNotEmpty) 'message': message.trim(),
        }, headers: _authHeaders(token));

    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> respondToTeamInvite({
    required String token,
    required int inviteId,
    required bool accept,
  }) async {
    final response = await ApiService.post(
      '/tournament/team-invites/$inviteId/respond',
      {'action': accept ? 'accept' : 'decline'},
      headers: _authHeaders(token),
    );

    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> registerForTournament({
    required String token,
    required int tournamentId,
    int? teamId,
    String? teamName,
    List<Map<String, dynamic>> roster = const [],
    bool premiumAccess = false,
    String? paymentMethod,
    String? paymentReference,
    String? paymentNotes,
  }) async {
    final payload = <String, dynamic>{'tournament_id': tournamentId};

    if (teamId != null) {
      payload['team_id'] = teamId;
    }

    if (teamName != null && teamName.trim().isNotEmpty) {
      payload['team_name'] = teamName.trim();
    }

    if (roster.isNotEmpty) {
      payload['roster'] = roster;
    }

    if (premiumAccess) {
      payload['premium_access'] = true;
    }

    if (paymentMethod != null && paymentMethod.trim().isNotEmpty) {
      payload['payment_method'] = paymentMethod.trim();
    }

    if (paymentReference != null && paymentReference.trim().isNotEmpty) {
      payload['payment_reference'] = paymentReference.trim();
    }

    if (paymentNotes != null && paymentNotes.trim().isNotEmpty) {
      payload['payment_notes'] = paymentNotes.trim();
    }

    final response = await ApiService.post(
      '/tournament/register',
      payload,
      headers: _authHeaders(token),
    );

    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> withdrawFromTournament({
    required String token,
    required int tournamentId,
    String? refundNotes,
  }) async {
    final response = await ApiService.post('/tournament/withdraw', {
      'tournament_id': tournamentId,
      if (refundNotes != null && refundNotes.trim().isNotEmpty)
        'refund_notes': refundNotes.trim(),
    }, headers: _authHeaders(token));

    return Map<String, dynamic>.from(response as Map);
  }

  Future<Map<String, dynamic>> fetchBracket({required int tournamentId}) async {
    final response = await ApiService.get('/tournament/$tournamentId/bracket');
    return Map<String, dynamic>.from(response as Map);
  }

  Future<List> fetchNotifications({
    required String token,
    int? tournamentId,
  }) async {
    final query = tournamentId == null
        ? '/tournament/notifications'
        : '/tournament/notifications?tournament_id=$tournamentId';
    final response = await ApiService.get(query, headers: _authHeaders(token));
    return (response as List?) ?? const [];
  }

  Future<Map<String, dynamic>> markNotificationRead({
    required String token,
    required int notificationId,
  }) async {
    final response = await ApiService.post(
      '/tournament/notifications/$notificationId/read',
      const {},
      headers: _authHeaders(token),
    );

    return Map<String, dynamic>.from(response as Map);
  }
}
