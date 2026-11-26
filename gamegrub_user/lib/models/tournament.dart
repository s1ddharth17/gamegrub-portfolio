import '../config/api_config.dart';

class TournamentRosterMember {
  final int memberId;
  final int slotNumber;
  final String memberName;
  final String memberEmail;
  final String memberMobile;
  final bool isCaptain;

  const TournamentRosterMember({
    required this.memberId,
    required this.slotNumber,
    required this.memberName,
    required this.memberEmail,
    required this.memberMobile,
    required this.isCaptain,
  });

  factory TournamentRosterMember.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    bool toBool(dynamic value, [bool fallback = false]) {
      if (value is bool) {
        return value;
      }
      if (value is num) {
        return value == 1;
      }

      final normalized = '${value ?? ''}'.trim().toLowerCase();
      if (normalized.isEmpty) {
        return fallback;
      }

      return normalized == 'true' || normalized == '1' || normalized == 'yes';
    }

    return TournamentRosterMember(
      memberId: toInt(json['member_id']),
      slotNumber: toInt(json['slot_number'], 1),
      memberName: '${json['member_name'] ?? ''}',
      memberEmail: '${json['member_email'] ?? ''}',
      memberMobile: '${json['member_mobile'] ?? ''}',
      isCaptain: toBool(json['is_captain']),
    );
  }
}

class PersistentTournamentTeamMember {
  final int teamMemberId;
  final int teamId;
  final int? userId;
  final int slotNumber;
  final String memberName;
  final String memberEmail;
  final String memberMobile;
  final bool isCaptain;
  final String membershipStatus;
  final bool isLinked;

  const PersistentTournamentTeamMember({
    required this.teamMemberId,
    required this.teamId,
    required this.userId,
    required this.slotNumber,
    required this.memberName,
    required this.memberEmail,
    required this.memberMobile,
    required this.isCaptain,
    required this.membershipStatus,
    required this.isLinked,
  });

  factory PersistentTournamentTeamMember.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    bool toBool(dynamic value, [bool fallback = false]) {
      if (value is bool) {
        return value;
      }
      if (value is num) {
        return value == 1;
      }

      final normalized = '${value ?? ''}'.trim().toLowerCase();
      if (normalized.isEmpty) {
        return fallback;
      }

      return normalized == 'true' || normalized == '1' || normalized == 'yes';
    }

    return PersistentTournamentTeamMember(
      teamMemberId: toInt(json['team_member_id']),
      teamId: toInt(json['team_id']),
      userId: json['user_id'] == null ? null : toInt(json['user_id']),
      slotNumber: toInt(json['slot_number'], 1),
      memberName: '${json['member_name'] ?? ''}',
      memberEmail: '${json['member_email'] ?? ''}',
      memberMobile: '${json['member_mobile'] ?? ''}',
      isCaptain: toBool(json['is_captain']),
      membershipStatus: '${json['membership_status'] ?? ''}',
      isLinked: toBool(json['is_linked']),
    );
  }

  bool get isAccepted =>
      membershipStatus.trim().toLowerCase() == 'accepted' || isCaptain;

  bool get isPending => membershipStatus.trim().toLowerCase() == 'pending';

  bool get isDeclined => membershipStatus.trim().toLowerCase() == 'declined';
}

class PersistentTournamentTeamInvite {
  final int inviteId;
  final int teamId;
  final int teamMemberId;
  final String invitedEmail;
  final int? invitedUserId;
  final int? invitedByUserId;
  final String status;
  final String message;
  final DateTime? respondedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final PersistentTournamentTeamMember? member;
  final String teamName;
  final String teamTag;
  final String preferredGame;
  final String inviterName;
  final String inviterEmail;

  const PersistentTournamentTeamInvite({
    required this.inviteId,
    required this.teamId,
    required this.teamMemberId,
    required this.invitedEmail,
    required this.invitedUserId,
    required this.invitedByUserId,
    required this.status,
    required this.message,
    required this.respondedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.member,
    required this.teamName,
    required this.teamTag,
    required this.preferredGame,
    required this.inviterName,
    required this.inviterEmail,
  });

  factory PersistentTournamentTeamInvite.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    final teamJson = json['team'] is Map
        ? Map<String, dynamic>.from(json['team'] as Map)
        : const <String, dynamic>{};
    final inviterJson = json['inviter'] is Map
        ? Map<String, dynamic>.from(json['inviter'] as Map)
        : const <String, dynamic>{};
    final memberJson = json['member'] is Map
        ? Map<String, dynamic>.from(json['member'] as Map)
        : null;

    return PersistentTournamentTeamInvite(
      inviteId: toInt(json['invite_id']),
      teamId: toInt(json['team_id']),
      teamMemberId: toInt(json['team_member_id']),
      invitedEmail: '${json['invited_email'] ?? ''}',
      invitedUserId: json['invited_user_id'] == null
          ? null
          : toInt(json['invited_user_id']),
      invitedByUserId: json['invited_by_user_id'] == null
          ? null
          : toInt(json['invited_by_user_id']),
      status: '${json['status'] ?? ''}',
      message: '${json['message'] ?? ''}',
      respondedAt: parseDate(json['responded_at']),
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
      member: memberJson == null
          ? null
          : PersistentTournamentTeamMember.fromJson(memberJson),
      teamName: '${teamJson['team_name'] ?? ''}',
      teamTag: '${teamJson['team_tag'] ?? ''}',
      preferredGame: '${teamJson['preferred_game'] ?? ''}',
      inviterName: '${inviterJson['name'] ?? ''}',
      inviterEmail: '${inviterJson['email'] ?? ''}',
    );
  }

  String get teamDisplayName =>
      teamTag.trim().isNotEmpty ? '$teamName [$teamTag]' : teamName;
}

class PersistentTournamentTeamHistoryEntry {
  final int registrationId;
  final int tournamentId;
  final String tournamentSlug;
  final String tournamentTitle;
  final String gameTitle;
  final String tournamentStatus;
  final String registrationStatus;
  final String attendanceStatus;
  final String teamName;
  final int? seedNumber;
  final String placement;
  final DateTime? registeredAt;
  final DateTime? waitlistedAt;
  final DateTime? waitlistPromotedAt;
  final DateTime? startAt;

  const PersistentTournamentTeamHistoryEntry({
    required this.registrationId,
    required this.tournamentId,
    required this.tournamentSlug,
    required this.tournamentTitle,
    required this.gameTitle,
    required this.tournamentStatus,
    required this.registrationStatus,
    required this.attendanceStatus,
    required this.teamName,
    required this.seedNumber,
    required this.placement,
    required this.registeredAt,
    required this.waitlistedAt,
    required this.waitlistPromotedAt,
    required this.startAt,
  });

