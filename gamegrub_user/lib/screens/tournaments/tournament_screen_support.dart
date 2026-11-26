part of 'tournament_screen.dart';

String _formatOperationsStage(String value) {
  switch (value.trim().toLowerCase()) {
    case 'ready_for_brackets':
      return 'Ready for brackets';
    case 'seeding':
      return 'Seeding';
    default:
      return 'Registrations';
  }
}

String _formatAttendanceStatus(String? value) {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'checked_in':
      return 'Checked in';
    case 'no_show':
      return 'No-show';
    case 'pending':
      return 'Pending';
    default:
      return 'Attendance pending';
  }
}

String _formatPaymentStatus(String? value) {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Pending';
    case 'waived':
      return 'Waived';
    case 'not_due':
      return 'Not due';
    case 'refunded':
      return 'Refunded';
    case 'partially_refunded':
      return 'Partially refunded';
    default:
      return 'Not set';
  }
}

String _formatRefundStatus(String? value) {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'requested':
      return 'Requested';
    case 'processing':
      return 'Processing';
    case 'refunded':
      return 'Refunded';
    case 'rejected':
      return 'Rejected';
    case 'not_applicable':
      return 'Not applicable';
    default:
      return 'No refund';
  }
}

String _formatTeamMemberStatus(PersistentTournamentTeamMember member) {
  if (member.isCaptain) {
    return 'Captain';
  }

  switch (member.membershipStatus.trim().toLowerCase()) {
    case 'accepted':
      return 'Linked';
    case 'declined':
      return 'Declined';
    default:
      return 'Invite pending';
  }
}

Color _teamMemberStatusColor(PersistentTournamentTeamMember member) {
  if (member.isCaptain) {
    return AppTheme.primaryOrange;
  }

  switch (member.membershipStatus.trim().toLowerCase()) {
    case 'accepted':
      return AppTheme.success;
    case 'declined':
      return AppTheme.danger;
    default:
      return AppTheme.lightTurquoise;
  }
}

String _formatTeamViewerRole(String value) {
  return value.trim().toLowerCase() == 'member'
      ? 'Member view'
      : 'Captain view';
}

String _formatRefundPolicy(Tournament tournament) {
  switch (tournament.refundPolicy.trim().toLowerCase()) {
    case 'full_before_cutoff':
      return 'Full refund until ${tournament.refundCutoffHours}h before start';
    case 'partial_before_cutoff':
      return '${tournament.refundPercentage}% refund until ${tournament.refundCutoffHours}h before start';
    default:
      return 'No automatic refunds';
  }
}

String _formatBracketMatchStatus(String value) {
  switch (value.trim().toLowerCase()) {
    case 'completed':
      return 'Completed';
    case 'walkover':
      return 'Walkover';
    default:
      return 'Pending';
  }
}

Color _bracketMatchStatusColor(String value) {
  switch (value.trim().toLowerCase()) {
    case 'completed':
      return AppTheme.success;
    case 'walkover':
      return AppTheme.primaryOrange;
    default:
      return AppTheme.lightTurquoise;
  }
}

String _formatNotificationEvent(String value) {
  switch (value.trim().toLowerCase()) {
    case 'tournament_published':
      return 'Published';
    case 'tournament_cancelled':
      return 'Cancelled';
    case 'bracket_ready':
      return 'Bracket live';
    case 'match_result':
      return 'Match result';
    case 'champion_declared':
      return 'Champion';
    case 'waitlist_joined':
      return 'Waitlist joined';
    case 'waitlist_promoted':
      return 'Waitlist promoted';
    default:
      return 'Update';
  }
}

Color _notificationEventColor(String value) {
  switch (value.trim().toLowerCase()) {
    case 'tournament_cancelled':
      return AppTheme.danger;
    case 'match_result':
      return AppTheme.primaryOrange;
    case 'champion_declared':
      return AppTheme.success;
    case 'waitlist_promoted':
      return AppTheme.success;
    case 'waitlist_joined':
      return AppTheme.warning;
    default:
      return AppTheme.lightTurquoise;
  }
}

IconData _notificationEventIcon(String value) {
  switch (value.trim().toLowerCase()) {
    case 'tournament_published':
      return Icons.campaign_outlined;
    case 'tournament_cancelled':
      return Icons.event_busy_outlined;
    case 'bracket_ready':
      return Icons.account_tree_outlined;
    case 'match_result':
      return Icons.emoji_events_outlined;
    case 'champion_declared':
      return Icons.workspace_premium_outlined;
    case 'waitlist_joined':
      return Icons.hourglass_bottom_rounded;
    case 'waitlist_promoted':
      return Icons.upgrade_rounded;
    default:
      return Icons.notifications_active_outlined;
  }
}

String _formatCommunityPostType(String value) {
  switch (value.trim().toLowerCase()) {
    case 'community_update':
      return 'Community update';
    case 'promo':
      return 'Promo';
    case 'recap':
      return 'Recap';
    default:
      return 'Spotlight';
  }
}

Color _communityPostToneColor(String value) {
  switch (value.trim().toLowerCase()) {
    case 'turquoise':
      return AppTheme.lightTurquoise;
    case 'gold':
      return AppTheme.warning;
    case 'rose':
      return const Color(0xFFF472B6);
    default:
      return AppTheme.primaryOrange;
  }
}

IconData _communityPostIcon(String value) {
  switch (value.trim().toLowerCase()) {
    case 'community_update':
      return Icons.groups_rounded;
    case 'promo':
      return Icons.local_fire_department_outlined;
    case 'recap':
      return Icons.history_edu_outlined;
    default:
      return Icons.campaign_outlined;
  }
}

class _TeamRegistrationDraft {
  final int? teamId;
  final String teamName;
  final List<Map<String, dynamic>> roster;

  const _TeamRegistrationDraft({
    required this.teamId,
    required this.teamName,
    required this.roster,
  });
}

class _PersistentTeamEditorDraft {
  final String teamName;
  final String teamTag;
  final String preferredGame;
  final String teamBio;
  final List<Map<String, dynamic>> roster;

  const _PersistentTeamEditorDraft({
    required this.teamName,
    required this.teamTag,
    required this.preferredGame,
    required this.teamBio,
    required this.roster,
  });
}

class _RosterFieldGroup {
  final TextEditingController nameController;
  final TextEditingController emailController;
  final TextEditingController mobileController;

  _RosterFieldGroup({String name = '', String email = '', String mobile = ''})
    : nameController = TextEditingController(text: name),
      emailController = TextEditingController(text: email),
      mobileController = TextEditingController(text: mobile);

  void populate({String name = '', String email = '', String mobile = ''}) {
    nameController.text = name;
    emailController.text = email;
    mobileController.text = mobile;
  }

  void dispose() {
    nameController.dispose();
    emailController.dispose();
    mobileController.dispose();
  }
}
