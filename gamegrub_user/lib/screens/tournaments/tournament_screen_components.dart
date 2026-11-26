part of 'tournament_screen.dart';

class _TournamentCard extends StatelessWidget {
  final Tournament tournament;
  final bool isMine;
  final bool isBusy;
  final VoidCallback? onRegister;
  final VoidCallback? onWithdraw;

  const _TournamentCard({
    required this.tournament,
    required this.isMine,
    required this.isBusy,
    required this.onRegister,
    required this.onWithdraw,
  });

  String _registrationLabel() {
    if (tournament.isWaitlisted) {
      return tournament.waitlistPosition != null
          ? 'Waitlist #${tournament.waitlistPosition}'
          : 'On waitlist';
    }

    if (tournament.isRegistered) {
      return 'Registered';
    }

    if (tournament.canRegister) {
      return 'Registration open';
    }

    if (tournament.canJoinWaitlist) {
      return 'Waitlist open';
    }

    if (tournament.registrationOpenAt != null &&
        tournament.registrationOpenAt!.isAfter(DateTime.now())) {
      return 'Registration opens soon';
    }

    return 'Registration closed';
  }

  Color _registrationColor() {
    if (tournament.isWaitlisted) {
      return AppTheme.warning;
    }

    if (tournament.isRegistered) {
      return AppTheme.success;
    }

    if (tournament.canRegister) {
      return AppTheme.primaryTurquoise;
    }

    if (tournament.canJoinWaitlist) {
      return AppTheme.warning;
    }

    if (tournament.registrationOpenAt != null &&
        tournament.registrationOpenAt!.isAfter(DateTime.now())) {
      return AppTheme.warning;
    }

    return AppTheme.danger;
  }

  bool get _showTeamPanel =>
      tournament.registrationType == 'team' &&
      (tournament.teamName.isNotEmpty || tournament.roster.isNotEmpty);

  String get _gameLabel {
    final gameTitle = tournament.gameTitle.trim();
    if (gameTitle.isNotEmpty) {
      return gameTitle;
    }

    return 'Game updating soon';
  }

  String get _locationSummary {
    final locationLabel = tournament.locationLabel.trim();
    if (locationLabel.isNotEmpty) {
      return locationLabel;
    }

    final hostLocation = tournament.hostBusinessLocation.trim();
    if (hostLocation.isNotEmpty) {
      return hostLocation;
    }

    return 'Location updating soon';
  }

