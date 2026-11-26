part of 'tournament_screen.dart';

class _TournamentNotificationCard extends StatelessWidget {
  final TournamentNotification notification;
  final bool isBusy;
  final VoidCallback onTap;

  const _TournamentNotificationCard({
    required this.notification,
    required this.isBusy,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = _notificationEventColor(notification.eventType);

    return AppInteractiveSurface(
      onTap: isBusy ? null : onTap,
      child: GlassPanel(
        glowColor: notification.isRead ? AppTheme.lightTurquoise : accent,
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
                        notification.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${notification.resolvedTournamentTitle} | ${_formatNotificationEvent(notification.eventType)}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                GlowBadge(
                  label: notification.isRead ? 'Read' : 'New',
                  color: notification.isRead ? AppTheme.secondaryText : accent,
                  icon: notification.isRead
                      ? Icons.mark_email_read_outlined
                      : _notificationEventIcon(notification.eventType),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              notification.message,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.raisedSurface.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: AppTheme.subtleBorder.withValues(alpha: 0.8),
                ),
              ),
              child: Column(
                children: [
                  _TournamentInfoLine(
                    label: 'Event',
                    value: _formatNotificationEvent(notification.eventType),
                    icon: _notificationEventIcon(notification.eventType),
                    accent: accent,
                  ),
                  _TournamentInfoLine(
                    label: 'When',
                    value: formatDateTime(notification.createdAt),
                    icon: Icons.schedule_rounded,
                  ),
                  _TournamentInfoLine(
                    label: 'Email',
                    value: titleCase(
                      notification.emailStatus.replaceAll('_', ' '),
                    ),
                    icon: Icons.mail_outline_rounded,
                    accent: notification.emailStatus == 'failed'
                        ? AppTheme.danger
                        : notification.emailStatus == 'sent'
                        ? AppTheme.success
                        : AppTheme.lightTurquoise,
                    isLast: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonal(
                onPressed: isBusy ? null : onTap,
                child: isBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Open event'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TournamentCommunityPostCard extends StatelessWidget {
  final TournamentCommunityPost post;
  final VoidCallback onTap;
  final bool isSignedIn;
  final bool isLiked;
  final bool isBusy;
  final int reactionCount;
  final VoidCallback? onLike;
  final VoidCallback? onReport;

  const _TournamentCommunityPostCard({
    required this.post,
    required this.onTap,
    required this.isSignedIn,
    required this.isLiked,
    required this.isBusy,
    required this.reactionCount,
    required this.onLike,
    required this.onReport,
  });

  @override
  Widget build(BuildContext context) {
    final accent = _communityPostToneColor(post.accentTone);
    final linkedTournament = post.linkedTournament;

    return AppInteractiveSurface(
      onTap: onTap,
      child: GlassPanel(
        glowColor: accent,
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
                        post.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if (post.subtitle.trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          post.subtitle,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                GlowBadge(
                  label: post.badgeLabel.trim().isNotEmpty
                      ? post.badgeLabel
                      : _formatCommunityPostType(post.contentType),
                  color: accent,
                  icon: _communityPostIcon(post.contentType),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              post.summary,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppTheme.secondaryText,
                height: 1.55,
              ),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.raisedSurface.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: AppTheme.subtleBorder.withValues(alpha: 0.8),
                ),
              ),
              child: Column(
                children: [
                  _TournamentInfoLine(
                    label: 'Type',
                    value: _formatCommunityPostType(post.contentType),
                    icon: _communityPostIcon(post.contentType),
                    accent: accent,
                  ),
                  if (linkedTournament != null)
                    _TournamentInfoLine(
                      label: 'Linked event',
                      value: linkedTournament.title,
                      icon: Icons.emoji_events_outlined,
                      accent: AppTheme.lightTurquoise,
                    ),
                  _TournamentInfoLine(
                    label: post.startsAt != null ? 'Starts' : 'Published',
                    value: formatDateTime(post.startsAt ?? post.publishedAt),
                    icon: Icons.schedule_rounded,
                    isLast: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonal(
                onPressed: onTap,
                child: Text(
                  post.ctaLabel.trim().isNotEmpty ? post.ctaLabel : 'Read more',
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton.icon(
                  onPressed: isBusy ? null : onLike,
                  icon: isBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(isLiked ? Icons.favorite : Icons.favorite_border),
                  label: Text(
                    '$reactionCount ${reactionCount == 1 ? 'like' : 'likes'}',
                  ),
                ),
                const Spacer(),
                if (isSignedIn)
                  TextButton.icon(
                    onPressed: onReport,
                    icon: const Icon(Icons.flag_outlined),
                    label: const Text('Report'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TournamentMatchHighlightCard extends StatelessWidget {
  final Map<String, dynamic> highlight;

  const _TournamentMatchHighlightCard({required this.highlight});

  @override
  Widget build(BuildContext context) {
    final winner = '${highlight['winner_name'] ?? 'Winner'}';
    final runnerUp = '${highlight['runner_up_name'] ?? 'Runner-up'}';
    final winnerScore = highlight['winner_score']?.toString() ?? '—';
    final runnerUpScore = highlight['runner_up_score']?.toString() ?? '—';
    final round = int.tryParse('${highlight['round_number'] ?? 0}') ?? 0;
    final game = '${highlight['game_title'] ?? ''}';
    final tournament = '${highlight['tournament_title'] ?? 'Tournament'}';
    return GlassPanel(
      glowColor: AppTheme.lightTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(tournament, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            [
              if (game.trim().isNotEmpty) game,
              if (round > 0) 'Round $round',
            ].join(' · '),
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Winner',
                      style: Theme.of(
                        context,
                      ).textTheme.labelSmall?.copyWith(color: AppTheme.success),
                    ),
                    Text(winner, style: Theme.of(context).textTheme.titleSmall),
                  ],
                ),
              ),
              Text(
                '$winnerScore  –  $runnerUpScore',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Runner-up',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                    Text(
                      runnerUp,
                      textAlign: TextAlign.end,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TournamentTeamInviteCard extends StatelessWidget {
  final PersistentTournamentTeamInvite invite;
  final bool isBusy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const _TournamentTeamInviteCard({
    required this.invite,
    required this.isBusy,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      glowColor: AppTheme.primaryOrange,
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
                      invite.teamDisplayName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      invite.preferredGame.isNotEmpty
                          ? '${invite.inviterName.isNotEmpty ? invite.inviterName : 'Team captain'} invited you to join this ${invite.preferredGame} squad.'
                          : '${invite.inviterName.isNotEmpty ? invite.inviterName : 'Team captain'} invited you to join this squad.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              GlowBadge(
                label: 'Pending',
                color: AppTheme.primaryOrange,
                icon: Icons.mark_email_unread_outlined,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.raisedSurface.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppTheme.subtleBorder.withValues(alpha: 0.8),
              ),
            ),
            child: Column(
              children: [
                _TournamentInfoLine(
                  label: 'Slot',
                  value: invite.member == null
                      ? 'Teammate'
                      : 'Player ${invite.member!.slotNumber}',
                  icon: Icons.person_outline_rounded,
                ),
                if ((invite.member?.memberName ?? '').trim().isNotEmpty)
                  _TournamentInfoLine(
                    label: 'Player',
                    value: invite.member!.memberName,
                    icon: Icons.badge_outlined,
                    accent: AppTheme.lightTurquoise,
                  ),
                _TournamentInfoLine(
                  label: 'Invited by',
                  value: invite.inviterName.isNotEmpty
                      ? invite.inviterName
                      : 'Team captain',
                  icon: Icons.workspace_premium_outlined,
                  accent: AppTheme.success,
                  isLast: true,
                ),
              ],
            ),
          ),
          if (invite.message.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              invite.message,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: isBusy ? null : onDecline,
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: isBusy ? null : onAccept,
                  child: isBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Accept'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TournamentLeaderboardCard extends StatelessWidget {
  final TournamentLeaderboardEntry entry;
  final bool isCurrentUser;

  const _TournamentLeaderboardCard({
    required this.entry,
    required this.isCurrentUser,
  });

  @override
  Widget build(BuildContext context) {
    final accent = isCurrentUser ? AppTheme.primaryOrange : AppTheme.success;
    final profileLine = [
      if (entry.gamerTag.isNotEmpty &&
          entry.gamerTag != entry.resolvedDisplayName)
        entry.gamerTag,
      if (entry.favoriteGame.isNotEmpty) entry.favoriteGame,
      if (entry.mostPlayedTournamentGame.isNotEmpty)
        'Most played: ${entry.mostPlayedTournamentGame}',
    ].join(' | ');

    return GlassPanel(
      glowColor: accent,
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
                      entry.resolvedDisplayName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (profileLine.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        profileLine,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              GlowBadge(
                label: entry.tournamentRank == null
                    ? 'Unranked'
                    : '#${entry.tournamentRank}',
                color: accent,
                icon: Icons.emoji_events_outlined,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _TournamentMiniTile(
                  label: 'Points',
                  value: '${entry.tournamentPoints}',
                  accent: accent,
                  icon: Icons.bolt_outlined,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _TournamentMiniTile(
                  label: 'Win rate',
                  value: '${entry.tournamentWinRate.toStringAsFixed(1)}%',
                  accent: AppTheme.lightTurquoise,
                  icon: Icons.stacked_line_chart_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.raisedSurface.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppTheme.subtleBorder.withValues(alpha: 0.8),
              ),
            ),
            child: Column(
              children: [
                _TournamentInfoLine(
                  label: 'Titles',
                  value: '${entry.tournamentChampionships}',
                  icon: Icons.workspace_premium_outlined,
                  accent: AppTheme.warning,
                ),
                _TournamentInfoLine(
                  label: 'Wins',
                  value: '${entry.tournamentMatchWins}',
                  icon: Icons.military_tech_outlined,
                  accent: AppTheme.success,
                ),
                _TournamentInfoLine(
                  label: 'Entries',
                  value:
                      '${entry.tournamentEntries} • Checked in ${entry.tournamentsCheckedIn} • No-shows ${entry.tournamentsNoShow}',
                  icon: Icons.fact_check_outlined,
                  isLast: entry.lastTournamentAt == null,
                ),
                if (entry.lastTournamentAt != null)
                  _TournamentInfoLine(
                    label: 'Last event',
                    value: formatDateTime(entry.lastTournamentAt),
                    icon: Icons.history_rounded,
                    isLast: true,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TournamentMiniTile extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;
  final IconData icon;

  const _TournamentMiniTile({
    required this.label,
    required this.value,
    required this.accent,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: accent),
          const SizedBox(height: 10),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _TournamentInfoLine extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? accent;
  final bool isLast;

  const _TournamentInfoLine({
    required this.label,
    required this.value,
    required this.icon,
    this.accent,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    final resolvedAccent = accent ?? AppTheme.secondaryText;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 16, color: resolvedAccent),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
