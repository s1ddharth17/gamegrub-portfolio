part of 'tournament_screen.dart';

String _tournamentGameLabel(Tournament tournament) {
  final gameTitle = tournament.gameTitle.trim();
  return gameTitle.isNotEmpty ? gameTitle : 'Open bracket';
}

String _tournamentMatchupLabel(Tournament tournament) {
  if (tournament.teamSize <= 1) {
    return '1v1';
  }

  return '${tournament.teamSize}v${tournament.teamSize}';
}

String _tournamentEntryFeeLabel(Tournament tournament) {
  if (tournament.entryFee <= 0) {
    return 'Free entry';
  }

  return formatCurrency(tournament.entryFee);
}

String _tournamentLocationSummary(Tournament tournament) {
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

String _tournamentShortLocation(Tournament tournament) {
  final hostLocation = tournament.hostBusinessLocation.trim();
  if (hostLocation.isNotEmpty) {
    return hostLocation;
  }

  return _tournamentLocationSummary(tournament);
}

class _TournamentMarketplaceHero extends StatelessWidget {
  final String title;
  final String location;
  final String? accentLabel;
  final TextEditingController searchController;
  final String searchQuery;
  final String searchHint;
  final String stateLabel;
  final String cityLabel;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _TournamentMarketplaceHero({
    required this.title,
    required this.location,
    required this.accentLabel,
    required this.searchController,
    required this.searchQuery,
    required this.searchHint,
    required this.stateLabel,
    required this.cityLabel,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(36),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFF9E84FF).withValues(alpha: 0.9),
              const Color(0xFF6C7BFF).withValues(alpha: 0.84),
              const Color(0xFFFFB3C5).withValues(alpha: 0.76),
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF8B5CF6).withValues(alpha: 0.16),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              top: -36,
              right: -24,
              child: IgnorePointer(
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.16),
                  ),
                ),
              ),
            ),
            Positioned(
              left: -24,
              bottom: -44,
              child: IgnorePointer(
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.lg,
                AppSpace.lg,
                AppSpace.lg,
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
                              title,
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                            const SizedBox(height: AppSpace.xs2),
                            Text(
                              location,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.9),
                                    fontWeight: FontWeight.w500,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      if (accentLabel != null) ...[
                        const SizedBox(width: AppSpace.md),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpace.sm,
                            vertical: AppSpace.xs,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.18),
                            ),
                          ),
                          child: Text(
                            accentLabel!,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpace.md),
                  _TournamentSearchDock(
                    controller: searchController,
                    searchHint: searchHint,
                    searchQuery: searchQuery,
                    stateLabel: stateLabel,
                    cityLabel: cityLabel,
                    onChanged: onChanged,
                    onClear: onClear,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TournamentSearchDock extends StatelessWidget {
  final TextEditingController controller;
  final String searchHint;
  final String searchQuery;
  final String stateLabel;
  final String cityLabel;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _TournamentSearchDock({
    required this.controller,
    required this.searchHint,
    required this.searchQuery,
    required this.stateLabel,
    required this.cityLabel,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Container(
            height: 78,
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0xFFF0EAF7)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF8B5CF6).withValues(alpha: 0.08),
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.search_rounded,
                  color: AppTheme.primaryOrange,
                  size: 34,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: TextField(
                    controller: controller,
                    onChanged: onChanged,
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      hintText: searchHint,
                      hintStyle: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(
                            color: const Color(0xFF8B8FA3),
                            fontWeight: FontWeight.w500,
                          ),
                    ),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: const Color(0xFF32364A),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                AnimatedSwitcher(
                  duration: AppMotion.normal,
                  child: searchQuery.trim().isEmpty
                      ? const Icon(
                          Icons.emoji_events_outlined,
                          key: ValueKey('tournament-icon'),
                          color: AppTheme.primaryOrange,
                          size: 30,
                        )
                      : IconButton(
                          key: const ValueKey('clear'),
                          onPressed: onClear,
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Color(0xFF656B84),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: AppSpace.sm),
        Container(
          width: 104,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.xs,
            vertical: AppSpace.sm,
          ),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white.withValues(alpha: 0.72)),
          ),
          child: Column(
            children: [
              Text(
                'STATE',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF191D33),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              Text(
                stateLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF5D6480),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpace.xs2),
              Text(
                'CITY',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF191D33),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              Text(
                cityLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF5D6480),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TournamentLocationFilterRow extends StatelessWidget {
  final String title;
  final IconData icon;
  final String allLabel;
  final List<String> options;
  final String? selectedValue;
  final ValueChanged<String> onSelected;

  const _TournamentLocationFilterRow({
    required this.title,
    required this.icon,
    required this.allLabel,
    required this.options,
    required this.selectedValue,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: const EdgeInsets.all(AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppTheme.primaryOrange),
              const SizedBox(width: AppSpace.xs2),
              Text(
                title,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            child: Row(
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: FilterChip(
                    selected: selectedValue == null,
                    showCheckmark: false,
                    onSelected: (_) => onSelected(allLabel),
                    label: Text(allLabel),
                    labelStyle: TextStyle(
                      color: selectedValue == null
                          ? Colors.white
                          : Theme.of(context).colorScheme.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                    backgroundColor: Colors.white,
                    selectedColor: AppTheme.primaryOrange,
                    side: BorderSide(
                      color: selectedValue == null
                          ? AppTheme.primaryOrange
                          : const Color(0xFFE7E7EE),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.sm,
                      vertical: AppSpace.xs,
                    ),
                  ),
                ),
                ...options.map((option) {
                  final selected = selectedValue == option;
                  return Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: FilterChip(
                      selected: selected,
                      showCheckmark: false,
                      onSelected: (_) => onSelected(option),
                      label: Text(option),
                      labelStyle: TextStyle(
                        color: selected
                            ? Colors.white
                            : Theme.of(context).colorScheme.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                      backgroundColor: Colors.white,
                      selectedColor: AppTheme.primaryOrange,
                      side: BorderSide(
                        color: selected
                            ? AppTheme.primaryOrange
                            : const Color(0xFFE7E7EE),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpace.sm,
                        vertical: AppSpace.xs,
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TournamentMarketplaceSectionEyebrow extends StatelessWidget {
  final String title;
  final String subtitle;

  const _TournamentMarketplaceSectionEyebrow({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title.toUpperCase(),
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            letterSpacing: 4.2,
            color: AppTheme.secondaryText,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppSpace.xs),
        Text(
          subtitle,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
        ),
      ],
    );
  }
}

class _RecommendedTournamentSection extends StatelessWidget {
  final List<Tournament> tournaments;
  final bool isWide;
  final ValueChanged<Tournament> onOpen;

  const _RecommendedTournamentSection({
    required this.tournaments,
    required this.isWide,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    if (isWide) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - (AppSpace.md * 2)) / 3;
          return Wrap(
            spacing: AppSpace.md,
            runSpacing: AppSpace.md,
            children: tournaments.map((tournament) {
              return SizedBox(
                width: width,
                child: _RecommendedTournamentCard(
                  tournament: tournament,
                  onOpen: () => onOpen(tournament),
                ),
              );
            }).toList(),
          );
        },
      );
    }

    return SizedBox(
      height: 324,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: tournaments.length,
        separatorBuilder: (context, index) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final tournament = tournaments[index];
          return SizedBox(
            width: 254,
            child: _RecommendedTournamentCard(
              tournament: tournament,
              onOpen: () => onOpen(tournament),
            ),
          );
        },
      ),
    );
  }
}

class _RecommendedTournamentCard extends StatelessWidget {
  final Tournament tournament;
  final VoidCallback onOpen;

  const _RecommendedTournamentCard({
    required this.tournament,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onOpen,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: const Color(0xFFF0F1F6)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0F172A).withValues(alpha: 0.06),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
              child: SizedBox(
                height: 162,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AppSmartImage(
                      source: tournament.coverImage,
                      fallback: _TournamentArtFallback(
                        tournament: tournament,
                        compact: true,
                      ),
                    ),
                    Positioned(
                      top: AppSpace.sm,
                      left: AppSpace.sm,
                      child: _TournamentTag(
                        label: _tournamentGameLabel(tournament),
                      ),
                    ),
                    Positioned(
                      top: AppSpace.sm,
                      right: AppSpace.sm,
                      child: _TournamentToneBadge(
                        label: _tournamentMatchupLabel(tournament),
                        color: const Color(0xFF5B8CFF),
                      ),
                    ),
                    Positioned(
                      left: AppSpace.sm,
                      bottom: AppSpace.sm,
                      child: _TournamentToneBadge(
                        label: _tournamentEntryFeeLabel(tournament),
                        color: AppTheme.primaryOrange,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.md,
                AppSpace.md,
                AppSpace.md,
                AppSpace.md,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tournament.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF1B1E2E),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpace.xs2),
                  Text(
                    tournament.hostBusinessLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF74798D),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Text(
                    'Prize pool ${formatCurrency(tournament.effectivePrizePool)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF00A86B),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpace.xs2),
                  Text(
                    _tournamentShortLocation(tournament),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF8B8FA3),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeaturedTournamentSection extends StatelessWidget {
  final List<Tournament> tournaments;
  final bool isWide;
  final ValueChanged<Tournament> onOpen;

  const _FeaturedTournamentSection({
    required this.tournaments,
    required this.isWide,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    if (isWide) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - AppSpace.md) / 2;
          return Wrap(
            spacing: AppSpace.md,
            runSpacing: AppSpace.md,
            children: tournaments.map((tournament) {
              return SizedBox(
                width: width,
                child: _FeaturedTournamentCard(
                  tournament: tournament,
                  onOpen: () => onOpen(tournament),
                ),
              );
            }).toList(),
          );
        },
      );
    }

    return Column(
      children: tournaments.map((tournament) {
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.md),
          child: _FeaturedTournamentCard(
            tournament: tournament,
            onOpen: () => onOpen(tournament),
          ),
        );
      }).toList(),
    );
  }
}

class _FeaturedTournamentCard extends StatelessWidget {
  final Tournament tournament;
  final VoidCallback onOpen;

  const _FeaturedTournamentCard({
    required this.tournament,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onOpen,
      borderRadius: const BorderRadius.all(Radius.circular(30)),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: const Color(0xFFEDEFF6)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0F172A).withValues(alpha: 0.06),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(30),
              ),
              child: SizedBox(
                height: 240,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AppSmartImage(
                      source: tournament.coverImage,
                      fallback: _TournamentArtFallback(
                        tournament: tournament,
                        compact: false,
                      ),
                    ),
                    Positioned(
                      top: AppSpace.md,
                      left: AppSpace.md,
                      child: _TournamentTag(
                        label: _tournamentGameLabel(tournament),
                      ),
                    ),
                    Positioned(
                      top: AppSpace.md,
                      right: AppSpace.md,
                      child: _TournamentToneBadge(
                        label: _tournamentMatchupLabel(tournament),
                        color: const Color(0xFF5B8CFF),
                      ),
                    ),
                    Positioned(
                      left: AppSpace.md,
                      bottom: AppSpace.md,
                      child: _TournamentToneBadge(
                        label:
                            'Prize ${formatCurrency(tournament.effectivePrizePool)}',
                        color: const Color(0xFF00A86B),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.md,
                AppSpace.md,
                AppSpace.md,
                AppSpace.lg,
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
                              tournament.title,
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(
                                    color: const Color(0xFF171A2B),
                                    fontWeight: FontWeight.w900,
                                  ),
                            ),
                            const SizedBox(height: AppSpace.xs2),
                            Text(
                              tournament.hostBusinessLabel,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: const Color(0xFF6F7488),
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      _TournamentToneBadge(
                        label: _tournamentEntryFeeLabel(tournament),
                        color: AppTheme.primaryOrange,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Text(
                    tournament.summary.trim().isNotEmpty
                        ? tournament.summary
                        : _tournamentLocationSummary(tournament),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF6F7488),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                  Wrap(
                    spacing: AppSpace.sm,
                    runSpacing: AppSpace.sm,
                    children: [
                      _TournamentMetaLine(
                        icon: Icons.sports_esports_rounded,
                        label: _tournamentGameLabel(tournament),
                        color: const Color(0xFF00A86B),
                      ),
                      _TournamentMetaLine(
                        icon: Icons.groups_rounded,
                        label: _tournamentMatchupLabel(tournament),
                        color: const Color(0xFF00A86B),
                      ),
                      _TournamentMetaLine(
                        icon: Icons.emoji_events_rounded,
                        label: formatCurrency(tournament.effectivePrizePool),
                        color: const Color(0xFF00A86B),
                      ),
                      _TournamentMetaLine(
                        icon: Icons.location_on_outlined,
                        label: _tournamentLocationSummary(tournament),
                        color: const Color(0xFF00A86B),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.md),
                  Text(
                    formatDateTime(tournament.startAt),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: const Color(0xFF2C3150),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Wrap(
                    spacing: AppSpace.sm,
                    runSpacing: AppSpace.sm,
                    children: [
                      _TournamentSoftPill(
                        label: tournament.businessState.trim().isNotEmpty
                            ? tournament.businessState.trim()
                            : 'State soon',
                        color: AppTheme.primaryOrange,
                      ),
                      _TournamentSoftPill(
                        label: tournament.businessCity.trim().isNotEmpty
                            ? tournament.businessCity.trim()
                            : 'City soon',
                        color: AppTheme.primaryTurquoise,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TournamentArtFallback extends StatelessWidget {
  final Tournament tournament;
  final bool compact;

  const _TournamentArtFallback({
    required this.tournament,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: compact
              ? const [Color(0xFF1E1F55), Color(0xFF5B37B7), Color(0xFFFB7185)]
              : const [Color(0xFF15162D), Color(0xFF4C1D95), Color(0xFFF97316)],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: compact ? 18 : 26,
            right: compact ? 18 : 24,
            child: Container(
              width: compact ? 54 : 70,
              height: compact ? 54 : 70,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            left: compact ? 14 : 22,
            bottom: compact ? 14 : 22,
            child: Icon(
              Icons.emoji_events_rounded,
              size: compact ? 44 : 58,
              color: Colors.white.withValues(alpha: 0.88),
            ),
          ),
          Positioned(
            left: compact ? 14 : 22,
            right: compact ? 14 : 22,
            bottom: compact ? 14 : 24,
            child: Align(
              alignment: Alignment.bottomLeft,
              child: Text(
                _tournamentGameLabel(tournament),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TournamentTag extends StatelessWidget {
  final String label;

  const _TournamentTag({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: const Color(0xFF151A2D),
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _TournamentToneBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _TournamentToneBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _TournamentMetaLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _TournamentMetaLine({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: AppSpace.xs2),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFF2C3150),
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _TournamentSoftPill extends StatelessWidget {
  final String label;
  final Color color;

  const _TournamentSoftPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