  factory PersistentTournamentTeamHistoryEntry.fromJson(
    Map<String, dynamic> json,
  ) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    return PersistentTournamentTeamHistoryEntry(
      registrationId: toInt(json['registration_id']),
      tournamentId: toInt(json['tournament_id']),
      tournamentSlug: '${json['tournament_slug'] ?? ''}',
      tournamentTitle: '${json['tournament_title'] ?? 'Tournament'}',
      gameTitle: '${json['game_title'] ?? ''}',
      tournamentStatus: '${json['tournament_status'] ?? ''}',
      registrationStatus: '${json['registration_status'] ?? ''}',
      attendanceStatus: '${json['attendance_status'] ?? ''}',
      teamName: '${json['team_name'] ?? ''}',
      seedNumber: json['seed_number'] == null
          ? null
          : toInt(json['seed_number']),
      placement: '${json['placement'] ?? ''}',
      registeredAt: parseDate(json['registered_at']),
      waitlistedAt: parseDate(json['waitlisted_at']),
      waitlistPromotedAt: parseDate(json['waitlist_promoted_at']),
      startAt: parseDate(json['start_at']),
    );
  }
}

class PersistentTournamentTeam {
  final int teamId;
  final int ownerUserId;
  final String teamName;
  final String teamTag;
  final String preferredGame;
  final String teamBio;
  final int rosterCount;
  final List<PersistentTournamentTeamMember> members;
  final int totalEntries;
  final int activeEntries;
  final int championshipCount;
  final int runnerUpCount;
  final int totalMatchWins;
  final DateTime? lastRegisteredAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String viewerRole;
  final bool isOwner;
  final int pendingInviteCount;
  final int acceptedMemberCount;
  final List<PersistentTournamentTeamInvite> invites;
  final List<PersistentTournamentTeamHistoryEntry> history;

  const PersistentTournamentTeam({
    required this.teamId,
    required this.ownerUserId,
    required this.teamName,
    required this.teamTag,
    required this.preferredGame,
    required this.teamBio,
    required this.rosterCount,
    required this.members,
    required this.totalEntries,
    required this.activeEntries,
    required this.championshipCount,
    required this.runnerUpCount,
    required this.totalMatchWins,
    required this.lastRegisteredAt,
    required this.createdAt,
    required this.updatedAt,
    required this.viewerRole,
    required this.isOwner,
    required this.pendingInviteCount,
    required this.acceptedMemberCount,
    required this.invites,
    required this.history,
  });

  factory PersistentTournamentTeam.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    return PersistentTournamentTeam(
      teamId: toInt(json['team_id']),
      ownerUserId: toInt(json['owner_user_id']),
      teamName: '${json['team_name'] ?? ''}',
      teamTag: '${json['team_tag'] ?? ''}',
      preferredGame: '${json['preferred_game'] ?? ''}',
      teamBio: '${json['team_bio'] ?? ''}',
      rosterCount: toInt(json['roster_count']),
      members: ((json['members'] as List?) ?? const [])
          .map(
            (item) => PersistentTournamentTeamMember.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
      totalEntries: toInt(json['total_entries']),
      activeEntries: toInt(json['active_entries']),
      championshipCount: toInt(json['championship_count']),
      runnerUpCount: toInt(json['runner_up_count']),
      totalMatchWins: toInt(json['total_match_wins']),
      lastRegisteredAt: parseDate(json['last_registered_at']),
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
      viewerRole: '${json['viewer_role'] ?? 'owner'}',
      isOwner: (json['is_owner'] == true) || '${json['is_owner'] ?? ''}' == '1',
      pendingInviteCount: toInt(json['pending_invite_count']),
      acceptedMemberCount: toInt(json['accepted_member_count']),
      invites: ((json['invites'] as List?) ?? const [])
          .map(
            (item) => PersistentTournamentTeamInvite.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
      history: ((json['history'] as List?) ?? const [])
          .map(
            (item) => PersistentTournamentTeamHistoryEntry.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
    );
  }

  PersistentTournamentTeamMember? get captain {
    for (final member in members) {
      if (member.isCaptain) {
        return member;
      }
    }

    return members.isNotEmpty ? members.first : null;
  }

  List<PersistentTournamentTeamMember> get teammates =>
      members.where((member) => !member.isCaptain).toList();

  bool supportsTeamSize(int teamSize) => rosterCount == teamSize;

  bool get canEdit => isOwner;

  bool get canUseForRegistration => isOwner;

  bool get hasPendingInvites => pendingInviteCount > 0;

  String get displayName =>
      teamTag.trim().isNotEmpty ? '$teamName [$teamTag]' : teamName;

  PersistentTournamentTeamHistoryEntry? get latestHistory =>
      history.isEmpty ? null : history.first;
}

class TournamentBracketEntrant {
  final int registrationId;
  final String participantName;
  final String participantEmail;
  final String participantMobile;
  final String teamName;
  final String registrationType;
  final String attendanceStatus;
  final int rosterCount;
  final int? seedNumber;
  final String displayName;

  const TournamentBracketEntrant({
    required this.registrationId,
    required this.participantName,
    required this.participantEmail,
    required this.participantMobile,
    required this.teamName,
    required this.registrationType,
    required this.attendanceStatus,
    required this.rosterCount,
    required this.seedNumber,
    required this.displayName,
  });

  factory TournamentBracketEntrant.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    final seedValue = json['seed_number'];
    final fallbackDisplayName =
        '${json['team_name'] ?? json['participant_name'] ?? ''}'.trim();

    return TournamentBracketEntrant(
      registrationId: toInt(json['registration_id']),
      participantName: '${json['participant_name'] ?? ''}',
      participantEmail: '${json['participant_email'] ?? ''}',
      participantMobile: '${json['participant_mobile'] ?? ''}',
      teamName: '${json['team_name'] ?? ''}',
      registrationType: '${json['registration_type'] ?? 'solo'}',
      attendanceStatus: '${json['attendance_status'] ?? 'pending'}',
      rosterCount: toInt(json['roster_count']),
      seedNumber: seedValue == null ? null : toInt(seedValue),
      displayName: '${json['display_name'] ?? fallbackDisplayName}',
    );
  }

  String get resolvedDisplayName {
    if (displayName.trim().isNotEmpty) {
      return displayName.trim();
    }

    if (teamName.trim().isNotEmpty) {
      return teamName.trim();
    }

    if (participantName.trim().isNotEmpty) {
      return participantName.trim();
    }

    return 'Awaiting player';
  }
}

class TournamentBracketMatch {
  final int matchId;
  final int tournamentId;
  final int roundNumber;
  final int matchNumber;
  final String roundLabel;
  final String status;
  final int? slotOneScore;
  final int? slotTwoScore;
  final TournamentBracketEntrant? slotOne;
  final TournamentBracketEntrant? slotTwo;
  final int? winnerRegistrationId;
  final int? loserRegistrationId;
  final TournamentBracketEntrant? winner;
  final TournamentBracketEntrant? loser;
  final String notes;
  final DateTime? completedAt;
  final bool isDecided;
  final bool isWalkover;
  final bool canReportResult;

