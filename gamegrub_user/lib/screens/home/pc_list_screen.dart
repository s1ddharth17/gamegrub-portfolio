import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/station_categories.dart';
import '../../models/pc.dart';
import '../../providers/auth_provider.dart';
import '../../providers/pc_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/pc_card.dart';
import '../booking/booking_screen.dart';

class PcListScreen extends StatefulWidget {
  final int businessId;
  final String businessName;
  final String businessTagline;

  const PcListScreen({
    super.key,
    required this.businessId,
    required this.businessName,
    this.businessTagline = '',
  });

  @override
  State<PcListScreen> createState() => _PcListScreenState();
}

class _PcListScreenState extends State<PcListScreen> {
  String _selectedCategory = stationCategoryAll;
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey _fleetSectionKey = GlobalKey();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    final pcProvider = context.read<PcProvider>();
    Future.microtask(() => pcProvider.loadPCs(businessId: widget.businessId));
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _openBooking(PC pc) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookingScreen(
          pc: pc,
          businessName: widget.businessName,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    await context.read<PcProvider>().loadPCs(businessId: widget.businessId);
  }

  Future<void> _bookFirstAvailable(Iterable<PC> pcs) async {
    PC? target;
    for (final pc in pcs) {
      if (pc.canReserve && pc.isAvailable) {
        target = pc;
        break;
      }
    }

    if (target == null) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No open setups right now. Refresh the floor and try again.',
          ),
        ),
      );
      return;
    }

    await _openBooking(target);
  }

  bool _matchesSearch(PC pc) {
    final normalizedQuery = _searchQuery.trim().toLowerCase();
    if (normalizedQuery.isEmpty) {
      return true;
    }

    return <String>[
      pc.stationTitle,
      pc.specs,
      pc.categoryLabel,
      pc.deviceLabel,
      pc.availabilityLabel,
      pc.userName ?? '',
    ].any((value) => value.toLowerCase().contains(normalizedQuery));
  }

  void _clearSearch() {
    if (_searchQuery.isEmpty && _searchController.text.isEmpty) {
      return;
    }
    _searchController.clear();
    setState(() {
      _searchQuery = '';
    });
  }

  void _selectCategory(String category, {bool scrollToFleet = false}) {
    setState(() {
      _selectedCategory = category;
    });

    if (scrollToFleet) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToFleet();
      });
    }
  }

  Future<void> _scrollToFleet() async {
    final targetContext = _fleetSectionKey.currentContext;
    if (targetContext == null) {
      return;
    }

    await Scrollable.ensureVisible(
      targetContext,
      duration: AppMotion.slow,
      curve: Curves.easeOut,
      alignment: 0.08,
    );
  }

  _RigStatus _statusForPc(PC pc) {
    if (pc.isDisabled) {
      return _RigStatus.maintenance;
    }

    final liveState = (pc.liveState ?? '').toLowerCase();
    if (liveState == 'reserved' || liveState == 'no_show_risk') {
      return _RigStatus.reserved;
    }

    if (pc.isAvailable) {
      return _RigStatus.available;
    }

    return _RigStatus.active;
  }

  int _countForStatus(List<PC> pcs, _RigStatus status) {
    return pcs.where((pc) => _statusForPc(pc) == status).length;
  }

  int _countForCategory(List<PC> pcs, String category) {
    return pcs.where((pc) => pc.matchesCategory(category)).length;
  }

  double _minimumRate(List<PC> pcs) {
    double? minimum;
    for (final pc in pcs) {
      if (minimum == null || pc.price < minimum) {
        minimum = pc.price;
      }
    }
    return minimum ?? 0;
  }

  String _tierForPoints(int points) {
    if (points >= 5000) return 'Legend';
    if (points >= 2000) return 'Elite';
    if (points >= 500) return 'Plus';
    return 'Starter';
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final pcProvider = context.watch<PcProvider>();
    final user = auth.user;
    final allPcs = pcProvider.pcs;
    final visiblePcs = allPcs
        .where(
          (pc) => pc.matchesCategory(_selectedCategory) && _matchesSearch(pc),
        )
        .toList();
    final available = _countForStatus(allPcs, _RigStatus.available);
    final active = _countForStatus(allPcs, _RigStatus.active);
    final reserved = _countForStatus(allPcs, _RigStatus.reserved);
    final maintenance = _countForStatus(allPcs, _RigStatus.maintenance);
    final totalPcs = allPcs.length;
    final startingRate = _minimumRate(allPcs);
    final rewardPoints = user?.loyaltyPoints ?? 0;
    final tier = _tierForPoints(rewardPoints);
    final isSearching = _searchQuery.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: Text(widget.businessName)),
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: () =>
            context.read<PcProvider>().loadPCs(businessId: widget.businessId),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isDesktop = constraints.maxWidth >= 1120;
            final isTablet = constraints.maxWidth >= 760;
            final gridColumns = constraints.maxWidth >= 1320
                ? 3
                : constraints.maxWidth >= 820
                ? 2
                : 1;
            final cardWidth =
                (constraints.maxWidth - (gridColumns - 1) * AppSpace.md) /
                gridColumns;

            return ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.xl,
                AppSpace.lg,
                120,
              ),
              children: [
                AppReveal(
                  child: AppHeroBanner(
                    eyebrow: 'Cafe rigs',
                    title: 'Choose your setup at ${widget.businessName}',
                    subtitle: totalPcs == 0
                        ? '${widget.businessName} has not published customer-facing rigs yet.'
                        : '$available setups are open now, $reserved are reserved, and $active sessions are running at ${widget.businessName}.',
                    icon: Icons.computer_rounded,
                    accent: AppTheme.primaryOrange,
                    stats: [
                      AppMetricTile(
                        label: 'Available PCs',
                        value: '$available',
                        caption: 'Ready for immediate booking',
                        accent: AppTheme.success,
                        icon: Icons.check_circle_outline_rounded,
                      ),
                      AppMetricTile(
                        label: 'Occupied PCs',
                        value: '$active',
                        caption: 'Live sessions on the floor',
                        accent: AppTheme.warning,
                        icon: Icons.timer_outlined,
                      ),
                      AppMetricTile(
                        label: 'Reserved PCs',
                        value: '$reserved',
                        caption: 'Held for upcoming arrivals',
                        accent: AppTheme.primaryTurquoise,
                        icon: Icons.event_available_outlined,
                      ),
                      AppMetricTile(
                        label: 'Starting rate',
                        value: startingRate > 0
                            ? '${formatCurrency(startingRate)}/hr'
                            : 'TBD',
                        caption: 'Lowest live hourly price',
                        accent: AppTheme.primaryOrange,
                        icon: Icons.currency_rupee_rounded,
                      ),
                    ],
                    actions: [
                      FilledButton.icon(
                        onPressed: () => _bookFirstAvailable(allPcs),
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('Book open setup'),
                      ),
                      OutlinedButton.icon(
                        onPressed: pcProvider.isLoading
                            ? null
                            : () => context.read<PcProvider>().loadPCs(
                                  businessId: widget.businessId,
                                ),
                        icon: pcProvider.isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.refresh_rounded),
                        label: Text(
                          pcProvider.isLoading ? 'Refreshing' : 'Refresh floor',
                        ),
                      ),
                    ],
                    trailing: GlassPanel(
                      glowColor: AppTheme.primaryTurquoise,
                      padding: const EdgeInsets.all(AppSpace.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Cafe focus',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: AppTheme.secondaryText),
                          ),
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            widget.businessName,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            widget.businessTagline.trim().isEmpty
                                ? 'Book the exact rig you want from this cafe floor.'
                                : widget.businessTagline,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: AppTheme.secondaryText),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                AppReveal(
                  delay: AppMotion.fast,
                  child: _FilterPanel(
                    searchController: _searchController,
                    searchQuery: _searchQuery,
                    selectedCategory: _selectedCategory,
                    availableCount: visiblePcs
                        .where((pc) => pc.isAvailable)
                        .length,
                    categoryCounts: {
                      stationCategoryAll: totalPcs,
                      stationCategoryHighEndPc: _countForCategory(
                        allPcs,
                        stationCategoryHighEndPc,
                      ),
                      stationCategoryEsportsPc: _countForCategory(
                        allPcs,
                        stationCategoryEsportsPc,
                      ),
                      stationCategoryConsole: _countForCategory(
                        allPcs,
                        stationCategoryConsole,
                      ),
                    },
                    onSearchChanged: (value) {
                      setState(() {
                        _searchQuery = value;
                      });
                    },
                    onClearSearch: _clearSearch,
                    onCategorySelected: _selectCategory,
                    onShowAll: () => _selectCategory(
                      stationCategoryAll,
                      scrollToFleet: true,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                if (isDesktop)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 7,
                        child: AppReveal(
                          delay: AppMotion.fast,
                          child: _FloorMapPanel(
                            pcs: allPcs,
                            statusForPc: _statusForPc,
                            onTapPc: (pc) {
                              if (pc.canReserve) {
                                _openBooking(pc);
                              }
                            },
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpace.md),
                      Expanded(
                        flex: 4,
                        child: AppReveal(
                          delay: AppMotion.normal,
                          child: _FloorSummaryPanel(
                            tier: tier,
                            points: rewardPoints,
                            favoriteGame: user?.favoriteGame.trim() ?? '',
                            totalPcs: totalPcs,
                            available: available,
                            reserved: reserved,
                            maintenance: maintenance,
                            active: active,
                          ),
                        ),
                      ),
                    ],
                  )
                else ...[
                  AppReveal(
                    delay: AppMotion.fast,
                    child: _FloorSummaryPanel(
                      tier: tier,
                      points: rewardPoints,
                      favoriteGame: user?.favoriteGame.trim() ?? '',
                      totalPcs: totalPcs,
                      available: available,
                      reserved: reserved,
                      maintenance: maintenance,
                      active: active,
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                  AppReveal(
                    delay: AppMotion.normal,
                    child: _FloorMapPanel(
                      pcs: allPcs,
                      statusForPc: _statusForPc,
                      onTapPc: (pc) {
                        if (pc.canReserve) {
                          _openBooking(pc);
                        }
                      },
                    ),
                  ),
                ],
                const SizedBox(height: AppSpace.lg),
                AppSectionTitle(
                  title: 'Available setups',
                  subtitle: isSearching
                      ? 'Showing results for "${_searchQuery.trim()}".'
                      : 'Reserve straight from the live setup list below.',
                  trailing: GlowBadge(
                    label: '${visiblePcs.length} setups',
                    color: visiblePcs.isEmpty
                        ? AppTheme.secondaryText
                        : AppTheme.success,
                    icon: Icons.grid_view_rounded,
                  ),
                ),
                const SizedBox(height: AppSpace.md),
                Container(key: _fleetSectionKey),
                if (pcProvider.isLoading && allPcs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: AppSpace.xxl),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (pcProvider.errorMessage != null && allPcs.isEmpty)
                  EmptyGlassState(
                    title: 'Unable to load the floor',
                    message: pcProvider.errorMessage!,
                    icon: Icons.cloud_off_outlined,
                    action: OutlinedButton.icon(
                      onPressed: () => context.read<PcProvider>().loadPCs(
                        businessId: widget.businessId,
                      ),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Try again'),
                    ),
                  )
                else if (visiblePcs.isEmpty)
                  EmptyGlassState(
                    title: 'No setups match this view',
                    message: isSearching
                        ? 'Clear the search or change the category to widen the floor feed.'
                        : 'Change the selected category or refresh the floor feed.',
                    icon: Icons.filter_alt_off_rounded,
                    action: Wrap(
                      spacing: AppSpace.sm,
                      runSpacing: AppSpace.sm,
                      children: [
                        if (isSearching)
                          OutlinedButton.icon(
                            onPressed: _clearSearch,
                            icon: const Icon(Icons.close_rounded),
                            label: const Text('Clear search'),
                          ),
                        OutlinedButton.icon(
                          onPressed: () => _selectCategory(
                            stationCategoryAll,
                            scrollToFleet: true,
                          ),
                          icon: const Icon(Icons.grid_view_rounded),
                          label: const Text('Show all setups'),
                        ),
                      ],
                    ),
                  )
                else
                  Wrap(
                    spacing: AppSpace.md,
                    runSpacing: 0,
                    children: visiblePcs.asMap().entries.map((entry) {
                      return SizedBox(
                        width: isTablet ? cardWidth : constraints.maxWidth,
                        child: AppReveal(
                          delay: Duration(
                            milliseconds:
                                AppMotion.fast.inMilliseconds +
                                (entry.key * 40),
                          ),
                          child: PcCard(
                            pc: entry.value,
                            onBook: entry.value.canReserve
                                ? () => _openBooking(entry.value)
                                : null,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

enum _RigStatus { available, reserved, active, maintenance }

class _FloorSummaryPanel extends StatelessWidget {
  final String tier;
  final int points;
  final String favoriteGame;
  final int totalPcs;
  final int available;
  final int reserved;
  final int maintenance;
  final int active;

  const _FloorSummaryPanel({
    required this.tier,
    required this.points,
    required this.favoriteGame,
    required this.totalPcs,
    required this.available,
    required this.reserved,
    required this.maintenance,
    required this.active,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      glowColor: AppTheme.primaryOrange,
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Quick summary',
            subtitle: 'Membership and live capacity in one place.',
            trailing: const AppThemeToggle(showLabel: false),
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              StatChip(
                label: 'Membership',
                value: tier,
                accent: AppTheme.primaryOrange,
                icon: Icons.workspace_premium_outlined,
              ),
              StatChip(
                label: 'Reward balance',
                value: '$points pts',
                accent: AppTheme.success,
                icon: Icons.wallet_giftcard_rounded,
              ),
              StatChip(
                label: 'Floor total',
                value: '$totalPcs setups',
                accent: AppTheme.primaryTurquoise,
                icon: Icons.grid_view_rounded,
              ),
              StatChip(
                label: 'Maintenance',
                value: '$maintenance',
                accent: AppTheme.danger,
                icon: Icons.build_circle_outlined,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              GlowBadge(
                label: '$available open now',
                color: available > 0 ? AppTheme.success : AppTheme.warning,
                icon: Icons.check_circle_outline_rounded,
              ),
              GlowBadge(
                label: '$active live sessions',
                color: AppTheme.warning,
                icon: Icons.speed_rounded,
              ),
              GlowBadge(
                label: '$reserved reserved',
                color: AppTheme.primaryTurquoise,
                icon: Icons.event_available_outlined,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Text(
            favoriteGame.isEmpty
                ? 'Add a favorite game in your profile to personalize the booking view.'
                : 'Favorite game: $favoriteGame',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
          ),
        ],
      ),
    );
  }
}

class _FloorMapPanel extends StatelessWidget {
  final List<PC> pcs;
  final _RigStatus Function(PC pc) statusForPc;
  final ValueChanged<PC> onTapPc;

  const _FloorMapPanel({
    required this.pcs,
    required this.statusForPc,
    required this.onTapPc,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Live floor map',
            subtitle:
                'Tap any node to jump into the matching setup and reserve faster.',
            trailing: GlowBadge(
              label: '${pcs.length} live nodes',
              color: AppTheme.primaryOrange,
              icon: Icons.blur_on_rounded,
            ),
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.xs,
            runSpacing: AppSpace.xs,
            children: pcs.map((pc) {
              final status = statusForPc(pc);
              final color = switch (status) {
                _RigStatus.available => AppTheme.success,
                _RigStatus.reserved => AppTheme.primaryTurquoise,
                _RigStatus.active => AppTheme.warning,
                _RigStatus.maintenance => AppTheme.danger,
              };

              return SizedBox(
                width: 108,
                child: AppInteractiveSurface(
                  onTap: () => onTapPc(pc),
                  borderRadius: const BorderRadius.all(
                    Radius.circular(AppRadius.large),
                  ),
                  child: AnimatedContainer(
                    duration: AppMotion.normal,
                    curve: Curves.easeOut,
                    padding: const EdgeInsets.all(AppSpace.md),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      border: Border.all(color: color.withValues(alpha: 0.28)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: color,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              '#${pc.id}',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: AppTheme.secondaryText),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpace.sm),
                        Text(
                          pc.deviceLabel,
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: AppSpace.xs),
                        Text(
                          pc.availabilityLabel,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(
                            context,
                          ).textTheme.bodySmall?.copyWith(color: color),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _FilterPanel extends StatelessWidget {
  final TextEditingController searchController;
  final String searchQuery;
  final String selectedCategory;
  final int availableCount;
  final Map<String, int> categoryCounts;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onClearSearch;
  final ValueChanged<String> onCategorySelected;
  final VoidCallback onShowAll;

  const _FilterPanel({
    required this.searchController,
    required this.searchQuery,
    required this.selectedCategory,
    required this.availableCount,
    required this.categoryCounts,
    required this.onSearchChanged,
    required this.onClearSearch,
    required this.onCategorySelected,
    required this.onShowAll,
  });

  @override
  Widget build(BuildContext context) {
    final hasSearch = searchQuery.trim().isNotEmpty;

    return GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Search and filters',
            subtitle:
                'Search once and narrow the live floor without bouncing between sections.',
            trailing: GlowBadge(
              label: '$availableCount available',
              color: availableCount > 0 ? AppTheme.success : AppTheme.warning,
              icon: Icons.filter_list_rounded,
            ),
          ),
          const SizedBox(height: AppSpace.md),
          TextField(
            controller: searchController,
            onChanged: onSearchChanged,
            decoration: InputDecoration(
              hintText: 'Search by setup, status, specs, GPU, CPU, or player',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: hasSearch
                  ? IconButton(
                      onPressed: onClearSearch,
                      icon: const Icon(Icons.close_rounded),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: stationCategoryFilters.map((category) {
              final selected = selectedCategory == category;
              final label = category == stationCategoryAll
                  ? 'All setups'
                  : stationCategoryDisplayLabel(category);
              return ChoiceChip(
                label: Text('$label (${categoryCounts[category] ?? 0})'),
                selected: selected,
                showCheckmark: false,
                onSelected: (_) => onCategorySelected(category),
              );
            }).toList(),
          ),
          if (hasSearch) ...[
            const SizedBox(height: AppSpace.md),
            OutlinedButton.icon(
              onPressed: onShowAll,
              icon: const Icon(Icons.grid_view_rounded),
              label: const Text('Reset filters and show the whole floor'),
            ),
          ],
        ],
      ),
    );
  }
}
