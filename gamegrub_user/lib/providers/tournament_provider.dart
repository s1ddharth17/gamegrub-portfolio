import 'dart:async';

import 'package:flutter/material.dart';

import '../models/tournament.dart';
import '../services/tournament_service.dart';

class TournamentProvider with ChangeNotifier {
  TournamentProvider({TournamentService? service})
    : _service = service ?? TournamentService();

  final TournamentService _service;

  List<Tournament> tournaments = [];
  List<Tournament> myTournaments = [];
  List<TournamentNotification> notifications = [];
  List<TournamentCommunityPost> communityPosts = [];
  bool isCommunityPostsLoading = false;
  String? communityPostsError;
  List<TournamentLeaderboardEntry> leaderboard = [];
  List<Map<String, dynamic>> matchHighlights = [];
  bool isHighlightsLoading = false;
  List<PersistentTournamentTeam> teams = [];
  List<PersistentTournamentTeamInvite> teamInvites = [];
  final Map<int, TournamentBracket> bracketsByTournamentId = {};
  final Set<int> _loadingBracketIds = <int>{};
  final Map<int, String> _bracketErrors = {};
  int? loadedBusinessId;
  bool isLoading = false;
  bool isMutating = false;
  bool isNotificationsLoading = false;
  bool isTeamSaving = false;
  bool isTeamInviteSaving = false;
  int? activeNotificationId;
  int? activeTournamentId;
  int? activeTeamId;
  int? activeTeamMemberId;
  int? activeTeamInviteId;
  String? errorMessage;

  bool isBusyFor(int tournamentId) =>
      isMutating && activeTournamentId == tournamentId;

  bool isNotificationBusyFor(int notificationId) =>
      activeNotificationId == notificationId;

  bool isBusyForTeam(int? teamId) =>
      (isTeamSaving && activeTeamId == teamId) ||
      (isTeamInviteSaving && activeTeamId == teamId);

  bool isBusyForTeamMember(int? teamMemberId) =>
      isTeamInviteSaving && activeTeamMemberId == teamMemberId;

  bool isBusyForTeamInvite(int? inviteId) =>
      isTeamInviteSaving && activeTeamInviteId == inviteId;

  bool isBracketLoadingFor(int tournamentId) =>
      _loadingBracketIds.contains(tournamentId);

  TournamentBracket? bracketFor(int tournamentId) =>
      bracketsByTournamentId[tournamentId];

  String? bracketErrorFor(int tournamentId) => _bracketErrors[tournamentId];