  const TournamentBracketMatch({
    required this.matchId,
    required this.tournamentId,
    required this.roundNumber,
    required this.matchNumber,
    required this.roundLabel,
    required this.status,
    required this.slotOneScore,
    required this.slotTwoScore,
    required this.slotOne,
    required this.slotTwo,
    required this.winnerRegistrationId,
    required this.loserRegistrationId,
    required this.winner,
    required this.loser,
    required this.notes,
    required this.completedAt,
    required this.isDecided,
    required this.isWalkover,
    required this.canReportResult,
  });

  factory TournamentBracketMatch.fromJson(Map<String, dynamic> json) {
    int? toNullableInt(dynamic value) {
      if (value == null) {
        return null;
      }

      return int.tryParse('$value');
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    TournamentBracketEntrant? parseEntrant(dynamic value) {
      if (value is! Map) {
        return null;
      }

      return TournamentBracketEntrant.fromJson(
        Map<String, dynamic>.from(value),
      );
    }

    return TournamentBracketMatch(
      matchId: toNullableInt(json['match_id']) ?? 0,
      tournamentId: toNullableInt(json['tournament_id']) ?? 0,
      roundNumber: toNullableInt(json['round_number']) ?? 1,
      matchNumber: toNullableInt(json['match_number']) ?? 1,
      roundLabel: '${json['round_label'] ?? 'Round'}',
      status: '${json['status'] ?? 'pending'}',
      slotOneScore: toNullableInt(json['slot_one_score']),
      slotTwoScore: toNullableInt(json['slot_two_score']),
      slotOne: parseEntrant(json['slot_one']),
      slotTwo: parseEntrant(json['slot_two']),
      winnerRegistrationId: toNullableInt(json['winner_registration_id']),
      loserRegistrationId: toNullableInt(json['loser_registration_id']),
      winner: parseEntrant(json['winner']),
      loser: parseEntrant(json['loser']),
      notes: '${json['notes'] ?? ''}',
      completedAt: parseDate(json['completed_at']),
      isDecided:
          json['is_decided'] == true || '${json['is_decided']}' == 'true',
      isWalkover:
          json['is_walkover'] == true || '${json['is_walkover']}' == 'true',
      canReportResult:
          json['can_report_result'] == true ||
          '${json['can_report_result']}' == 'true',
    );
  }

  String get matchLabel => '$roundLabel | Match $matchNumber';
}

class TournamentBracketRound {
  final int roundNumber;
  final String label;
  final List<TournamentBracketMatch> matches;

  const TournamentBracketRound({
    required this.roundNumber,
    required this.label,
    required this.matches,
  });

  factory TournamentBracketRound.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    return TournamentBracketRound(
      roundNumber: toInt(json['round_number'], 1),
      label: '${json['label'] ?? 'Round'}',
      matches: ((json['matches'] as List?) ?? const [])
          .map(
            (item) => TournamentBracketMatch.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
    );
  }
}

class TournamentBracket {
  final int tournamentId;
  final bool hasBracket;
  final int matchCount;
  final int completedMatchCount;
  final int roundCount;
  final int? championRegistrationId;
  final TournamentBracketEntrant? champion;
  final List<TournamentBracketRound> rounds;

  const TournamentBracket({
    required this.tournamentId,
    required this.hasBracket,
    required this.matchCount,
    required this.completedMatchCount,
    required this.roundCount,
    required this.championRegistrationId,
    required this.champion,
    required this.rounds,
  });

  factory TournamentBracket.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    return TournamentBracket(
      tournamentId: toInt(json['tournament_id']),
      hasBracket:
          json['has_bracket'] == true || '${json['has_bracket']}' == 'true',
      matchCount: toInt(json['match_count']),
      completedMatchCount: toInt(json['completed_match_count']),
      roundCount: toInt(json['round_count']),
      championRegistrationId: json['champion_registration_id'] == null
          ? null
          : toInt(json['champion_registration_id']),
      champion: json['champion'] is Map
          ? TournamentBracketEntrant.fromJson(
              Map<String, dynamic>.from(json['champion'] as Map),
            )
          : null,
      rounds: ((json['rounds'] as List?) ?? const [])
          .map(
            (item) => TournamentBracketRound.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
    );
  }

  bool get isComplete =>
      hasBracket && matchCount > 0 && completedMatchCount >= matchCount;
}

class TournamentLeaderboardEntry {
  final int userId;
  final String name;
  final String gamerTag;
  final String displayName;
  final String avatar;
  final String favoriteGame;
  final String mostPlayedTournamentGame;
  final int tournamentEntries;
  final int tournamentsCheckedIn;
  final int tournamentsNoShow;
  final int tournamentMatchesPlayed;
  final int tournamentMatchWins;
  final int tournamentMatchLosses;
  final int tournamentChampionships;
  final int tournamentRunnerUpFinishes;
  final int tournamentPoints;
  final int? tournamentRank;
  final double tournamentWinRate;
  final DateTime? lastTournamentAt;

  const TournamentLeaderboardEntry({
    required this.userId,
    required this.name,
    required this.gamerTag,
    required this.displayName,
    required this.avatar,
    required this.favoriteGame,
    required this.mostPlayedTournamentGame,
    required this.tournamentEntries,
    required this.tournamentsCheckedIn,
    required this.tournamentsNoShow,
    required this.tournamentMatchesPlayed,
    required this.tournamentMatchWins,
    required this.tournamentMatchLosses,
    required this.tournamentChampionships,
    required this.tournamentRunnerUpFinishes,
    required this.tournamentPoints,
    required this.tournamentRank,
    required this.tournamentWinRate,
    required this.lastTournamentAt,
  });

