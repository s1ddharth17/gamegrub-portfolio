part of 'tournament_screen.dart';

Future<void> _shareTournamentCalendar(
  BuildContext context,
  Tournament tournament,
) async {
  if (tournament.startAt == null) return;
  try {
    final calendar = buildTournamentCalendarIcs(tournament);
    final bytes = Uint8List.fromList(utf8.encode(calendar));
    await SharePlus.instance.share(
      ShareParams(
        title: 'Add ${tournament.title} to your calendar',
        files: [XFile.fromData(bytes, mimeType: 'text/calendar')],
        fileNameOverrides: [
          'gamegrub-tournament-${tournament.tournamentId}.ics',
        ],
      ),
    );
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Calendar entry could not be shared.')),
      );
    }
  }
}

void _showTournamentSheet(BuildContext context, Tournament tournament) {
  context.read<TournamentProvider>().loadBracket(
    tournamentId: tournament.tournamentId,
  );

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.42,
        maxChildSize: 0.92,
        builder: (context, controller) {
          return Container(
            decoration: BoxDecoration(
              color: AppTheme.backgroundDeep,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
              children: [
                Center(
                  child: Container(
                    width: 54,
                    height: 5,
                    decoration: BoxDecoration(
                      color: AppTheme.subtleBorder,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                _TournamentCoverImage(tournament: tournament, height: 220),
                const SizedBox(height: 18),
                Text(
                  tournament.title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  '${tournament.gameTitle} | ${tournament.teamLabel}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: 18),
                GlassPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppSectionTitle(
                        title: 'Tournament details',
                        subtitle:
                            'Registrations, waitlist movement, attendance, and live bracket progress are visible here now.',
                      ),
                      const SizedBox(height: 16),
                      AppDataRow(
                        label: 'Starts',
                        value: formatDateTime(tournament.startAt),
                      ),
                      AppDataRow(
                        label: 'Ends',
                        value: formatDateTime(tournament.endAt),
                      ),
                      AppDataRow(
                        label: 'Venue',
                        value: tournament.locationLabel,
                      ),
                      if (tournament.businessAddressLine1.trim().isNotEmpty)
                        AppDataRow(
                          label: 'Address',
                          value: [
                            tournament.businessAddressLine1,
                            tournament.businessCity,
                            tournament.businessState,
                          ].where((part) => part.trim().isNotEmpty).join(', '),
                        ),
                      AppDataRow(
                        label: 'Venue timezone',
                        value: tournament.businessTimezone,
                      ),
                      AppDataRow(
                        label: 'Skill level',
                        value: titleCase(tournament.skillLevel),
                      ),
                      AppDataRow(
                        label: 'Entry fee',
                        value: formatCurrency(tournament.entryFee),
                      ),
                      AppDataRow(
                        label: 'Prize pool',
                        value: formatCurrency(tournament.effectivePrizePool),
                      ),
                      if (tournament.isSponsored)
                        AppDataRow(
                          label: 'Sponsor',
                          value: tournament.sponsorName.isNotEmpty
                              ? tournament.sponsorName
                              : 'Sponsored event',
                        ),
                      if (tournament.isSponsored &&
                          tournament.sponsorTagline.trim().isNotEmpty)
                        AppDataRow(
                          label: 'Sponsor note',
                          value: tournament.sponsorTagline,
                        ),
                      if (tournament.isPremium)
                        AppDataRow(
                          label: 'Premium access',
                          value:
                              '${tournament.premiumLabel.trim().isNotEmpty ? tournament.premiumLabel : 'Premium access'} | ${formatCurrency(tournament.premiumEntryFee)}',
                        ),
                      if (tournament.isPremium &&
                          tournament.premiumPerks.trim().isNotEmpty)
                        AppDataRow(
                          label: 'Premium perks',
                          value: tournament.premiumPerks,
                        ),
                      if (tournament.entryFee > 0)
                        AppDataRow(
                          label: 'Refund policy',
                          value: _formatRefundPolicy(tournament),
                        ),
                      AppDataRow(
                        label: 'Capacity',
                        value:
                            '${tournament.registeredCount}/${tournament.maxParticipants}',
                      ),
                      if (tournament.waitlistCount > 0 ||
                          tournament.isWaitlisted)
                        AppDataRow(
                          label: tournament.isWaitlisted
                              ? 'Waitlist position'
                              : 'Waitlist',
                          value:
                              tournament.isWaitlisted &&
                                  tournament.waitlistPosition != null
                              ? '#${tournament.waitlistPosition} of ${tournament.waitlistCount}'
                              : '${tournament.waitlistCount} waiting',
                        ),
                      AppDataRow(
                        label: 'Ops stage',
                        value: _formatOperationsStage(
                          tournament.operationsStage,
                        ),
                      ),
                      if (tournament.seededCount > 0)
                        AppDataRow(
                          label: 'Field seeded',
                          value:
                              '${tournament.seededCount}/${tournament.registeredCount}',
                        ),
                      if (tournament.hasBracket)
                        AppDataRow(
                          label: 'Bracket progress',
                          value:
                              '${tournament.completedBracketMatchCount}/${tournament.bracketMatchCount} matches decided',
                        ),
                      if (tournament.checkedInCount > 0 ||
                          tournament.noShowCount > 0 ||
                          tournament.pendingCheckInCount > 0)
                        AppDataRow(
                          label: 'Attendance',
                          value:
                              '${tournament.checkedInCount} checked in | ${tournament.pendingCheckInCount} pending | ${tournament.noShowCount} no-show',
                        ),
                      if (tournament.seedNumber != null)
                        AppDataRow(
                          label: 'Your seed',
                          value: '#${tournament.seedNumber}',
                        ),
                      if (tournament.isRegistered)
                        AppDataRow(
                          label: 'Your attendance',
                          value: _formatAttendanceStatus(
                            tournament.attendanceStatus,
                          ),
                        ),
                      if (tournament.isWaitlisted)
                        AppDataRow(label: 'Your entry', value: 'Waitlisted'),
                      if (tournament.hasRegistration &&
                          (tournament.paymentStatus ?? '').trim().isNotEmpty)
                        AppDataRow(
                          label: 'Payment status',
                          value: _formatPaymentStatus(tournament.paymentStatus),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.premiumAccess)
                        AppDataRow(
                          label: 'Your premium add-on',
                          value:
                              '${tournament.premiumAccessLabel.trim().isNotEmpty ? tournament.premiumAccessLabel : 'Premium access'} | ${formatCurrency(tournament.premiumAccessFee)}',
                        ),
                      if (tournament.hasRegistration &&
                          tournament.amountDue > 0)
                        AppDataRow(
                          label: 'Amount due',
                          value: formatCurrency(tournament.amountDue),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.amountPaid > 0)
                        AppDataRow(
                          label: 'Amount paid',
                          value: formatCurrency(tournament.amountPaid),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.outstandingAmount > 0)
                        AppDataRow(
                          label: 'Outstanding',
                          value: formatCurrency(tournament.outstandingAmount),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.paymentMethod.trim().isNotEmpty)
                        AppDataRow(
                          label: 'Payment method',
                          value: titleCase(tournament.paymentMethod),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.paidAt != null)
                        AppDataRow(
                          label: 'Payment recorded',
                          value: formatDateTime(tournament.paidAt),
                        ),
                      if (tournament.hasRegistration &&
                          (tournament.refundStatus ?? '').trim().isNotEmpty &&
                          tournament.refundStatus != 'not_applicable')
                        AppDataRow(
                          label: 'Refund status',
                          value: _formatRefundStatus(tournament.refundStatus),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.refundableAmount > 0)
                        AppDataRow(
                          label: 'Refundable now',
                          value: formatCurrency(tournament.refundableAmount),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.refundRequestedAmount > 0)
                        AppDataRow(
                          label: 'Refund requested',
                          value: formatCurrency(
                            tournament.refundRequestedAmount,
                          ),
                        ),
                      if (tournament.hasRegistration &&
                          tournament.refundProcessedAmount > 0)
                        AppDataRow(
                          label: 'Refund processed',
                          value: formatCurrency(
                            tournament.refundProcessedAmount,
                          ),
                        ),
                      if (tournament.checkedInAt != null)
                        AppDataRow(
                          label: 'Checked in',
                          value: formatDateTime(tournament.checkedInAt),
                        ),
                      if (tournament.noShowMarkedAt != null)
                        AppDataRow(
                          label: 'No-show marked',
                          value: formatDateTime(tournament.noShowMarkedAt),
                        ),
                      if (tournament.waitlistedAt != null)
                        AppDataRow(
                          label: 'Waitlisted',
                          value: formatDateTime(tournament.waitlistedAt),
                        ),
                      if (tournament.waitlistPromotedAt != null)
                        AppDataRow(
                          label: 'Promoted from waitlist',
                          value: formatDateTime(tournament.waitlistPromotedAt),
                        ),
                      AppDataRow(
                        label: 'Bracket handoff',
                        value: formatDateTime(tournament.bracketHandoffAt),
                        padding: EdgeInsets.zero,
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: tournament.startAt == null
                              ? null
                              : () => _shareTournamentCalendar(
                                  context,
                                  tournament,
                                ),
                          icon: const Icon(Icons.event_available_outlined),
                          label: const Text('Add to calendar'),
                        ),
                      ),
                    ],
                  ),
                ),
                if (tournament.registrationType == 'team' &&
                    (tournament.teamName.isNotEmpty ||
                        tournament.roster.isNotEmpty)) ...[
                  const SizedBox(height: 14),
                  _TournamentTeamPanel(tournament: tournament),
                ],
                const SizedBox(height: 14),
                _TournamentBracketPanel(
                  tournamentId: tournament.tournamentId,
                  registrationId: tournament.registrationId,
                ),
                const SizedBox(height: 14),
                _TournamentNotificationTimeline(
                  tournamentId: tournament.tournamentId,
                ),
                if (tournament.description.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  GlassPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Description',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          tournament.description,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ],
                if (tournament.rules.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  GlassPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Rules',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          tournament.rules,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      );
    },
  );
}

class _TournamentBracketPanel extends StatelessWidget {
  final int tournamentId;
  final int? registrationId;

  const _TournamentBracketPanel({
    required this.tournamentId,
    required this.registrationId,
  });

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TournamentProvider>();
    final bracket = provider.bracketFor(tournamentId);
    final isLoading = provider.isBracketLoadingFor(tournamentId);
    final errorText = provider.bracketErrorFor(tournamentId);

    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionTitle(
            title: 'Live bracket',
            subtitle:
                'Follow the knockout path as seeded matches are reported.',
          ),
          const SizedBox(height: 16),
          if (isLoading && bracket == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (errorText != null && bracket == null)
            Text(
              errorText,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.danger),
            )
          else if (bracket == null || !bracket.hasBracket)
            Text(
              'The bracket has not been generated yet. Once the seeded field is locked from the admin side, it will appear here.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            )
          else ...[
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                StatChip(
                  label: 'Matches',
                  value:
                      '${bracket.completedMatchCount}/${bracket.matchCount} done',
                  icon: Icons.rule_folder_outlined,
                ),
                StatChip(
                  label: 'Rounds',
                  value: '${bracket.roundCount}',
                  accent: AppTheme.primaryOrange,
                  icon: Icons.layers_outlined,
                ),
                StatChip(
                  label: 'Champion',
                  value: bracket.champion?.resolvedDisplayName ?? 'TBD',
                  accent: bracket.isComplete
                      ? AppTheme.success
                      : AppTheme.lightTurquoise,
                  icon: Icons.workspace_premium_rounded,
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...bracket.rounds.map(
              (round) => Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: _BracketRoundSection(
                  round: round,
                  registrationId: registrationId,
                ),
              ),
            ),
            if (errorText != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  errorText,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppTheme.warning),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _TournamentNotificationTimeline extends StatelessWidget {
  final int tournamentId;

  const _TournamentNotificationTimeline({required this.tournamentId});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TournamentProvider>();
    final notifications = provider.notifications
        .where((item) => item.tournamentId == tournamentId)
        .take(5)
        .toList();

    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionTitle(
            title: 'Recent updates',
            subtitle:
                'Tournament announcements and bracket changes appear here.',
          ),
          const SizedBox(height: 16),
          if (notifications.isEmpty)
            Text(
              'No tournament-specific updates have been published yet.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            )
          else
            ...notifications.map(
              (notification) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.surface.withValues(alpha: 0.52),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppTheme.subtleBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              notification.title,
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                          const SizedBox(width: 12),
                          GlowBadge(
                            label: _formatNotificationEvent(
                              notification.eventType,
                            ),
                            color: _notificationEventColor(
                              notification.eventType,
                            ),
                            icon: _notificationEventIcon(
                              notification.eventType,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        notification.message,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        formatDateTime(notification.createdAt),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _BracketRoundSection extends StatelessWidget {
  final TournamentBracketRound round;
  final int? registrationId;

  const _BracketRoundSection({
    required this.round,
    required this.registrationId,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.subtleBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(round.label, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(
            '${round.matches.length} match${round.matches.length == 1 ? '' : 'es'} in this round.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 14),
          ...round.matches.map(
            (match) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _BracketMatchCard(
                match: match,
                registrationId: registrationId,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BracketMatchCard extends StatelessWidget {
  final TournamentBracketMatch match;
  final int? registrationId;

  const _BracketMatchCard({required this.match, required this.registrationId});

  @override
  Widget build(BuildContext context) {
    final statusColor = _bracketMatchStatusColor(match.status);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.backgroundDeep.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.subtleBorder),
      ),
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
                      match.matchLabel,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    if (match.completedAt != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Updated ${formatDateTime(match.completedAt)}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              GlowBadge(
                label: _formatBracketMatchStatus(match.status),
                color: statusColor,
                icon: match.isWalkover
                    ? Icons.flash_on_rounded
                    : match.isDecided
                    ? Icons.verified_rounded
                    : Icons.hourglass_bottom_rounded,
              ),
            ],
          ),
          const SizedBox(height: 14),
          _BracketEntrantRow(
            label: 'Side A',
            entrant: match.slotOne,
            score: match.slotOneScore,
            isWinner:
                match.winnerRegistrationId != null &&
                match.winnerRegistrationId == match.slotOne?.registrationId,
            isMine:
                registrationId != null &&
                registrationId == match.slotOne?.registrationId,
          ),
          const SizedBox(height: 10),
          _BracketEntrantRow(
            label: 'Side B',
            entrant: match.slotTwo,
            score: match.slotTwoScore,
            isWinner:
                match.winnerRegistrationId != null &&
                match.winnerRegistrationId == match.slotTwo?.registrationId,
            isMine:
                registrationId != null &&
                registrationId == match.slotTwo?.registrationId,
          ),
          if (match.notes.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              match.notes,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
          if (match.isWalkover) ...[
            const SizedBox(height: 12),
            Text(
              match.winner != null
                  ? '${match.winner!.resolvedDisplayName} advanced automatically.'
                  : 'This branch closed without an eligible player advancing.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.primaryOrange),
            ),
          ] else if (!match.isDecided &&
              (match.slotOne == null || match.slotTwo == null)) ...[
            const SizedBox(height: 12),
            Text(
              'Awaiting earlier bracket results to lock this match.',
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

class _BracketEntrantRow extends StatelessWidget {
  final String label;
  final TournamentBracketEntrant? entrant;
  final int? score;
  final bool isWinner;
  final bool isMine;

  const _BracketEntrantRow({
    required this.label,
    required this.entrant,
    required this.score,
    required this.isWinner,
    required this.isMine,
  });

  @override
  Widget build(BuildContext context) {
    final resolvedEntrant = entrant;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isWinner
            ? AppTheme.success.withValues(alpha: 0.12)
            : AppTheme.surface.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isWinner
              ? AppTheme.success.withValues(alpha: 0.35)
              : AppTheme.subtleBorder,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  resolvedEntrant?.resolvedDisplayName ?? 'Awaiting player',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  resolvedEntrant == null
                      ? label
                      : [
                          label,
                          if (resolvedEntrant.seedNumber != null)
                            'Seed #${resolvedEntrant.seedNumber}',
                          if (resolvedEntrant.teamName.isNotEmpty &&
                              resolvedEntrant.participantName.isNotEmpty)
                            'Captain: ${resolvedEntrant.participantName}'
                          else if (resolvedEntrant.participantEmail.isNotEmpty)
                            resolvedEntrant.participantEmail,
                        ].join(' | '),
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
              if (isMine)
                const Padding(
                  padding: EdgeInsets.only(bottom: 6),
                  child: GlowBadge(
                    label: 'You',
                    color: AppTheme.primaryOrange,
                    icon: Icons.person_rounded,
                  ),
                ),
              if (isWinner)
                const Padding(
                  padding: EdgeInsets.only(bottom: 6),
                  child: GlowBadge(
                    label: 'Winner',
                    color: AppTheme.success,
                    icon: Icons.emoji_events_rounded,
                  ),
                ),
              if (score != null)
                Text(
                  '$score',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: AppTheme.primaryText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