  @override
  Widget build(BuildContext context) {
    final registrationColor = _registrationColor();

    return AppInteractiveSurface(
      onTap: () => _showTournamentSheet(context, tournament),
      child: GlassPanel(
        glowColor: tournament.isFeatured
            ? AppTheme.primaryOrange
            : AppTheme.primaryTurquoise,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _TournamentCoverImage(tournament: tournament, height: 188),
            const SizedBox(height: 18),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tournament.title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 6),
                Text(
                  tournament.hostBusinessLabel,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppTheme.primaryOrange,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '$_gameLabel | ${tournament.teamLabel}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    GlowBadge(
                      label: titleCase(
                        tournament.normalizedStatus.replaceAll('_', ' '),
                      ),
                      color: tournament.isFeatured
                          ? AppTheme.primaryOrange
                          : AppTheme.lightTurquoise,
                      icon: tournament.isFeatured
                          ? Icons.workspace_premium_rounded
                          : Icons.schedule_rounded,
                    ),
                    GlowBadge(
                      label: _registrationLabel(),
                      color: registrationColor,
                      icon: tournament.isWaitlisted
                          ? Icons.hourglass_bottom_rounded
                          : tournament.canRegister
                          ? Icons.how_to_reg_rounded
                          : tournament.canJoinWaitlist
                          ? Icons.playlist_add_check_circle_outlined
                          : tournament.isRegistered
                          ? Icons.verified_rounded
                          : Icons.lock_clock_rounded,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 18),
            if (tournament.summary.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  tournament.summary,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            GlassPanel(
              padding: const EdgeInsets.all(16),
              borderRadius: const BorderRadius.all(Radius.circular(20)),
              shadowStrength: 0.55,
              child: Column(
                children: [
                  _TournamentInfoLine(
                    label: 'Location',
                    value: _locationSummary,
                    icon: Icons.place_outlined,
                    accent: AppTheme.warning,
                  ),
                  _TournamentInfoLine(
                    label: 'Starts',
                    value: formatDateTime(tournament.startAt),
                    icon: Icons.event_rounded,
                    accent: AppTheme.lightTurquoise,
                    isLast: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final availableWidth = constraints.maxWidth;
                final tileWidth = availableWidth < 560
                    ? availableWidth
                    : (availableWidth - 12) / 2;

                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: tileWidth,
                      child: _TournamentMiniTile(
                        label: 'Entry fee',
                        value: formatCurrency(tournament.entryFee),
                        accent: AppTheme.primaryOrange,
                        icon: Icons.sell_outlined,
                      ),
                    ),
                    SizedBox(
                      width: tileWidth,
                      child: _TournamentMiniTile(
                        label: 'Prize pool',
                        value: formatCurrency(tournament.effectivePrizePool),
                        accent: AppTheme.warning,
                        icon: Icons.emoji_events_outlined,
                      ),
                    ),
                  ],
                );
              },
            ),
            if (_showTeamPanel) ...[
              const SizedBox(height: 16),
              _TournamentTeamPanel(tournament: tournament),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: isBusy
                        ? null
                        : tournament.hasRegistration
                        ? null
                        : (tournament.canRegister || tournament.canJoinWaitlist)
                        ? onRegister
                        : null,
                    child: isBusy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            tournament.isWaitlisted
                                ? 'Waitlisted'
                                : tournament.isRegistered
                                ? 'Registered'
                                : tournament.canRegister
                                ? tournament.format == 'solo'
                                      ? 'Register solo'
                                      : 'Register team'
                                : tournament.canJoinWaitlist
                                ? 'Join waitlist'
                                : 'Registration closed',
                          ),
                  ),
                ),
                if (tournament.canWithdrawRegistration) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: isBusy ? null : onWithdraw,
                      child: Text(
                        tournament.isWaitlisted
                            ? 'Leave waitlist'
                            : isMine
                            ? 'Withdraw'
                            : 'Leave spot',
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () => _showTournamentSheet(context, tournament),
              child: const Text('View details'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TournamentCoverImage extends StatelessWidget {
  final Tournament tournament;
  final double height;

  const _TournamentCoverImage({required this.tournament, required this.height});

  @override
  Widget build(BuildContext context) {
    final hasVisual = tournament.coverImage.trim().isNotEmpty;
    final shouldShowTextOverlay = !hasVisual;

    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppTheme.primaryOrange.withValues(alpha: 0.16),
              AppTheme.lightTurquoise.withValues(alpha: 0.14),
              AppTheme.backgroundDeep.withValues(alpha: 0.72),
            ],
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (hasVisual)
              Positioned.fill(
                child: AppSmartImage(
                  source: tournament.coverImage,
                  fallback: const SizedBox.shrink(),
                ),
              ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: hasVisual ? 0.02 : 0),
                    Colors.black.withValues(alpha: 0.08),
                    Colors.black.withValues(alpha: 0.28),
                  ],
                  stops: const [0, 0.58, 1],
                ),
              ),
            ),
            Positioned(
              top: 16,
              left: 16,
              child: GlowBadge(
                label: tournament.isFeatured ? 'Featured event' : 'Tournament',
                color: tournament.isFeatured
                    ? AppTheme.primaryOrange
                    : AppTheme.lightTurquoise,
                icon: tournament.isFeatured
                    ? Icons.workspace_premium_rounded
                    : Icons.emoji_events_outlined,
              ),
            ),
            if (shouldShowTextOverlay)
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            tournament.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            tournament.gameTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Colors.white.withValues(alpha: 0.84),
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.18),
                        ),
                      ),
                      child: Icon(
                        tournament.format == 'solo'
                            ? Icons.person_outline_rounded
                            : Icons.groups_rounded,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              )
            else
              Positioned(
                right: 16,
                bottom: 16,
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.16),
                    ),
                  ),
                  child: Icon(
                    tournament.format == 'solo'
                        ? Icons.person_outline_rounded
                        : Icons.groups_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TournamentTeamPanel extends StatelessWidget {
  final Tournament tournament;

  const _TournamentTeamPanel({required this.tournament});

  @override
  Widget build(BuildContext context) {
    final roster = tournament.roster;

    return GlassPanel(
      padding: const EdgeInsets.all(16),
      borderRadius: const BorderRadius.all(Radius.circular(20)),
      shadowStrength: 0.5,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            tournament.teamName.isNotEmpty
                ? tournament.teamName
                : 'Registered team',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            '${tournament.rosterCount} players locked in for this registration.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          if (roster.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...roster.map(
              (member) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GlowBadge(
                      label: member.isCaptain
                          ? 'Captain'
                          : 'Slot ${member.slotNumber}',
                      color: member.isCaptain
                          ? AppTheme.primaryOrange
                          : AppTheme.lightTurquoise,
                      icon: member.isCaptain
                          ? Icons.workspace_premium_rounded
                          : Icons.person_outline_rounded,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            member.memberName,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          if (member.memberEmail.isNotEmpty ||
                              member.memberMobile.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                [
                                  if (member.memberEmail.isNotEmpty)
                                    member.memberEmail,
                                  if (member.memberMobile.isNotEmpty)
                                    member.memberMobile,
                                ].join(' | '),
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SavedTournamentTeamCard extends StatelessWidget {
  final PersistentTournamentTeam team;
  final bool isBusy;
  final VoidCallback? onEdit;
  final void Function(PersistentTournamentTeamMember member)? onInviteMember;
  final bool Function(int? teamMemberId)? isMemberInviteBusy;

  const _SavedTournamentTeamCard({
    required this.team,
    required this.isBusy,
    required this.onEdit,
    required this.onInviteMember,
    required this.isMemberInviteBusy,
  });

  @override
  Widget build(BuildContext context) {
    final latestHistory = team.latestHistory;

    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      team.displayName,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      team.preferredGame.isNotEmpty
                          ? 'Preferred game: ${team.preferredGame}'
                          : 'Reusable squad ready for tournaments that match this roster size.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  GlowBadge(
                    label: _formatTeamViewerRole(team.viewerRole),
                    color: team.canEdit
                        ? AppTheme.primaryOrange
                        : AppTheme.lightTurquoise,
                    icon: team.canEdit
                        ? Icons.workspace_premium_outlined
                        : Icons.groups_2_outlined,
                  ),
                  if (onEdit != null) ...[
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: isBusy ? null : onEdit,
                      icon: isBusy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.edit_outlined),
                      label: Text(isBusy ? 'Saving...' : 'Edit'),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              StatChip(
                label: 'Roster',
                value: '${team.rosterCount}',
                icon: Icons.groups_2_outlined,
              ),
              StatChip(
                label: 'Linked',
                value: '${team.acceptedMemberCount}',
                accent: AppTheme.success,
                icon: Icons.link_rounded,
              ),
              if (team.pendingInviteCount > 0)
                StatChip(
                  label: 'Pending invites',
                  value: '${team.pendingInviteCount}',
                  accent: AppTheme.primaryOrange,
                  icon: Icons.mark_email_unread_outlined,
                ),
              StatChip(
                label: 'Entries',
                value: '${team.totalEntries}',
                accent: AppTheme.lightTurquoise,
                icon: Icons.event_note_outlined,
              ),
              StatChip(
                label: 'Titles',
                value: '${team.championshipCount}',
                accent: AppTheme.success,
                icon: Icons.emoji_events_outlined,
              ),
              StatChip(
                label: 'Match wins',
                value: '${team.totalMatchWins}',
                accent: AppTheme.primaryOrange,
                icon: Icons.sports_score_outlined,
              ),
            ],
          ),
          if (team.teamBio.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              team.teamBio,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
          if (team.members.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('Roster', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 10),
            ...team.members.map(
              (member) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GlowBadge(
                      label: member.isCaptain
                          ? 'Captain'
                          : 'Slot ${member.slotNumber}',
                      color: _teamMemberStatusColor(member),
                      icon: member.isCaptain
                          ? Icons.workspace_premium_outlined
                          : Icons.person_outline_rounded,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            member.memberName,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              _formatTeamMemberStatus(member),
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: _teamMemberStatusColor(member),
                                  ),
                            ),
                          ),
                          if (member.memberEmail.isNotEmpty ||
                              member.memberMobile.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                [
                                  if (member.memberEmail.isNotEmpty)
                                    member.memberEmail,
                                  if (member.memberMobile.isNotEmpty)
                                    member.memberMobile,
                                ].join(' | '),
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (team.canEdit && !member.isCaptain) ...[
                      const SizedBox(width: 12),
                      Builder(
                        builder: (context) {
                          final pendingInvite = team.invites.where(
                            (invite) =>
                                invite.teamMemberId == member.teamMemberId,
                          );
                          final hasPendingInvite = pendingInvite.isNotEmpty;
                          final memberBusy =
                              isMemberInviteBusy?.call(member.teamMemberId) ??
                              false;

                          if (member.isAccepted) {
                            return GlowBadge(
                              label: 'Linked',
                              color: AppTheme.success,
                              icon: Icons.verified_user_outlined,
                            );
                          }

                          if (member.memberEmail.trim().isEmpty) {
                            return GlowBadge(
                              label: 'Email needed',
                              color: AppTheme.secondaryText,
                              icon: Icons.mail_outline_rounded,
                            );
                          }

                          if (hasPendingInvite) {
                            return GlowBadge(
                              label: 'Invited',
                              color: AppTheme.primaryOrange,
                              icon: Icons.schedule_send_outlined,
                            );
                          }

                          return OutlinedButton(
                            onPressed: memberBusy || onInviteMember == null
                                ? null
                                : () => onInviteMember!(member),
                            child: memberBusy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('Invite'),
                          );
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          if (latestHistory != null) ...[
            const SizedBox(height: 8),
            Text(
              latestHistory.placement == 'champion'
                  ? 'Latest finish: Champions at ${latestHistory.tournamentTitle}.'
                  : latestHistory.placement == 'runner_up'
                  ? 'Latest finish: Runner-up at ${latestHistory.tournamentTitle}.'
                  : latestHistory.registrationStatus == 'waitlisted'
                  ? 'Latest activity: Waitlisted at ${latestHistory.tournamentTitle}.'
                  : 'Latest activity: ${latestHistory.tournamentTitle}.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
        ],
      ),
    );
  }
}