  factory TournamentLeaderboardEntry.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    double toDouble(dynamic value, [double fallback = 0]) {
      return double.tryParse('${value ?? fallback}') ?? fallback;
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    return TournamentLeaderboardEntry(
      userId: toInt(json['uid'] ?? json['user_id']),
      name: '${json['name'] ?? 'Player'}',
      gamerTag: '${json['gamer_tag'] ?? ''}',
      displayName:
          '${json['display_name'] ?? json['gamer_tag'] ?? json['name'] ?? 'Player'}',
      avatar: '${json['avatar'] ?? ''}',
      favoriteGame: '${json['favorite_game'] ?? ''}',
      mostPlayedTournamentGame: '${json['most_played_tournament_game'] ?? ''}',
      tournamentEntries: toInt(json['tournament_entries']),
      tournamentsCheckedIn: toInt(json['tournaments_checked_in']),
      tournamentsNoShow: toInt(json['tournaments_no_show']),
      tournamentMatchesPlayed: toInt(json['tournament_matches_played']),
      tournamentMatchWins: toInt(json['tournament_match_wins']),
      tournamentMatchLosses: toInt(json['tournament_match_losses']),
      tournamentChampionships: toInt(json['tournament_championships']),
      tournamentRunnerUpFinishes: toInt(json['tournament_runner_up_finishes']),
      tournamentPoints: toInt(json['tournament_points']),
      tournamentRank: json['tournament_rank'] == null
          ? null
          : toInt(json['tournament_rank']),
      tournamentWinRate: toDouble(json['tournament_win_rate']),
      lastTournamentAt: parseDate(json['last_tournament_at']),
    );
  }

  String get resolvedDisplayName {
    if (displayName.trim().isNotEmpty) {
      return displayName.trim();
    }

    if (gamerTag.trim().isNotEmpty) {
      return gamerTag.trim();
    }

    return name.trim().isNotEmpty ? name.trim() : 'Player';
  }
}

class TournamentNotification {
  final int notificationId;
  final int campaignId;
  final int tournamentId;
  final int? registrationId;
  final String eventType;
  final String title;
  final String message;
  final String emailStatus;
  final bool isRead;
  final DateTime? readAt;
  final DateTime? createdAt;
  final String tournamentSlug;
  final String tournamentTitle;
  final String tournamentGameTitle;
  final String tournamentStatus;
  final DateTime? tournamentStartAt;

  const TournamentNotification({
    required this.notificationId,
    required this.campaignId,
    required this.tournamentId,
    required this.registrationId,
    required this.eventType,
    required this.title,
    required this.message,
    required this.emailStatus,
    required this.isRead,
    required this.readAt,
    required this.createdAt,
    required this.tournamentSlug,
    required this.tournamentTitle,
    required this.tournamentGameTitle,
    required this.tournamentStatus,
    required this.tournamentStartAt,
  });

  factory TournamentNotification.fromJson(Map<String, dynamic> json) {
    int? toNullableInt(dynamic value) {
      if (value == null) {
        return null;
      }

      return int.tryParse('$value');
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    final tournamentJson = json['tournament'] is Map
        ? Map<String, dynamic>.from(json['tournament'] as Map)
        : const <String, dynamic>{};

    return TournamentNotification(
      notificationId: toNullableInt(json['notification_id']) ?? 0,
      campaignId: toNullableInt(json['campaign_id']) ?? 0,
      tournamentId: toNullableInt(json['tournament_id']) ?? 0,
      registrationId: toNullableInt(json['registration_id']),
      eventType: '${json['event_type'] ?? 'announcement'}',
      title: '${json['title'] ?? ''}',
      message: '${json['message'] ?? ''}',
      emailStatus: '${json['email_status'] ?? 'skipped'}',
      isRead: json['is_read'] == true || '${json['is_read']}' == 'true',
      readAt: parseDate(json['read_at']),
      createdAt: parseDate(json['created_at']),
      tournamentSlug: '${tournamentJson['slug'] ?? ''}',
      tournamentTitle: '${tournamentJson['title'] ?? ''}',
      tournamentGameTitle: '${tournamentJson['game_title'] ?? ''}',
      tournamentStatus: '${tournamentJson['status'] ?? ''}',
      tournamentStartAt: parseDate(tournamentJson['start_at']),
    );
  }

  String get resolvedTournamentTitle =>
      tournamentTitle.trim().isNotEmpty ? tournamentTitle.trim() : 'Tournament';
}

class TournamentCommunityPost {
  final int postId;
  final int? linkedTournamentId;
  final String contentType;
  final String status;
  final String accentTone;
  final String title;
  final String subtitle;
  final String summary;
  final String body;
  final String badgeLabel;
  final String ctaLabel;
  final int priority;
  final int reactionCount;
  final bool isActiveNow;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final DateTime? publishedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final TournamentCommunityLinkedTournament? linkedTournament;

  const TournamentCommunityPost({
    required this.postId,
    required this.linkedTournamentId,
    required this.contentType,
    required this.status,
    required this.accentTone,
    required this.title,
    required this.subtitle,
    required this.summary,
    required this.body,
    required this.badgeLabel,
    required this.ctaLabel,
    required this.priority,
    required this.reactionCount,
    required this.isActiveNow,
    required this.startsAt,
    required this.endsAt,
    required this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.linkedTournament,
  });

  bool get isPubliclyVisible =>
      status.trim().toLowerCase() == 'published' &&
      publishedAt != null &&
      isActiveNow;

  factory TournamentCommunityPost.fromJson(Map<String, dynamic> json) {
    int? toNullableInt(dynamic value) {
      if (value == null) {
        return null;
      }

      return int.tryParse('$value');
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString().replaceFirst(' ', 'T'));
    }

    final linkedJson = json['linked_tournament'] is Map
        ? Map<String, dynamic>.from(json['linked_tournament'] as Map)
        : null;

    return TournamentCommunityPost(
      postId: toNullableInt(json['post_id']) ?? 0,
      linkedTournamentId: toNullableInt(json['linked_tournament_id']),
      contentType: '${json['content_type'] ?? 'spotlight'}',
      status: '${json['status'] ?? 'draft'}',
      accentTone: '${json['accent_tone'] ?? 'orange'}',
      title: '${json['title'] ?? ''}',
      subtitle: '${json['subtitle'] ?? ''}',
      summary: '${json['summary'] ?? ''}',
      body: '${json['body'] ?? ''}',
      badgeLabel: '${json['badge_label'] ?? ''}',
      ctaLabel: '${json['cta_label'] ?? ''}',
      priority: toNullableInt(json['priority']) ?? 0,
      reactionCount: toNullableInt(json['reaction_count']) ?? 0,
      isActiveNow:
          json['is_active_now'] == true ||
          '${json['is_active_now'] ?? ''}' == '1' ||
          '${json['is_active_now'] ?? ''}'.toLowerCase() == 'true',
      startsAt: parseDate(json['starts_at']),
      endsAt: parseDate(json['ends_at']),
      publishedAt: parseDate(json['published_at']),
      createdAt: parseDate(json['created_at']),
      updatedAt: parseDate(json['updated_at']),
      linkedTournament: linkedJson == null
          ? null
          : TournamentCommunityLinkedTournament.fromJson(linkedJson),
    );
  }
}

class TournamentCommunityLinkedTournament {
  final int tournamentId;
  final String slug;
  final String title;
  final String gameTitle;
  final String status;
  final DateTime? startAt;
  final bool isFeatured;