  Future<void> loadTournaments({String? token, int? businessId}) async {
    isLoading = true;
    errorMessage = null;
    loadedBusinessId = businessId;
    notifyListeners();
    unawaited(loadCommunityPosts());
    unawaited(loadMatchHighlights());

    try {
      final data = await _service.fetchTournaments(businessId: businessId);
      tournaments = data
          .map(
            (item) =>
                Tournament.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
      try {
        final leaderboardData = await _service.fetchLeaderboard(limit: 12);
        leaderboard = leaderboardData
            .map(
              (item) => TournamentLeaderboardEntry.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList();
      } catch (_) {
        leaderboard = [];
      }

      if (token != null && token.isNotEmpty) {
        try {
          final registrations = await _service.fetchMyTournaments(token: token);
          myTournaments = registrations
              .map(
                (item) =>
                    Tournament.fromJson(Map<String, dynamic>.from(item as Map)),
              )
              .toList();
        } catch (_) {
          myTournaments = [];
        }

        try {
          final updates = await _service.fetchNotifications(token: token);
          notifications = updates
              .map(
                (item) => TournamentNotification.fromJson(
                  Map<String, dynamic>.from(item as Map),
                ),
              )
              .toList();
        } catch (_) {
          notifications = [];
        }

        try {
          final teamData = await _service.fetchTeams(token: token);
          teams = teamData
              .map(
                (item) => PersistentTournamentTeam.fromJson(
                  Map<String, dynamic>.from(item as Map),
                ),
              )
              .toList();
        } catch (_) {
          teams = [];
        }

        try {
          final inviteData = await _service.fetchTeamInvites(token: token);
          teamInvites = inviteData
              .map(
                (item) => PersistentTournamentTeamInvite.fromJson(
                  Map<String, dynamic>.from(item as Map),
                ),
              )
              .toList();
        } catch (_) {
          teamInvites = [];
        }
      } else {
        myTournaments = [];
        notifications = [];
        teams = [];
        teamInvites = [];
      }

      _mergeRegistrationState();
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadCommunityPosts() async {
    if (isCommunityPostsLoading) {
      return;
    }

    isCommunityPostsLoading = true;
    communityPostsError = null;
    notifyListeners();

    try {
      final data = await _service.fetchCommunityPosts(limit: 8);
      communityPosts = data
          .map(
            (item) => TournamentCommunityPost.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .where((post) => post.isPubliclyVisible)
          .toList();
    } catch (_) {
      communityPosts = [];
      communityPostsError = 'Community posts could not be loaded.';
    } finally {
      isCommunityPostsLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMatchHighlights() async {
    if (isHighlightsLoading) return;
    isHighlightsLoading = true;
    notifyListeners();
    try {
      final data = await _service.fetchMatchHighlights(limit: 6);
      matchHighlights = data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      matchHighlights = [];
    } finally {
      isHighlightsLoading = false;
      notifyListeners();
    }
  }

  Future<Tournament> fetchPublicTournamentDetails({
    required String slugOrId,
  }) async {
    final data = await _service.fetchTournamentDetails(slugOrId: slugOrId);
    return Tournament.fromJson(data);
  }

  Future<void> loadMyTournaments({required String token}) async {
    try {
      final data = await _service.fetchMyTournaments(token: token);
      myTournaments = data
          .map(
            (item) =>
                Tournament.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
      _mergeRegistrationState();
      notifyListeners();
    } catch (error) {
      errorMessage = error.toString();
      notifyListeners();
    }
  }

  Future<void> loadNotifications({required String token}) async {
    isNotificationsLoading = true;
    notifyListeners();

    try {
      final updates = await _service.fetchNotifications(token: token);
      notifications = updates
          .map(
            (item) => TournamentNotification.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList();
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      isNotificationsLoading = false;
      notifyListeners();
    }
  }

  Future<void> markNotificationRead({
    required String token,
    required int notificationId,
  }) async {
    activeNotificationId = notificationId;
    notifyListeners();

    try {
      final response = await _service.markNotificationRead(
        token: token,
        notificationId: notificationId,
      );
      final notificationJson = response['notification'];

      if (notificationJson is Map) {
        final updated = TournamentNotification.fromJson(
          Map<String, dynamic>.from(notificationJson),
        );
        notifications = notifications
            .map(
              (entry) =>
                  entry.notificationId == notificationId ? updated : entry,
            )
            .toList();
      }
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      activeNotificationId = null;
      notifyListeners();
    }
  }

  Future<bool> saveTeam({
    required String token,
    int? teamId,
    required String teamName,
    String teamTag = '',
    String preferredGame = '',
    String teamBio = '',
    List<Map<String, dynamic>> roster = const [],
  }) async {
    isTeamSaving = true;
    activeTeamId = teamId;
    errorMessage = null;
    notifyListeners();

    try {
      final response = await _service.saveTeam(
        token: token,
        teamId: teamId,
        teamName: teamName,
        teamTag: teamTag,
        preferredGame: preferredGame,
        teamBio: teamBio,
        roster: roster,
      );
      final teamJson = response['team'];

      if (teamJson is Map) {
        final savedTeam = PersistentTournamentTeam.fromJson(
          Map<String, dynamic>.from(teamJson),
        );
        teams = [
          savedTeam,
          ...teams.where((entry) => entry.teamId != savedTeam.teamId),
        ];
        return true;
      }

      errorMessage = 'Invalid team response from server.';
      return false;
    } catch (error) {
      errorMessage = error.toString();
      return false;
    } finally {
      isTeamSaving = false;
      activeTeamId = null;
      notifyListeners();
    }
  }

  Future<bool> registerForTournament({
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
    isMutating = true;
    activeTournamentId = tournamentId;
    errorMessage = null;
    notifyListeners();

    try {
      await _service.registerForTournament(
        token: token,
        tournamentId: tournamentId,
        teamId: teamId,
        teamName: teamName,
        roster: roster,
        premiumAccess: premiumAccess,
        paymentMethod: paymentMethod,
        paymentReference: paymentReference,
        paymentNotes: paymentNotes,
      );
      await loadTournaments(token: token, businessId: loadedBusinessId);
      return true;
    } catch (error) {
      errorMessage = error.toString();
      return false;
    } finally {
      isMutating = false;
      activeTournamentId = null;
      notifyListeners();
    }
  }

  Future<bool> sendTeamInvite({
    required String token,
    required int teamId,
    required int teamMemberId,
    String message = '',
  }) async {
    isTeamInviteSaving = true;
    activeTeamId = teamId;
    activeTeamMemberId = teamMemberId;
    errorMessage = null;
    notifyListeners();

    try {
      await _service.sendTeamInvite(
        token: token,
        teamId: teamId,
        teamMemberId: teamMemberId,
        message: message,
      );
      await loadTournaments(token: token, businessId: loadedBusinessId);
      return true;
    } catch (error) {
      errorMessage = error.toString();
      return false;
    } finally {
      isTeamInviteSaving = false;
      activeTeamId = null;
      activeTeamMemberId = null;
      notifyListeners();
    }
  }

  Future<bool> respondToTeamInvite({
    required String token,
    required int inviteId,
    required bool accept,
  }) async {
    isTeamInviteSaving = true;
    activeTeamInviteId = inviteId;
    errorMessage = null;
    notifyListeners();

    try {
      await _service.respondToTeamInvite(
        token: token,
        inviteId: inviteId,
        accept: accept,
      );
      await loadTournaments(token: token, businessId: loadedBusinessId);
      return true;
    } catch (error) {
      errorMessage = error.toString();
      return false;
    } finally {
      isTeamInviteSaving = false;
      activeTeamInviteId = null;
      notifyListeners();
    }
  }

  Future<bool> withdrawFromTournament({
    required String token,
    required int tournamentId,
    String? refundNotes,
  }) async {
    isMutating = true;
    activeTournamentId = tournamentId;
    errorMessage = null;
    notifyListeners();

    try {
      await _service.withdrawFromTournament(
        token: token,
        tournamentId: tournamentId,
        refundNotes: refundNotes,
      );
      await loadTournaments(token: token, businessId: loadedBusinessId);
      return true;
    } catch (error) {
      errorMessage = error.toString();
      return false;
    } finally {
      isMutating = false;
      activeTournamentId = null;
      notifyListeners();
    }
  }

  Future<void> loadBracket({required int tournamentId}) async {
    _loadingBracketIds.add(tournamentId);
    _bracketErrors.remove(tournamentId);
    notifyListeners();

    try {
      final data = await _service.fetchBracket(tournamentId: tournamentId);
      final bracketJson = data['bracket'];

      if (bracketJson is Map) {
        bracketsByTournamentId[tournamentId] = TournamentBracket.fromJson(
          Map<String, dynamic>.from(bracketJson),
        );
      } else {
        bracketsByTournamentId.remove(tournamentId);
      }
    } catch (error) {
      _bracketErrors[tournamentId] = error.toString();
    } finally {
      _loadingBracketIds.remove(tournamentId);
      notifyListeners();
    }
  }

  void _mergeRegistrationState() {
    final registrationByTournamentId = {
      for (final tournament in myTournaments)
        tournament.tournamentId: tournament,
    };

    tournaments = tournaments.map((tournament) {
      final registration = registrationByTournamentId[tournament.tournamentId];

      if (registration == null) {
        return tournament.copyWith(
          isRegistered: false,
          isWaitlisted: false,
          hasRegistration: false,
          canWithdrawRegistration: false,
          canJoinWaitlist: tournament.canJoinWaitlist,
          seedNumber: null,
          registrationId: null,
          teamId: null,
          registrationType: null,
          registrationStatus: null,
          attendanceStatus: null,
          waitlistPosition: null,
          bracketMatchCount: tournament.bracketMatchCount,
          completedBracketMatchCount: tournament.completedBracketMatchCount,
          hasBracket: tournament.hasBracket,
          waitlistCount: tournament.waitlistCount,
          teamName: '',
          rosterCount: 0,
          roster: const [],
          paymentStatus: null,
          paymentMethod: '',
          paymentReference: '',
          paymentNotes: '',
          amountDue: 0,
          amountPaid: 0,
          outstandingAmount: 0,
          paidAt: null,
          refundStatus: null,
          refundRequestedAmount: 0,
          refundProcessedAmount: 0,
          refundRequestedAt: null,
          refundProcessedAt: null,
          refundNotes: '',
          refundEligible: false,
          refundableAmount: 0,
          checkedInAt: null,
          noShowMarkedAt: null,
          registeredAt: null,
          waitlistedAt: null,
          waitlistPromotedAt: null,
        );
      }

      return tournament.copyWith(
        registeredCount: registration.registeredCount,
        availableSlots: registration.availableSlots,
        hasAvailableSlots: registration.hasAvailableSlots,
        canRegister: registration.canRegister,
        canJoinWaitlist: registration.canJoinWaitlist,
        operationsStage: registration.operationsStage,
        hasRegistration: registration.hasRegistration,
        isRegistered: registration.isRegistered,
        isWaitlisted: registration.isWaitlisted,
        canWithdrawRegistration: registration.canWithdrawRegistration,
        seededCount: registration.seededCount,
        bracketMatchCount: registration.bracketMatchCount,
        completedBracketMatchCount: registration.completedBracketMatchCount,
        hasBracket: registration.hasBracket,
        seedNumber: registration.seedNumber,
        registrationId: registration.registrationId,
        teamId: registration.teamId,
        registrationType: registration.registrationType,
        registrationStatus: registration.registrationStatus,
        attendanceStatus: registration.attendanceStatus,
        waitlistPosition: registration.waitlistPosition,
        teamName: registration.teamName,
        rosterCount: registration.rosterCount,
        roster: registration.roster,
        paymentStatus: registration.paymentStatus,
        paymentMethod: registration.paymentMethod,
        paymentReference: registration.paymentReference,
        paymentNotes: registration.paymentNotes,
        amountDue: registration.amountDue,
        amountPaid: registration.amountPaid,
        outstandingAmount: registration.outstandingAmount,
        paidAt: registration.paidAt,
        refundStatus: registration.refundStatus,
        refundRequestedAmount: registration.refundRequestedAmount,
        refundProcessedAmount: registration.refundProcessedAmount,
        refundRequestedAt: registration.refundRequestedAt,
        refundProcessedAt: registration.refundProcessedAt,
        refundNotes: registration.refundNotes,
        refundEligible: registration.refundEligible,
        refundableAmount: registration.refundableAmount,
        bracketHandoffAt: registration.bracketHandoffAt,
        checkedInCount: registration.checkedInCount,
        noShowCount: registration.noShowCount,
        pendingCheckInCount: registration.pendingCheckInCount,
        waitlistCount: registration.waitlistCount,
        checkedInAt: registration.checkedInAt,
        noShowMarkedAt: registration.noShowMarkedAt,
        registeredAt: registration.registeredAt,
        waitlistedAt: registration.waitlistedAt,
        waitlistPromotedAt: registration.waitlistPromotedAt,
      );
    }).toList();
  }
}
