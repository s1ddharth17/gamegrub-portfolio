import '../config/api_config.dart';

class AppUser {
  final int id;
  final String name;
  final String email;
  final String mobile;
  final String dateOfBirth;
  final int loyaltyPoints;
  final String avatar;
  final String gamerTag;
  final String favoriteGame;
  final String playerBio;
  final String displayName;
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
  final String mostPlayedTournamentGame;
  final String lastTournamentAt;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.mobile,
    this.dateOfBirth = '',
    required this.loyaltyPoints,
    required this.avatar,
    required this.gamerTag,
    required this.favoriteGame,
    required this.playerBio,
    required this.displayName,
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
    required this.mostPlayedTournamentGame,
    required this.lastTournamentAt,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: int.tryParse('${json['uid'] ?? json['id'] ?? 0}') ?? 0,
      name: '${json['name'] ?? 'Guest Player'}',
      email: '${json['email'] ?? ''}',
      mobile: '${json['mobile'] ?? ''}',
      dateOfBirth: '${json['date_of_birth'] ?? ''}',
      loyaltyPoints: int.tryParse('${json['loyalty_points'] ?? 0}') ?? 0,
      avatar: '${json['avatar'] ?? ''}',
      gamerTag: '${json['gamer_tag'] ?? ''}',
      favoriteGame: '${json['favorite_game'] ?? ''}',
      playerBio: '${json['player_bio'] ?? ''}',
      displayName:
          '${json['display_name'] ?? json['gamer_tag'] ?? json['name'] ?? 'Guest Player'}',
      tournamentEntries:
          int.tryParse('${json['tournament_entries'] ?? 0}') ?? 0,
      tournamentsCheckedIn:
          int.tryParse('${json['tournaments_checked_in'] ?? 0}') ?? 0,
      tournamentsNoShow:
          int.tryParse('${json['tournaments_no_show'] ?? 0}') ?? 0,
      tournamentMatchesPlayed:
          int.tryParse('${json['tournament_matches_played'] ?? 0}') ?? 0,
      tournamentMatchWins:
          int.tryParse('${json['tournament_match_wins'] ?? 0}') ?? 0,
      tournamentMatchLosses:
          int.tryParse('${json['tournament_match_losses'] ?? 0}') ?? 0,
      tournamentChampionships:
          int.tryParse('${json['tournament_championships'] ?? 0}') ?? 0,
      tournamentRunnerUpFinishes:
          int.tryParse('${json['tournament_runner_up_finishes'] ?? 0}') ?? 0,
      tournamentPoints: int.tryParse('${json['tournament_points'] ?? 0}') ?? 0,
      tournamentRank: json['tournament_rank'] == null
          ? null
          : int.tryParse('${json['tournament_rank']}'),
      tournamentWinRate:
          double.tryParse('${json['tournament_win_rate'] ?? 0}') ?? 0,
      mostPlayedTournamentGame: '${json['most_played_tournament_game'] ?? ''}',
      lastTournamentAt: '${json['last_tournament_at'] ?? ''}',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'uid': id,
      'name': name,
      'email': email,
      'mobile': mobile,
      'date_of_birth': dateOfBirth,
      'loyalty_points': loyaltyPoints,
      'avatar': avatar,
      'gamer_tag': gamerTag,
      'favorite_game': favoriteGame,
      'player_bio': playerBio,
      'display_name': displayName,
      'tournament_entries': tournamentEntries,
      'tournaments_checked_in': tournamentsCheckedIn,
      'tournaments_no_show': tournamentsNoShow,
      'tournament_matches_played': tournamentMatchesPlayed,
      'tournament_match_wins': tournamentMatchWins,
      'tournament_match_losses': tournamentMatchLosses,
      'tournament_championships': tournamentChampionships,
      'tournament_runner_up_finishes': tournamentRunnerUpFinishes,
      'tournament_points': tournamentPoints,
      'tournament_rank': tournamentRank,
      'tournament_win_rate': tournamentWinRate,
      'most_played_tournament_game': mostPlayedTournamentGame,
      'last_tournament_at': lastTournamentAt,
    };
  }

  String get avatarUrl => ApiConfig.resolveUpload(avatar);

  AppUser copyWith({
    String? name,
    String? email,
    String? mobile,
    String? dateOfBirth,
    int? loyaltyPoints,
    String? avatar,
    String? gamerTag,
    String? favoriteGame,
    String? playerBio,
    String? displayName,
    int? tournamentEntries,
    int? tournamentsCheckedIn,
    int? tournamentsNoShow,
    int? tournamentMatchesPlayed,
    int? tournamentMatchWins,
    int? tournamentMatchLosses,
    int? tournamentChampionships,
    int? tournamentRunnerUpFinishes,
    int? tournamentPoints,
    Object? tournamentRank = _unset,
    double? tournamentWinRate,
    String? mostPlayedTournamentGame,
    String? lastTournamentAt,
  }) {
    return AppUser(
      id: id,
      name: name ?? this.name,
      email: email ?? this.email,
      mobile: mobile ?? this.mobile,
      dateOfBirth: dateOfBirth ?? this.dateOfBirth,
      loyaltyPoints: loyaltyPoints ?? this.loyaltyPoints,
      avatar: avatar ?? this.avatar,
      gamerTag: gamerTag ?? this.gamerTag,
      favoriteGame: favoriteGame ?? this.favoriteGame,
      playerBio: playerBio ?? this.playerBio,
      displayName: displayName ?? this.displayName,
      tournamentEntries: tournamentEntries ?? this.tournamentEntries,
      tournamentsCheckedIn: tournamentsCheckedIn ?? this.tournamentsCheckedIn,
      tournamentsNoShow: tournamentsNoShow ?? this.tournamentsNoShow,
      tournamentMatchesPlayed:
          tournamentMatchesPlayed ?? this.tournamentMatchesPlayed,
      tournamentMatchWins: tournamentMatchWins ?? this.tournamentMatchWins,
      tournamentMatchLosses:
          tournamentMatchLosses ?? this.tournamentMatchLosses,
      tournamentChampionships:
          tournamentChampionships ?? this.tournamentChampionships,
      tournamentRunnerUpFinishes:
          tournamentRunnerUpFinishes ?? this.tournamentRunnerUpFinishes,
      tournamentPoints: tournamentPoints ?? this.tournamentPoints,
      tournamentRank: identical(tournamentRank, _unset)
          ? this.tournamentRank
          : tournamentRank as int?,
      tournamentWinRate: tournamentWinRate ?? this.tournamentWinRate,
      mostPlayedTournamentGame:
          mostPlayedTournamentGame ?? this.mostPlayedTournamentGame,
      lastTournamentAt: lastTournamentAt ?? this.lastTournamentAt,
    );
  }
}

const Object _unset = Object();