  const TournamentCommunityLinkedTournament({
    required this.tournamentId,
    required this.slug,
    required this.title,
    required this.gameTitle,
    required this.status,
    required this.startAt,
    required this.isFeatured,
  });

  factory TournamentCommunityLinkedTournament.fromJson(
    Map<String, dynamic> json,
  ) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString().replaceFirst(' ', 'T'));
    }

    return TournamentCommunityLinkedTournament(
      tournamentId: toInt(json['tournament_id']),
      slug: '${json['slug'] ?? ''}',
      title: '${json['title'] ?? ''}',
      gameTitle: '${json['game_title'] ?? ''}',
      status: '${json['status'] ?? ''}',
      startAt: parseDate(json['start_at']),
      isFeatured:
          json['is_featured'] == true ||
          '${json['is_featured'] ?? ''}' == '1' ||
          '${json['is_featured'] ?? ''}'.toLowerCase() == 'true',
    );
  }
}

const Object _copyWithUnset = Object();

class Tournament {
  final int tournamentId;
  final int businessId;
  final String businessName;
  final String businessSlug;
  final String businessTagline;
  final String businessCity;
  final String businessState;
  final String businessAddressLine1;
  final String businessTimezone;
  final String slug;
  final String title;
  final String gameTitle;
  final String skillLevel;
  final String format;
  final int teamSize;
  final int maxParticipants;
  final int registeredCount;
  final int availableSlots;
  final bool hasAvailableSlots;
  final double entryFee;
  final double prizePool;
  final double effectivePrizePool;
  final bool isSponsored;
  final String sponsorName;
  final String sponsorTagline;
  final double sponsorPrizeContribution;
  final bool isPremium;
  final String premiumLabel;
  final double premiumEntryFee;
  final String premiumPerks;
  final String refundPolicy;
  final int refundCutoffHours;
  final int refundPercentage;
  final String locationLabel;
  final String summary;
  final String description;
  final String rules;
  final String coverImage;
  final String status;
  final String operationsStage;
  final bool isFeatured;
  final bool canRegister;
  final bool canJoinWaitlist;
  final bool hasRegistration;
  final bool isRegistered;
  final bool isWaitlisted;
  final bool canWithdrawRegistration;
  final int seededCount;
  final int bracketMatchCount;
  final int completedBracketMatchCount;
  final bool hasBracket;
  final int checkedInCount;
  final int noShowCount;
  final int pendingCheckInCount;
  final int waitlistCount;
  final int? seedNumber;
  final int? registrationId;
  final int? teamId;
  final String? registrationType;
  final String? registrationStatus;
  final String? attendanceStatus;
  final int? waitlistPosition;
  final String teamName;
  final int rosterCount;
  final List<TournamentRosterMember> roster;
  final String? paymentStatus;
  final String paymentMethod;
  final String paymentReference;
  final String paymentNotes;
  final bool premiumAccess;
  final double premiumAccessFee;
  final String premiumAccessLabel;
  final double amountDue;
  final double amountPaid;
  final double outstandingAmount;
  final DateTime? paidAt;
  final String? refundStatus;
  final double refundRequestedAmount;
  final double refundProcessedAmount;
  final DateTime? refundRequestedAt;
  final DateTime? refundProcessedAt;
  final String refundNotes;
  final bool refundEligible;
  final double refundableAmount;
  final DateTime? bracketHandoffAt;
  final DateTime? checkedInAt;
  final DateTime? noShowMarkedAt;
  final DateTime? registeredAt;
  final DateTime? waitlistedAt;
  final DateTime? waitlistPromotedAt;
  final DateTime? startAt;
  final DateTime? endAt;
  final DateTime? registrationOpenAt;
  final DateTime? registrationCloseAt;
  final DateTime? publishedAt;
  final DateTime? updatedAt;

  const Tournament({
    required this.tournamentId,
    required this.businessId,
    required this.businessName,
    required this.businessSlug,
    required this.businessTagline,
    required this.businessCity,
    required this.businessState,
    required this.businessAddressLine1,
    required this.businessTimezone,
    required this.slug,
    required this.title,
    required this.gameTitle,
    required this.skillLevel,
    required this.format,
    required this.teamSize,
    required this.maxParticipants,
    required this.registeredCount,
    required this.availableSlots,
    required this.hasAvailableSlots,
    required this.entryFee,
    required this.prizePool,
    required this.effectivePrizePool,
    required this.isSponsored,
    required this.sponsorName,
    required this.sponsorTagline,
    required this.sponsorPrizeContribution,
    required this.isPremium,
    required this.premiumLabel,
    required this.premiumEntryFee,
    required this.premiumPerks,
    required this.refundPolicy,
    required this.refundCutoffHours,
    required this.refundPercentage,
    required this.locationLabel,
    required this.summary,
    required this.description,
    required this.rules,
    required this.coverImage,
    required this.status,
    required this.operationsStage,
    required this.isFeatured,
    required this.canRegister,
    required this.canJoinWaitlist,
    required this.hasRegistration,
    required this.isRegistered,
    required this.isWaitlisted,
    required this.canWithdrawRegistration,
    required this.seededCount,
    required this.bracketMatchCount,
    required this.completedBracketMatchCount,
    required this.hasBracket,
    required this.checkedInCount,
    required this.noShowCount,
    required this.pendingCheckInCount,
    required this.waitlistCount,
    required this.seedNumber,
    required this.registrationId,
    required this.teamId,
    required this.registrationType,
    required this.registrationStatus,
    required this.attendanceStatus,
    required this.waitlistPosition,
    required this.teamName,
    required this.rosterCount,
    required this.roster,
    required this.paymentStatus,
    required this.paymentMethod,
    required this.paymentReference,
    required this.paymentNotes,
    required this.premiumAccess,
    required this.premiumAccessFee,
    required this.premiumAccessLabel,
    required this.amountDue,
    required this.amountPaid,
    required this.outstandingAmount,
    required this.paidAt,
    required this.refundStatus,
    required this.refundRequestedAmount,
    required this.refundProcessedAmount,
    required this.refundRequestedAt,
    required this.refundProcessedAt,
    required this.refundNotes,
    required this.refundEligible,
    required this.refundableAmount,
    required this.bracketHandoffAt,
    required this.checkedInAt,
    required this.noShowMarkedAt,
    required this.registeredAt,
    required this.waitlistedAt,
    required this.waitlistPromotedAt,
    required this.startAt,
    required this.endAt,
    required this.registrationOpenAt,
    required this.registrationCloseAt,
    required this.publishedAt,
    required this.updatedAt,
  });

  factory Tournament.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic value, [int fallback = 0]) {
      return int.tryParse('${value ?? fallback}') ?? fallback;
    }

    double toDouble(dynamic value, [double fallback = 0]) {
      return double.tryParse('${value ?? fallback}') ?? fallback;
    }

    bool toBool(dynamic value, [bool fallback = false]) {
      if (value is bool) {
        return value;
      }
      if (value is num) {
        return value == 1;
      }

      final normalized = '${value ?? ''}'.trim().toLowerCase();
      if (normalized.isEmpty) {
        return fallback;
      }

      return normalized == 'true' || normalized == '1' || normalized == 'yes';
    }

    DateTime? parseDate(dynamic value) {
      if (value == null) {
        return null;
      }

      return DateTime.tryParse(value.toString());
    }

    return Tournament(
      tournamentId: toInt(json['tournament_id']),
      businessId: toInt(json['business_id']),
      businessName: '${json['business_name'] ?? ''}',
      businessSlug: '${json['business_slug'] ?? ''}',
      businessTagline: '${json['business_tagline'] ?? ''}',
      businessCity: '${json['business_city'] ?? ''}',
      businessState: '${json['business_state'] ?? ''}',
      businessAddressLine1: '${json['business_address_line1'] ?? ''}',
      businessTimezone: '${json['business_timezone'] ?? 'Asia/Kolkata'}',
      slug: '${json['slug'] ?? ''}',
      title: '${json['title'] ?? ''}',
      gameTitle: '${json['game_title'] ?? ''}',
      skillLevel: '${json['skill_level'] ?? 'open'}',
      format: '${json['format'] ?? 'solo'}',
      teamSize: toInt(json['team_size'], 1),
      maxParticipants: toInt(json['max_participants']),
      registeredCount: toInt(json['registered_count']),
      availableSlots: toInt(json['available_slots']),
      hasAvailableSlots: toBool(json['has_available_slots']),
      entryFee: toDouble(json['entry_fee']),
      prizePool: toDouble(json['prize_pool']),
      effectivePrizePool: toDouble(
        json['effective_prize_pool'],
        toDouble(json['prize_pool']),
      ),
      isSponsored: toBool(json['is_sponsored']),
      sponsorName: '${json['sponsor_name'] ?? ''}',
      sponsorTagline: '${json['sponsor_tagline'] ?? ''}',
      sponsorPrizeContribution: toDouble(json['sponsor_prize_contribution']),
      isPremium: toBool(json['is_premium']),
      premiumLabel: '${json['premium_label'] ?? ''}',
      premiumEntryFee: toDouble(json['premium_entry_fee']),
      premiumPerks: '${json['premium_perks'] ?? ''}',
      refundPolicy: '${json['refund_policy'] ?? 'no_refunds'}',
      refundCutoffHours: toInt(json['refund_cutoff_hours'], 24),
      refundPercentage: toInt(json['refund_percentage'], 100),
      locationLabel: '${json['location_label'] ?? ''}',
      summary: '${json['summary'] ?? ''}',
      description: '${json['description'] ?? ''}',
      rules: '${json['rules'] ?? ''}',
      coverImage: '${json['cover_image'] ?? ''}',
      status: '${json['status'] ?? 'draft'}',
      operationsStage: '${json['operations_stage'] ?? 'registrations'}',
      isFeatured: toBool(json['is_featured']),
      canRegister: toBool(json['can_register']),
      canJoinWaitlist: toBool(json['can_join_waitlist']),
      hasRegistration: toBool(json['has_registration']),
      isRegistered: toBool(json['is_registered']),
      isWaitlisted: toBool(json['is_waitlisted']),
      canWithdrawRegistration: toBool(json['can_withdraw_registration']),
      seededCount: toInt(json['seeded_count']),
      bracketMatchCount: toInt(json['bracket_match_count']),
      completedBracketMatchCount: toInt(json['completed_bracket_match_count']),
      hasBracket: toBool(json['has_bracket']),
      checkedInCount: toInt(json['checked_in_count']),
      noShowCount: toInt(json['no_show_count']),
      pendingCheckInCount: toInt(json['pending_check_in_count']),
      waitlistCount: toInt(json['waitlist_count']),
      seedNumber: json['seed_number'] == null
          ? null
          : toInt(json['seed_number']),
      registrationId: json['registration_id'] == null
          ? null
          : toInt(json['registration_id']),
      teamId: json['team_id'] == null ? null : toInt(json['team_id']),
      registrationType: json['registration_type']?.toString(),
      registrationStatus: json['registration_status']?.toString(),
      attendanceStatus: json['attendance_status']?.toString(),
      waitlistPosition: json['waitlist_position'] == null
          ? null
          : toInt(json['waitlist_position']),
      teamName: '${json['team_name'] ?? ''}',
      rosterCount: toInt(json['roster_count']),
      roster: ((json['roster'] as List?) ?? const [])
          .map(
            (item) => TournamentRosterMember.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(),
      paymentStatus: json['payment_status']?.toString(),
      paymentMethod: '${json['payment_method'] ?? ''}',
      paymentReference: '${json['payment_reference'] ?? ''}',
      paymentNotes: '${json['payment_notes'] ?? ''}',
      premiumAccess: toBool(json['premium_access']),
      premiumAccessFee: toDouble(json['premium_access_fee']),
      premiumAccessLabel: '${json['premium_access_label'] ?? ''}',
      amountDue: toDouble(json['amount_due']),
      amountPaid: toDouble(json['amount_paid']),
      outstandingAmount: toDouble(json['outstanding_amount']),
      paidAt: parseDate(json['paid_at']),
      refundStatus: json['refund_status']?.toString(),
      refundRequestedAmount: toDouble(json['refund_requested_amount']),
      refundProcessedAmount: toDouble(json['refund_processed_amount']),
      refundRequestedAt: parseDate(json['refund_requested_at']),
      refundProcessedAt: parseDate(json['refund_processed_at']),
      refundNotes: '${json['refund_notes'] ?? ''}',
      refundEligible: toBool(json['refund_eligible']),
      refundableAmount: toDouble(json['refundable_amount']),
      bracketHandoffAt: parseDate(json['bracket_handoff_at']),
      checkedInAt: parseDate(json['checked_in_at']),
      noShowMarkedAt: parseDate(json['no_show_marked_at']),
      registeredAt: parseDate(json['registered_at']),
      waitlistedAt: parseDate(json['waitlisted_at']),
      waitlistPromotedAt: parseDate(json['waitlist_promoted_at']),
      startAt: parseDate(json['start_at']),
      endAt: parseDate(json['end_at']),
      registrationOpenAt: parseDate(json['registration_open_at']),
      registrationCloseAt: parseDate(json['registration_close_at']),
      publishedAt: parseDate(json['published_at']),
      updatedAt: parseDate(json['updated_at']),
    );
  }

  String get coverImageUrl => ApiConfig.resolveUpload(coverImage);

  String get hostBusinessLabel {
    if (businessName.trim().isNotEmpty) {
      return businessName.trim();
    }

    return 'Cafe host updating soon';
  }

  String get hostBusinessLocation {
    final parts = <String>[
      businessCity.trim(),
      businessState.trim(),
    ].where((value) => value.isNotEmpty).toList();
    return parts.join(', ');
  }

  String get normalizedStatus => status.trim().toLowerCase();

  bool get isUpcoming {
    if (startAt == null) {
      return false;
    }

    return startAt!.isAfter(DateTime.now());
  }

  bool get hasPremiumOffer => isPremium && premiumEntryFee > 0;

  String get teamLabel => '${format.toUpperCase()} | ${teamSize}P';

  String get normalizedAttendanceStatus =>
      (attendanceStatus ?? 'pending').trim().toLowerCase();

  bool get isCheckedIn => normalizedAttendanceStatus == 'checked_in';

  Tournament copyWith({
    int? tournamentId,
    int? businessId,
    String? businessName,
    String? businessSlug,
    String? businessTagline,
    String? businessCity,
    String? businessState,
    String? businessAddressLine1,
    String? businessTimezone,
    String? slug,
    String? title,
    String? gameTitle,
    String? skillLevel,
    String? format,
    int? teamSize,
    int? maxParticipants,
    int? registeredCount,
    int? availableSlots,
    bool? hasAvailableSlots,
    double? entryFee,
    double? prizePool,
    double? effectivePrizePool,
    bool? isSponsored,
    String? sponsorName,
    String? sponsorTagline,
    double? sponsorPrizeContribution,
    bool? isPremium,
    String? premiumLabel,
    double? premiumEntryFee,
    String? premiumPerks,
    String? refundPolicy,
    int? refundCutoffHours,
    int? refundPercentage,
    String? locationLabel,
    String? summary,
    String? description,
    String? rules,
    String? coverImage,
    String? status,
    String? operationsStage,
    bool? isFeatured,
    bool? canRegister,
    bool? canJoinWaitlist,
    bool? hasRegistration,
    bool? isRegistered,
    bool? isWaitlisted,
    bool? canWithdrawRegistration,
    int? seededCount,
    int? bracketMatchCount,
    int? completedBracketMatchCount,
    bool? hasBracket,
    int? checkedInCount,
    int? noShowCount,
    int? pendingCheckInCount,
    int? waitlistCount,
    Object? seedNumber = _copyWithUnset,
    Object? registrationId = _copyWithUnset,
    Object? teamId = _copyWithUnset,
    Object? registrationType = _copyWithUnset,
    Object? registrationStatus = _copyWithUnset,
    Object? attendanceStatus = _copyWithUnset,
    Object? waitlistPosition = _copyWithUnset,
    String? teamName,
    int? rosterCount,
    List<TournamentRosterMember>? roster,
    Object? paymentStatus = _copyWithUnset,
    String? paymentMethod,
    String? paymentReference,
    String? paymentNotes,
    bool? premiumAccess,
    double? premiumAccessFee,
    String? premiumAccessLabel,
    double? amountDue,
    double? amountPaid,
    double? outstandingAmount,
    Object? paidAt = _copyWithUnset,
    Object? refundStatus = _copyWithUnset,
    double? refundRequestedAmount,
    double? refundProcessedAmount,
    Object? refundRequestedAt = _copyWithUnset,
    Object? refundProcessedAt = _copyWithUnset,
    String? refundNotes,
    bool? refundEligible,
    double? refundableAmount,
    Object? bracketHandoffAt = _copyWithUnset,
    Object? checkedInAt = _copyWithUnset,
    Object? noShowMarkedAt = _copyWithUnset,
    Object? registeredAt = _copyWithUnset,
    Object? waitlistedAt = _copyWithUnset,
    Object? waitlistPromotedAt = _copyWithUnset,
    Object? startAt = _copyWithUnset,
    Object? endAt = _copyWithUnset,
    Object? registrationOpenAt = _copyWithUnset,
    Object? registrationCloseAt = _copyWithUnset,
    Object? publishedAt = _copyWithUnset,
    Object? updatedAt = _copyWithUnset,
  }) {
    return Tournament(
      tournamentId: tournamentId ?? this.tournamentId,
      businessId: businessId ?? this.businessId,
      businessName: businessName ?? this.businessName,
      businessSlug: businessSlug ?? this.businessSlug,
      businessTagline: businessTagline ?? this.businessTagline,
      businessCity: businessCity ?? this.businessCity,
      businessState: businessState ?? this.businessState,
      businessAddressLine1: businessAddressLine1 ?? this.businessAddressLine1,
      businessTimezone: businessTimezone ?? this.businessTimezone,
      slug: slug ?? this.slug,
      title: title ?? this.title,
      gameTitle: gameTitle ?? this.gameTitle,
      skillLevel: skillLevel ?? this.skillLevel,
      format: format ?? this.format,
      teamSize: teamSize ?? this.teamSize,
      maxParticipants: maxParticipants ?? this.maxParticipants,
      registeredCount: registeredCount ?? this.registeredCount,
      availableSlots: availableSlots ?? this.availableSlots,
      hasAvailableSlots: hasAvailableSlots ?? this.hasAvailableSlots,
      entryFee: entryFee ?? this.entryFee,
      prizePool: prizePool ?? this.prizePool,
      effectivePrizePool: effectivePrizePool ?? this.effectivePrizePool,
      isSponsored: isSponsored ?? this.isSponsored,
      sponsorName: sponsorName ?? this.sponsorName,
      sponsorTagline: sponsorTagline ?? this.sponsorTagline,
      sponsorPrizeContribution:
          sponsorPrizeContribution ?? this.sponsorPrizeContribution,
      isPremium: isPremium ?? this.isPremium,
      premiumLabel: premiumLabel ?? this.premiumLabel,
      premiumEntryFee: premiumEntryFee ?? this.premiumEntryFee,
      premiumPerks: premiumPerks ?? this.premiumPerks,
      refundPolicy: refundPolicy ?? this.refundPolicy,
      refundCutoffHours: refundCutoffHours ?? this.refundCutoffHours,
      refundPercentage: refundPercentage ?? this.refundPercentage,
      locationLabel: locationLabel ?? this.locationLabel,
      summary: summary ?? this.summary,
      description: description ?? this.description,
      rules: rules ?? this.rules,
      coverImage: coverImage ?? this.coverImage,
      status: status ?? this.status,
      operationsStage: operationsStage ?? this.operationsStage,
      isFeatured: isFeatured ?? this.isFeatured,
      canRegister: canRegister ?? this.canRegister,
      canJoinWaitlist: canJoinWaitlist ?? this.canJoinWaitlist,
      hasRegistration: hasRegistration ?? this.hasRegistration,
      isRegistered: isRegistered ?? this.isRegistered,
      isWaitlisted: isWaitlisted ?? this.isWaitlisted,
      canWithdrawRegistration:
          canWithdrawRegistration ?? this.canWithdrawRegistration,
      seededCount: seededCount ?? this.seededCount,
      bracketMatchCount: bracketMatchCount ?? this.bracketMatchCount,
      completedBracketMatchCount:
          completedBracketMatchCount ?? this.completedBracketMatchCount,
      hasBracket: hasBracket ?? this.hasBracket,
      checkedInCount: checkedInCount ?? this.checkedInCount,
      noShowCount: noShowCount ?? this.noShowCount,
      pendingCheckInCount: pendingCheckInCount ?? this.pendingCheckInCount,
      waitlistCount: waitlistCount ?? this.waitlistCount,
      seedNumber: identical(seedNumber, _copyWithUnset)
          ? this.seedNumber
          : seedNumber as int?,
      registrationId: identical(registrationId, _copyWithUnset)
          ? this.registrationId
          : registrationId as int?,
      teamId: identical(teamId, _copyWithUnset) ? this.teamId : teamId as int?,
      registrationType: identical(registrationType, _copyWithUnset)
          ? this.registrationType
          : registrationType as String?,
      registrationStatus: identical(registrationStatus, _copyWithUnset)
          ? this.registrationStatus
          : registrationStatus as String?,
      attendanceStatus: identical(attendanceStatus, _copyWithUnset)
          ? this.attendanceStatus
          : attendanceStatus as String?,
      waitlistPosition: identical(waitlistPosition, _copyWithUnset)
          ? this.waitlistPosition
          : waitlistPosition as int?,
      teamName: teamName ?? this.teamName,
      rosterCount: rosterCount ?? this.rosterCount,
      roster: roster ?? this.roster,
      paymentStatus: identical(paymentStatus, _copyWithUnset)
          ? this.paymentStatus
          : paymentStatus as String?,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      paymentReference: paymentReference ?? this.paymentReference,
      paymentNotes: paymentNotes ?? this.paymentNotes,
      premiumAccess: premiumAccess ?? this.premiumAccess,
      premiumAccessFee: premiumAccessFee ?? this.premiumAccessFee,
      premiumAccessLabel: premiumAccessLabel ?? this.premiumAccessLabel,
      amountDue: amountDue ?? this.amountDue,
      amountPaid: amountPaid ?? this.amountPaid,
      outstandingAmount: outstandingAmount ?? this.outstandingAmount,
      paidAt: identical(paidAt, _copyWithUnset)
          ? this.paidAt
          : paidAt as DateTime?,
      refundStatus: identical(refundStatus, _copyWithUnset)
          ? this.refundStatus
          : refundStatus as String?,
      refundRequestedAmount:
          refundRequestedAmount ?? this.refundRequestedAmount,
      refundProcessedAmount:
          refundProcessedAmount ?? this.refundProcessedAmount,
      refundRequestedAt: identical(refundRequestedAt, _copyWithUnset)
          ? this.refundRequestedAt
          : refundRequestedAt as DateTime?,
      refundProcessedAt: identical(refundProcessedAt, _copyWithUnset)
          ? this.refundProcessedAt
          : refundProcessedAt as DateTime?,
      refundNotes: refundNotes ?? this.refundNotes,
      refundEligible: refundEligible ?? this.refundEligible,
      refundableAmount: refundableAmount ?? this.refundableAmount,
      bracketHandoffAt: identical(bracketHandoffAt, _copyWithUnset)
          ? this.bracketHandoffAt
          : bracketHandoffAt as DateTime?,
      checkedInAt: identical(checkedInAt, _copyWithUnset)
          ? this.checkedInAt
          : checkedInAt as DateTime?,
      noShowMarkedAt: identical(noShowMarkedAt, _copyWithUnset)
          ? this.noShowMarkedAt
          : noShowMarkedAt as DateTime?,
      registeredAt: identical(registeredAt, _copyWithUnset)
          ? this.registeredAt
          : registeredAt as DateTime?,
      waitlistedAt: identical(waitlistedAt, _copyWithUnset)
          ? this.waitlistedAt
          : waitlistedAt as DateTime?,
      waitlistPromotedAt: identical(waitlistPromotedAt, _copyWithUnset)
          ? this.waitlistPromotedAt
          : waitlistPromotedAt as DateTime?,
      startAt: identical(startAt, _copyWithUnset)
          ? this.startAt
          : startAt as DateTime?,
      endAt: identical(endAt, _copyWithUnset) ? this.endAt : endAt as DateTime?,
      registrationOpenAt: identical(registrationOpenAt, _copyWithUnset)
          ? this.registrationOpenAt
          : registrationOpenAt as DateTime?,
      registrationCloseAt: identical(registrationCloseAt, _copyWithUnset)
          ? this.registrationCloseAt
          : registrationCloseAt as DateTime?,
      publishedAt: identical(publishedAt, _copyWithUnset)
          ? this.publishedAt
          : publishedAt as DateTime?,
      updatedAt: identical(updatedAt, _copyWithUnset)
          ? this.updatedAt
          : updatedAt as DateTime?,
    );
  }
}
