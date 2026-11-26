import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/tournament.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/tournament_provider.dart';
import '../../services/tournament_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../utils/tournament_calendar.dart';
import '../../widgets/app_chrome.dart';
import 'tournament_player_finder_screen.dart';

part 'tournament_screen_dialogs.dart';
part 'tournament_screen_details.dart';
part 'tournament_screen_support.dart';
part 'tournament_screen_feed_cards.dart';
part 'tournament_screen_components.dart';
part 'tournament_screen_marketplace.dart';

class TournamentScreen extends StatefulWidget {
  final int? initialBusinessId;
  final String? initialBusinessName;
  final int? initialTournamentId;

  const TournamentScreen({
    super.key,
    this.initialBusinessId,
    this.initialBusinessName,
    this.initialTournamentId,
  });

  @override
  State<TournamentScreen> createState() => _TournamentScreenState();
}

enum _TournamentView { discover, myEvents, teams, updates }

class _TournamentScreenState extends State<TournamentScreen> {
  _TournamentView _activeView = _TournamentView.discover;
  int? _observedBusinessId;
  bool _initialTournamentOpened = false;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String? _selectedStateFilter;
  String? _selectedCityFilter;
  String? _selectedSkillLevelFilter;
  final TournamentService _tournamentService = TournamentService();
  final Set<int> _likedCommunityPostIds = <int>{};
  final Set<int> _busyCommunityPostIds = <int>{};
  final Map<int, int> _communityReactionCounts = <int, int>{};

  Future<void> _toggleCommunityReaction(
    TournamentCommunityPost post,
    String token,
  ) async {
    if (_busyCommunityPostIds.contains(post.postId)) return;
    setState(() => _busyCommunityPostIds.add(post.postId));
    try {
      final result = await _tournamentService.toggleCommunityReaction(
        token: token,
        postId: post.postId,
      );
      if (!mounted) return;
      setState(() {
        if (result['liked'] == true) {
          _likedCommunityPostIds.add(post.postId);
        } else {
          _likedCommunityPostIds.remove(post.postId);
        }
        _communityReactionCounts[post.postId] =
            int.tryParse('${result['reaction_count'] ?? 0}') ?? 0;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Reaction could not be saved. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busyCommunityPostIds.remove(post.postId));
    }
  }

  Future<void> _reportCommunityPost(
    TournamentCommunityPost post,
    String token,
  ) async {
    var reason = 'spam';
    final detailsController = TextEditingController();
    final report = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report this post'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: reason,
              decoration: const InputDecoration(labelText: 'Reason'),
              items: const [
                DropdownMenuItem(value: 'spam', child: Text('Spam')),
                DropdownMenuItem(value: 'abuse', child: Text('Abuse')),
                DropdownMenuItem(
                  value: 'hate',
                  child: Text('Hate or harassment'),
                ),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
              onChanged: (value) => reason = value ?? reason,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: detailsController,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Send report'),
          ),
        ],
      ),
    );
    if (report != true) {
      detailsController.dispose();
      return;
    }
    try {
      await _tournamentService.reportCommunityPost(
        token: token,
        postId: post.postId,
        reason: reason,
        details: detailsController.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report sent to the moderation team.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Report could not be sent. You may have already reported this post.',
            ),
          ),
        );
      }
    } finally {
      detailsController.dispose();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final auth = Provider.of<AuthProvider>(context);
    final provider = context.read<TournamentProvider>();
    final activeBusinessId = widget.initialBusinessId;
    final shouldLoad =
        _observedBusinessId != activeBusinessId ||
        provider.tournaments.isEmpty ||
        ((auth.token ?? '').isNotEmpty && provider.myTournaments.isEmpty);

    _observedBusinessId = activeBusinessId;

    if (!shouldLoad || provider.isLoading) {
      if (provider.isLoading) return;
    }

    if (shouldLoad && !provider.isLoading) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.read<TournamentProvider>().loadTournaments(
          token: auth.token,
          businessId: _observedBusinessId,
        );
      });
    }

    final tournamentId = widget.initialTournamentId;
    if (!_initialTournamentOpened && tournamentId != null) {
      for (final tournament in provider.tournaments) {
        if (tournament.tournamentId == tournamentId) {
          _initialTournamentOpened = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _showTournamentSheet(context, tournament);
          });
          break;
        }
      }
    }
  }

  Future<void> _refresh(BuildContext context) async {
    final token = context.read<AuthProvider>().token;
    await context.read<TournamentProvider>().loadTournaments(
      token: token,
      businessId: widget.initialBusinessId,
    );
  }

  List<String> _stateOptions(List<Tournament> tournaments) {
    final states =
        tournaments
            .map((item) => item.businessState.trim())
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    return states;
  }

  List<String> _cityOptions(
    List<Tournament> tournaments, {
    String? stateFilter,
  }) {
    final cities =
        tournaments
            .where(
              (item) =>
                  stateFilter == null ||
                  item.businessState.trim().toLowerCase() ==
                      stateFilter.trim().toLowerCase(),
            )
            .map((item) => item.businessCity.trim())
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    return cities;
  }

  List<Tournament> _filteredDiscoverTournaments(
    List<Tournament> tournaments, {
    String? stateFilter,
    String? cityFilter,
    String? skillLevelFilter,
  }) {
    final search = _searchQuery.trim().toLowerCase();
    final filtered = tournaments.where((tournament) {
      final stateMatch =
          stateFilter == null ||
          tournament.businessState.trim().toLowerCase() ==
              stateFilter.trim().toLowerCase();
      final cityMatch =
          cityFilter == null ||
          tournament.businessCity.trim().toLowerCase() ==
              cityFilter.trim().toLowerCase();
      final tournamentSkill = tournament.skillLevel.trim().toLowerCase();
      final skillMatch =
          skillLevelFilter == null ||
          tournamentSkill == 'open' ||
          tournamentSkill == skillLevelFilter;
      if (!stateMatch || !cityMatch || !skillMatch) {
        return false;
      }

      if (search.isEmpty) {
        return true;
      }

      final haystack = [
        tournament.title,
        tournament.gameTitle,
        tournament.hostBusinessLabel,
        tournament.locationLabel,
        tournament.businessCity,
        tournament.businessState,
        _tournamentMatchupLabel(tournament),
      ].join(' ').toLowerCase();

      return haystack.contains(search);
    }).toList()..sort(_compareDiscoverTournaments);

    return filtered;
  }

  int _compareDiscoverTournaments(Tournament left, Tournament right) {
    if (left.isFeatured != right.isFeatured) {
      return left.isFeatured ? -1 : 1;
    }

    if (left.isUpcoming != right.isUpcoming) {
      return left.isUpcoming ? -1 : 1;
    }

    final prizeCompare = right.effectivePrizePool.compareTo(
      left.effectivePrizePool,
    );
    if (prizeCompare != 0) {
      return prizeCompare;
    }

    final leftStart = left.startAt;
    final rightStart = right.startAt;
    if (leftStart != null && rightStart != null) {
      final compare = leftStart.compareTo(rightStart);
      if (compare != 0) {
        return compare;
      }
    } else if (leftStart != null) {
      return -1;
    } else if (rightStart != null) {
      return 1;
    }

    return left.title.toLowerCase().compareTo(right.title.toLowerCase());
  }

  List<Tournament> _spotlightTournaments(List<Tournament> tournaments) {
    final spotlight = [...tournaments]..sort(_compareDiscoverTournaments);
    return spotlight.take(3).toList();
  }

  String _discoverLocationLabel({
    required bool hasPinnedBusiness,
    required String activeBusinessName,
    required String? stateFilter,
    required String? cityFilter,
    required int hostCafeCount,
  }) {
    if (hasPinnedBusiness) {
      return 'Events hosted by $activeBusinessName';
    }

    if (cityFilter != null && stateFilter != null) {
      return '$cityFilter, $stateFilter brackets';
    }

    if (stateFilter != null) {
      return '$stateFilter tournament feed';
    }

    if (hostCafeCount > 0) {
      return '$hostCafeCount cafes listing tournaments';
    }

    return 'Browse every listed cafe tournament';
  }

  void _clearDiscoverFilters() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedStateFilter = null;
      _selectedCityFilter = null;
      _selectedSkillLevelFilter = null;
    });
  }

  List<Widget> _buildDiscoverMarketplace({
    required BuildContext context,
    required List<Tournament> tournaments,
    required TournamentProvider provider,
    required AuthProvider auth,
    required bool hasPinnedBusiness,
    required String activeBusinessName,
    required List<TournamentLeaderboardEntry> leaderboard,
    required List<_TournamentView> availableViews,
    required Map<_TournamentView, int> viewCounts,
    required _TournamentView selectedView,
  }) {
    final stateOptions = hasPinnedBusiness
        ? const <String>[]
        : _stateOptions(tournaments);
    final activeStateFilter = stateOptions.contains(_selectedStateFilter)
        ? _selectedStateFilter
        : null;
    final cityOptions = hasPinnedBusiness
        ? const <String>[]
        : _cityOptions(tournaments, stateFilter: activeStateFilter);
    final activeCityFilter = cityOptions.contains(_selectedCityFilter)
        ? _selectedCityFilter
        : null;
    const skillLevelOptions = <String>['Beginner', 'Intermediate', 'Advanced'];
    final activeSkillLevelFilter =
        skillLevelOptions.any(
          (value) => value.toLowerCase() == _selectedSkillLevelFilter,
        )
        ? _selectedSkillLevelFilter
        : null;
    final filteredTournaments = _filteredDiscoverTournaments(
      tournaments,
      stateFilter: activeStateFilter,
      cityFilter: activeCityFilter,
      skillLevelFilter: activeSkillLevelFilter,
    );
    final filteredHostCafeCount = filteredTournaments
        .map((item) => item.businessId)
        .where((id) => id > 0)
        .toSet()
        .length;
    final hasActiveDiscoverFilters =
        _searchQuery.trim().isNotEmpty ||
        activeStateFilter != null ||
        activeCityFilter != null ||
        activeSkillLevelFilter != null;
    final showSpotlightSection = filteredTournaments.length >= 4;
    final spotlightTournaments = showSpotlightSection
        ? _spotlightTournaments(filteredTournaments)
        : const <Tournament>[];
    final spotlightIds = spotlightTournaments
        .map((item) => item.tournamentId)
        .toSet();
    final browseTournaments = showSpotlightSection
        ? filteredTournaments
              .where((item) => !spotlightIds.contains(item.tournamentId))
              .toList()
        : filteredTournaments;
    final isWide = MediaQuery.sizeOf(context).width >= 960;

    return [
      AppReveal(
        child: _TournamentMarketplaceHero(
          title: hasPinnedBusiness ? activeBusinessName : 'Tournaments',
          location: _discoverLocationLabel(
            hasPinnedBusiness: hasPinnedBusiness,
            activeBusinessName: activeBusinessName,
            stateFilter: activeStateFilter,
            cityFilter: activeCityFilter,
            hostCafeCount: filteredHostCafeCount,
          ),
          accentLabel: hasPinnedBusiness
              ? 'Cafe-only feed'
              : '${filteredTournaments.length} live',
          searchController: _searchController,
          searchQuery: _searchQuery,
          searchHint: hasPinnedBusiness
              ? 'Search $activeBusinessName tournaments'
              : 'Search tournaments, cafes, or games',
          stateLabel: activeStateFilter ?? 'All',
          cityLabel: activeCityFilter ?? 'All',
          onChanged: (value) {
            setState(() {
              _searchQuery = value;
            });
          },
          onClear: () {
            _searchController.clear();
            setState(() {
              _searchQuery = '';
            });
          },
        ),
      ),
      const SizedBox(height: 18),
      GlassPanel(
        padding: const EdgeInsets.all(AppSpace.md),
        child: Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: availableViews.map((view) {
            final isSelected = selectedView == view;
            final label = switch (view) {
              _TournamentView.discover => 'Discover',
              _TournamentView.myEvents => 'My events',
              _TournamentView.teams => 'Teams',
              _TournamentView.updates => 'Updates',
            };

            return ChoiceChip(
              label: Text('$label (${viewCounts[view] ?? 0})'),
              selected: isSelected,
              showCheckmark: false,
              onSelected: (_) {
                setState(() {
                  _activeView = view;
                });
              },
            );
          }).toList(),
        ),
      ),
      const SizedBox(height: 18),
      if (hasPinnedBusiness) ...[
        GlassPanel(
          padding: const EdgeInsets.all(AppSpace.md),
          child: AppDataRow(
            label: 'Active cafe filter',
            value: activeBusinessName,
            emphasize: true,
            valueColor: AppTheme.lightTurquoise,
            padding: EdgeInsets.zero,
          ),
        ),
        const SizedBox(height: 18),
      ] else ...[
        AppReveal(
          delay: AppMotion.fast,
          child: _TournamentLocationFilterRow(
            title: 'State',
            icon: Icons.map_outlined,
            allLabel: 'All states',
            options: stateOptions,
            selectedValue: activeStateFilter,
            onSelected: (value) {
              setState(() {
                if (value == 'All states' || activeStateFilter == value) {
                  _selectedStateFilter = null;
                  _selectedCityFilter = null;
                  return;
                }

                _selectedStateFilter = value;
                final nextCities = _cityOptions(
                  tournaments,
                  stateFilter: value,
                );
                if (!nextCities.contains(_selectedCityFilter)) {
                  _selectedCityFilter = null;
                }
              });
            },
          ),
        ),
        const SizedBox(height: 12),
        AppReveal(
          delay: AppMotion.normal,
          child: _TournamentLocationFilterRow(
            title: 'City',
            icon: Icons.location_city_outlined,
            allLabel: 'All cities',
            options: cityOptions,
            selectedValue: activeCityFilter,
            onSelected: (value) {
              setState(() {
                if (value == 'All cities' || activeCityFilter == value) {
                  _selectedCityFilter = null;
                  return;
                }

                _selectedCityFilter = value;
              });
            },
          ),
        ),
        if (hasActiveDiscoverFilters) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _clearDiscoverFilters,
              child: const Text('Clear filters'),
            ),
          ),
        ],
        const SizedBox(height: 18),
      ],
      AppReveal(
        delay: AppMotion.normal,
        child: _TournamentLocationFilterRow(
          title: 'Skill level',
          icon: Icons.military_tech_outlined,
          allLabel: 'All levels',
          options: skillLevelOptions,
          selectedValue: skillLevelOptions.firstWhere(
            (value) => value.toLowerCase() == activeSkillLevelFilter,
            orElse: () => '',
          ),
          onSelected: (value) {
            setState(() {
              _selectedSkillLevelFilter = value == 'All levels'
                  ? null
                  : value.toLowerCase();
            });
          },
        ),
      ),
      const SizedBox(height: 18),
      if (provider.errorMessage != null) ...[
        GlassPanel(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.wifi_tethering_error_rounded,
                color: AppTheme.warning,
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  provider.errorMessage!,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              TextButton(
                onPressed: () =>
                    context.read<TournamentProvider>().loadTournaments(
                      token: auth.token,
                      businessId: widget.initialBusinessId,
                    ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
      ],
      if (provider.isLoading && tournaments.isEmpty)
        const Padding(
          padding: EdgeInsets.only(top: 40),
          child: Center(child: CircularProgressIndicator()),
        )
      else if (filteredTournaments.isEmpty)
        EmptyGlassState(
          title: 'No tournaments match this filter set',
          message: hasActiveDiscoverFilters
              ? 'Try a different state, city, or search term to bring more tournaments back into the feed.'
              : hasPinnedBusiness
              ? 'Once this cafe publishes tournaments from the admin panel, they will appear here.'
              : 'Once published tournaments are added from the admin panel, they will appear here.',
          icon: Icons.emoji_events_outlined,
          action: hasActiveDiscoverFilters
              ? FilledButton.tonal(
                  onPressed: _clearDiscoverFilters,
                  child: const Text('Reset filters'),
                )
              : null,
        )
      else ...[
        if (spotlightTournaments.isNotEmpty) ...[
          _TournamentMarketplaceSectionEyebrow(
            title: 'Spotlight Brackets',
            subtitle: hasPinnedBusiness
                ? 'Top picks from $activeBusinessName land here first.'
                : 'Featured, high-prize, and upcoming tournaments stay at the top of the browse feed.',
          ),
          const SizedBox(height: AppSpace.md),
          _RecommendedTournamentSection(
            tournaments: spotlightTournaments,
            isWide: isWide,
            onOpen: (tournament) => _showTournamentSheet(context, tournament),
          ),
          const SizedBox(height: AppSpace.xl),
        ],
        _TournamentMarketplaceSectionEyebrow(
          title: 'All Tournaments',
          subtitle: hasPinnedBusiness
              ? '${filteredTournaments.length} tournaments live for $activeBusinessName.'
              : '${filteredTournaments.length} tournaments across ${filteredHostCafeCount == 0 ? 'all partner cafes' : '$filteredHostCafeCount cafes'}.',
        ),
        const SizedBox(height: AppSpace.md),
        _FeaturedTournamentSection(
          tournaments: browseTournaments,
          isWide: isWide,
          onOpen: (tournament) => _showTournamentSheet(context, tournament),
        ),
        if (leaderboard.isNotEmpty || auth.user?.tournamentRank != null) ...[
          const SizedBox(height: AppSpace.xl),
          AppSectionTitle(
            title: 'Player ladder',
            subtitle: auth.user?.tournamentRank != null
                ? 'You are currently ranked #${auth.user!.tournamentRank} with ${auth.user!.tournamentPoints} tournament points.'
                : 'Top players are ranked by championships, match wins, attendance, and no-show discipline.',
          ),
          const SizedBox(height: 14),
          if (leaderboard.isEmpty)
            const EmptyGlassState(
              title: 'Leaderboard coming online',
              message:
                  'Once enough tournament results are reported, the top player ladder will appear here.',
              icon: Icons.leaderboard_outlined,
            )
          else
            ...leaderboard.asMap().entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: AppReveal(
                  delay: Duration(milliseconds: 35 * entry.key),
                  child: _TournamentLeaderboardCard(
                    entry: entry.value,
                    isCurrentUser: auth.user?.id == entry.value.userId,
                  ),
                ),
              ),
            ),
        ],
      ],
    ];
  }

  Future<void> _register(BuildContext context, Tournament tournament) async {
    final auth = context.read<AuthProvider>();
    final provider = context.read<TournamentProvider>();
    final token = auth.token;
    if (token == null || token.isEmpty) {
      return;
    }

    int? teamId;
    String? teamName;
    List<Map<String, dynamic>> roster = const [];
    _TournamentPaymentDraft? paymentDraft;

    if (tournament.format != 'solo') {
      final currentUser = auth.user;
      if (currentUser == null) {
        return;
      }

      final compatibleTeams = provider.teams
          .where(
            (team) =>
                team.canUseForRegistration &&
                team.supportsTeamSize(tournament.teamSize),
          )
          .toList();
      final teamDraft = await showDialog<_TeamRegistrationDraft>(
        context: context,
        builder: (context) => _TeamRegistrationDialog(
          tournament: tournament,
          captain: currentUser,
          savedTeams: compatibleTeams,
        ),
      );

      if (teamDraft == null) {
        return;
      }

      teamId = teamDraft.teamId;
      teamName = teamDraft.teamName;
      roster = teamDraft.roster;
    }

    if (!context.mounted) {
      return;
    }

    if ((tournament.entryFee > 0 || tournament.hasPremiumOffer) &&
        tournament.canRegister) {
      final paymentSelection = await showDialog<_TournamentPaymentDraft>(
        context: context,
        builder: (context) => _TournamentPaymentDialog(tournament: tournament),
      );

      if (paymentSelection == null) {
        return;
      }

      paymentDraft = paymentSelection;
    }

    if (!context.mounted) {
      return;
    }

    final success = await provider.registerForTournament(
      token: token,
      tournamentId: tournament.tournamentId,
      teamId: teamId,
      teamName: teamName,
      roster: roster,
      premiumAccess: paymentDraft?.premiumAccess ?? false,
      paymentMethod: paymentDraft?.paymentMethod,
      paymentReference: paymentDraft?.paymentReference,
      paymentNotes: paymentDraft?.paymentNotes,
    );

    if (!context.mounted) {
      return;
    }

    final updatedTournament = provider.tournaments.firstWhere(
      (entry) => entry.tournamentId == tournament.tournamentId,
      orElse: () => tournament,
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? updatedTournament.isWaitlisted
                    ? updatedTournament.format == 'solo'
                          ? 'You joined the waitlist for ${tournament.title}.'
                          : '${teamName ?? 'Your team'} joined the waitlist for ${tournament.title}.'
                    : updatedTournament.paymentStatus == 'paid'
                    ? updatedTournament.format == 'solo'
                          ? 'Registration confirmed and payment recorded for ${tournament.title}.'
                          : '${teamName ?? 'Your team'} registered for ${tournament.title} and payment was recorded.'
                    : updatedTournament.paymentStatus == 'pending' &&
                          updatedTournament.outstandingAmount > 0
                    ? updatedTournament.format == 'solo'
                          ? 'Registration confirmed. ${formatCurrency(updatedTournament.outstandingAmount)} is still due for ${tournament.title}.'
                          : '${teamName ?? 'Your team'} is registered. ${formatCurrency(updatedTournament.outstandingAmount)} is still due for ${tournament.title}.'
                    : updatedTournament.format == 'solo'
                    ? 'Registration confirmed for ${tournament.title}.'
                    : '${teamName ?? 'Your team'} registered for ${tournament.title}.'
              : (provider.errorMessage ?? 'Could not register right now.'),
        ),
      ),
    );
  }

  Future<void> _openTeamEditor(
    BuildContext context, {
    PersistentTournamentTeam? team,
  }) async {
    final auth = context.read<AuthProvider>();
    final provider = context.read<TournamentProvider>();
    final token = auth.token;
    final currentUser = auth.user;

    if (token == null ||
        token.isEmpty ||
        currentUser == null ||
        !context.mounted) {
      return;
    }

    final teamDraft = await showDialog<_PersistentTeamEditorDraft>(
      context: context,
      builder: (context) =>
          _PersistentTeamEditorDialog(captain: currentUser, initialTeam: team),
    );

    if (teamDraft == null || !context.mounted) {
      return;
    }

    final success = await provider.saveTeam(
      token: token,
      teamId: team?.teamId,
      teamName: teamDraft.teamName,
      teamTag: teamDraft.teamTag,
      preferredGame: teamDraft.preferredGame,
      teamBio: teamDraft.teamBio,
      roster: teamDraft.roster,
    );

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? team == null
                    ? '${teamDraft.teamName} is ready to reuse in future tournaments.'
                    : '${teamDraft.teamName} was updated.'
              : (provider.errorMessage ??
                    'Could not save that team right now.'),
        ),
      ),
    );
  }

  Future<void> _sendTeamInvite(
    BuildContext context,
    PersistentTournamentTeam team,
    PersistentTournamentTeamMember member,
  ) async {
    final auth = context.read<AuthProvider>();
    final provider = context.read<TournamentProvider>();
    final token = auth.token;

    if (token == null ||
        token.isEmpty ||
        !team.canEdit ||
        member.isCaptain ||
        member.memberEmail.trim().isEmpty) {
      return;
    }

    final success = await provider.sendTeamInvite(
      token: token,
      teamId: team.teamId,
      teamMemberId: member.teamMemberId,
    );

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Invite sent to ${member.memberName} for ${team.displayName}.'
              : (provider.errorMessage ??
                    'Could not send that invite right now.'),
        ),
      ),
    );
  }

  Future<void> _respondToTeamInvite(
    BuildContext context,
    PersistentTournamentTeamInvite invite, {
    required bool accept,
  }) async {
    final auth = context.read<AuthProvider>();
    final provider = context.read<TournamentProvider>();
    final token = auth.token;

    if (token == null || token.isEmpty) {
      return;
    }

    final success = await provider.respondToTeamInvite(
      token: token,
      inviteId: invite.inviteId,
      accept: accept,
    );

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? accept
                    ? 'You joined ${invite.teamDisplayName}.'
                    : 'You declined the invite for ${invite.teamDisplayName}.'
              : (provider.errorMessage ??
                    'Could not update that invite right now.'),
        ),
      ),
    );
  }

  Future<void> _withdraw(BuildContext context, Tournament tournament) async {
    final provider = context.read<TournamentProvider>();
    final shouldWithdraw =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Withdraw registration?'),
            content: Text(
              tournament.isWaitlisted
                  ? 'You will leave the waitlist for ${tournament.title}.'
                  : tournament.refundEligible && tournament.refundableAmount > 0
                  ? 'You will lose your confirmed spot in ${tournament.title}. A refund review for ${formatCurrency(tournament.refundableAmount)} should open based on the current policy.'
                  : tournament.amountPaid > 0
                  ? 'You will lose your confirmed spot in ${tournament.title}. This entry may no longer be eligible for a refund under the current policy.'
                  : 'You will lose your confirmed spot in ${tournament.title}.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Keep spot'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Withdraw'),
              ),
            ],
          ),
        ) ??
        false;

    if (!shouldWithdraw || !context.mounted) {
      return;
    }

    final token = context.read<AuthProvider>().token;
    if (token == null || token.isEmpty) {
      return;
    }

    final success = await provider.withdrawFromTournament(
      token: token,
      tournamentId: tournament.tournamentId,
    );

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? tournament.isWaitlisted
                    ? 'You left the waitlist for ${tournament.title}.'
                    : tournament.refundEligible &&
                          tournament.refundableAmount > 0
                    ? 'Registration withdrawn from ${tournament.title}. Refund review opened for ${formatCurrency(tournament.refundableAmount)}.'
                    : 'Registration withdrawn from ${tournament.title}.'
              : (provider.errorMessage ?? 'Could not withdraw right now.'),
        ),
      ),
    );
  }

  Future<void> _openNotification(
    BuildContext context,
    TournamentNotification notification,
  ) async {
    final auth = context.read<AuthProvider>();
    final token = auth.token;
    final provider = context.read<TournamentProvider>();

    if (!notification.isRead && token != null && token.isNotEmpty) {
      await provider.markNotificationRead(
        token: token,
        notificationId: notification.notificationId,
      );
    }

    if (!context.mounted) {
      return;
    }

    final allTournaments = [...provider.myTournaments, ...provider.tournaments];
    Tournament? tournament;

    for (final entry in allTournaments) {
      if (entry.tournamentId == notification.tournamentId) {
        tournament = entry;
        break;
      }
    }

    if (tournament != null) {
      _showTournamentSheet(context, tournament);
    }
  }

  Future<void> _openCommunityPost(
    BuildContext context,
    TournamentCommunityPost post,
  ) async {
    final provider = context.read<TournamentProvider>();
    Tournament? linkedTournament;
    final linkedTournamentId =
        post.linkedTournament?.tournamentId ?? post.linkedTournamentId;

    if (linkedTournamentId != null) {
      final allTournaments = [
        ...provider.myTournaments,
        ...provider.tournaments,
      ];

      for (final entry in allTournaments) {
        if (entry.tournamentId == linkedTournamentId &&
            entry.status.trim().toLowerCase() == 'published') {
          linkedTournament = entry;
          break;
        }
      }
    }

    final shouldOpenTournament =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(post.title),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (post.subtitle.trim().isNotEmpty) ...[
                      Text(
                        post.subtitle,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Text(
                      post.summary,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    if (post.body.trim().isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text(
                        post.body,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                          height: 1.6,
                        ),
                      ),
                    ],
                    if (post.linkedTournament != null) ...[
                      const SizedBox(height: 14),
                      Text(
                        'Linked event: ${post.linkedTournament!.title}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.lightTurquoise,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Close'),
              ),
              if (linkedTournamentId != null)
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(
                    post.ctaLabel.trim().isNotEmpty
                        ? post.ctaLabel
                        : 'Open event',
                  ),
                ),
            ],
          ),
        ) ??
        false;

    if (!context.mounted ||
        !shouldOpenTournament ||
        linkedTournamentId == null) {
      return;
    }

    if (linkedTournament == null) {
      final linkedSlug = post.linkedTournament?.slug.trim() ?? '';
      try {
        linkedTournament = await provider.fetchPublicTournamentDetails(
          slugOrId: linkedSlug.isNotEmpty ? linkedSlug : '$linkedTournamentId',
        );
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('This linked event is unavailable.')),
          );
        }
        return;
      }
    }

    if (!context.mounted ||
        linkedTournament.status.trim().toLowerCase() != 'published') {
      return;
    }

    _showTournamentSheet(context, linkedTournament);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TournamentProvider>();
    final auth = context.watch<AuthProvider>();
    final businessProvider = context.watch<BusinessProvider>();
    final selectedBusiness = businessProvider.businessForId(
      widget.initialBusinessId,
    );
    final hasPinnedBusiness = widget.initialBusinessId != null;
    final activeBusinessName =
        widget.initialBusinessName ?? selectedBusiness?.name ?? 'selected cafe';
    final tournaments = provider.tournaments;
    final myTournaments = provider.myTournaments;
    final teams = provider.teams;
    final teamInvites = provider.teamInvites;
    final communityPosts = provider.communityPosts;
    final notifications = provider.notifications.take(6).toList();
    final leaderboard = provider.leaderboard.take(6).toList();
    final unreadNotifications = provider.notifications
        .where((item) => !item.isRead)
        .length;
    final upcoming = tournaments.where((item) => item.isUpcoming).length;
    final featured = tournaments.where((item) => item.isFeatured).length;
    final hostCafeCount = tournaments
        .map((item) => item.businessId)
        .where((id) => id > 0)
        .toSet()
        .length;
    final isSignedIn = (auth.token ?? '').isNotEmpty;
    final availableViews = [
      _TournamentView.discover,
      if (isSignedIn) ...[_TournamentView.myEvents, _TournamentView.teams],
      _TournamentView.updates,
    ];
    final selectedView = availableViews.contains(_activeView)
        ? _activeView
        : _TournamentView.discover;
    final viewCounts = <_TournamentView, int>{
      _TournamentView.discover: tournaments.length,
      _TournamentView.myEvents: myTournaments.length,
      _TournamentView.teams: teams.length + teamInvites.length,
      _TournamentView.updates: unreadNotifications + communityPosts.length,
    };

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: RefreshIndicator(
        onRefresh: () => _refresh(context),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 110),
          children: [
            if (selectedView == _TournamentView.discover)
              ..._buildDiscoverMarketplace(
                context: context,
                tournaments: tournaments,
                provider: provider,
                auth: auth,
                hasPinnedBusiness: hasPinnedBusiness,
                activeBusinessName: activeBusinessName,
                leaderboard: leaderboard,
                availableViews: availableViews,
                viewCounts: viewCounts,
                selectedView: selectedView,
              )
            else ...[
              AppHeroBanner(
                eyebrow: hasPinnedBusiness
                    ? 'Cafe tournament hub'
                    : 'Tournament hub',
                title: hasPinnedBusiness
                    ? '$activeBusinessName events'
                    : 'Manage your tournament flow',
                subtitle: hasPinnedBusiness
                    ? 'Browse tournaments hosted by $activeBusinessName while still keeping your registrations, teams, and updates in one place.'
                    : 'Jump between your registrations, saved squads, and live tournament updates from one place.',
                icon: Icons.emoji_events_rounded,
                accent: AppTheme.primaryOrange,
                stats: [
                  AppMetricTile(
                    label: 'Open events',
                    value: '${tournaments.length}',
                    caption: hasPinnedBusiness
                        ? '$upcoming upcoming right now'
                        : '$upcoming upcoming across ${hostCafeCount == 0 ? 'all partner cafes' : '$hostCafeCount cafes'}',
                    accent: AppTheme.primaryOrange,
                    icon: Icons.visibility_outlined,
                  ),
                  AppMetricTile(
                    label: 'Featured',
                    value: '$featured',
                    caption: 'Highlighted brackets',
                    accent: AppTheme.warning,
                    icon: Icons.workspace_premium_outlined,
                  ),
                  AppMetricTile(
                    label: 'My events',
                    value: '${myTournaments.length}',
                    caption: isSignedIn
                        ? 'Active registrations and waitlists'
                        : 'Sign in to track your entries',
                    accent: AppTheme.success,
                    icon: Icons.how_to_reg_rounded,
                  ),
                  AppMetricTile(
                    label: 'Unread updates',
                    value: '$unreadNotifications',
                    caption: isSignedIn
                        ? 'Tournament messages waiting'
                        : 'Sign in to receive updates',
                    accent: AppTheme.primaryTurquoise,
                    icon: Icons.notifications_none_rounded,
                  ),
                ],
                actions: [
                  OutlinedButton.icon(
                    onPressed: provider.isLoading
                        ? null
                        : () => _refresh(context),
                    icon: provider.isLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh_rounded),
                    label: Text(
                      provider.isLoading ? 'Refreshing' : 'Refresh feed',
                    ),
                  ),
                  if (isSignedIn)
                    FilledButton.tonalIcon(
                      onPressed: provider.isTeamSaving || auth.user == null
                          ? null
                          : () => _openTeamEditor(context),
                      icon: const Icon(Icons.group_add_outlined),
                      label: const Text('Create team'),
                    ),
                ],
              ),
              if (hasPinnedBusiness) ...[
                const SizedBox(height: 14),
                GlassPanel(
                  padding: const EdgeInsets.all(AppSpace.md),
                  child: AppDataRow(
                    label: 'Active cafe filter',
                    value: activeBusinessName,
                    emphasize: true,
                    valueColor: AppTheme.lightTurquoise,
                    padding: EdgeInsets.zero,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              GlassPanel(
                padding: const EdgeInsets.all(AppSpace.md),
                child: Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: availableViews.map((view) {
                    final isSelected = selectedView == view;
                    final label = switch (view) {
                      _TournamentView.discover => 'Discover',
                      _TournamentView.myEvents => 'My events',
                      _TournamentView.teams => 'Teams',
                      _TournamentView.updates => 'Updates',
                    };

                    return ChoiceChip(
                      label: Text('$label (${viewCounts[view] ?? 0})'),
                      selected: isSelected,
                      showCheckmark: false,
                      onSelected: (_) {
                        setState(() {
                          _activeView = view;
                        });
                      },
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 18),
            ],
            if (selectedView == _TournamentView.teams && isSignedIn) ...[
              AppSectionTitle(
                title: 'My teams',
                subtitle: teams.isEmpty
                    ? 'Save a reusable roster once, then invite teammates into shared squads you can reuse across future tournaments.'
                    : 'Captain-owned teams can be edited and reused for registration. Accepted member teams stay visible here too.',
                trailing: OutlinedButton.icon(
                  onPressed: provider.isTeamSaving || auth.user == null
                      ? null
                      : () => _openTeamEditor(context),
                  icon: provider.isTeamSaving && provider.activeTeamId == null
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.group_add_outlined),
                  label: Text(
                    provider.isTeamSaving && provider.activeTeamId == null
                        ? 'Saving...'
                        : 'Create team',
                  ),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: auth.token == null
                    ? null
                    : () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              TournamentPlayerFinderScreen(token: auth.token!),
                        ),
                      ),
                icon: const Icon(Icons.groups_outlined),
                label: const Text('Find players and manage your profile'),
              ),
              const SizedBox(height: 14),
              if (teamInvites.isNotEmpty) ...[
                AppSectionTitle(
                  title: 'Team invites',
                  subtitle:
                      'Accept shared-squad invites to keep up with the teams you are part of.',
                ),
                const SizedBox(height: 14),
                ...teamInvites.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AppReveal(
                      delay: Duration(milliseconds: 35 * entry.key),
                      child: _TournamentTeamInviteCard(
                        invite: entry.value,
                        isBusy: provider.isBusyForTeamInvite(
                          entry.value.inviteId,
                        ),
                        onAccept: () => _respondToTeamInvite(
                          context,
                          entry.value,
                          accept: true,
                        ),
                        onDecline: () => _respondToTeamInvite(
                          context,
                          entry.value,
                          accept: false,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (teams.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 18),
                  child: EmptyGlassState(
                    title: 'No saved squads yet',
                    message:
                        'Create a reusable team once and you can register that roster in future duo, squad, and team tournaments without rebuilding it every time.',
                    icon: Icons.groups_outlined,
                  ),
                )
              else
                ...teams.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: AppReveal(
                      delay: Duration(milliseconds: 40 * entry.key),
                      child: _SavedTournamentTeamCard(
                        team: entry.value,
                        isBusy: provider.isBusyForTeam(entry.value.teamId),
                        onEdit: entry.value.canEdit
                            ? () => _openTeamEditor(context, team: entry.value)
                            : null,
                        onInviteMember: entry.value.canEdit
                            ? (member) =>
                                  _sendTeamInvite(context, entry.value, member)
                            : null,
                        isMemberInviteBusy: provider.isBusyForTeamMember,
                      ),
                    ),
                  ),
                ),
            ],
            if (selectedView == _TournamentView.myEvents) ...[
              AppSectionTitle(
                title: 'My tournaments',
                subtitle: myTournaments.isEmpty
                    ? 'Register for any open event to see your active tournament entries here.'
                    : 'These are your active tournament entries, including any waitlist positions.',
              ),
              const SizedBox(height: 14),
              if (myTournaments.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 18),
                  child: EmptyGlassState(
                    title: 'No active registrations',
                    message:
                        'Your confirmed entries and waitlist positions will appear here once you join a tournament.',
                    icon: Icons.flag_outlined,
                  ),
                )
              else
                ...myTournaments.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: AppReveal(
                      delay: Duration(milliseconds: 45 * entry.key),
                      child: _TournamentCard(
                        tournament: entry.value,
                        isMine: true,
                        isBusy: provider.isBusyFor(entry.value.tournamentId),
                        onRegister: entry.value.isRegistered
                            ? null
                            : () => _register(context, entry.value),
                        onWithdraw: entry.value.canWithdrawRegistration
                            ? () => _withdraw(context, entry.value)
                            : null,
                      ),
                    ),
                  ),
                ),
            ],
            if (selectedView == _TournamentView.updates && isSignedIn) ...[
              AppSectionTitle(
                title: 'Recent updates',
                subtitle: notifications.isEmpty
                    ? 'Tournament notifications from your registrations will appear here.'
                    : unreadNotifications > 0
                    ? '$unreadNotifications unread tournament update${unreadNotifications == 1 ? '' : 's'} waiting for you.'
                    : 'You are caught up on your tournament updates.',
              ),
              const SizedBox(height: 14),
              if (notifications.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 18),
                  child: EmptyGlassState(
                    title: 'No tournament updates yet',
                    message:
                        'As brackets go live and admins send tournament announcements, they will appear here.',
                    icon: Icons.notifications_none_rounded,
                  ),
                )
              else
                ...notifications.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AppReveal(
                      delay: Duration(milliseconds: 40 * entry.key),
                      child: _TournamentNotificationCard(
                        notification: entry.value,
                        isBusy: provider.isNotificationBusyFor(
                          entry.value.notificationId,
                        ),
                        onTap: () => _openNotification(context, entry.value),
                      ),
                    ),
                  ),
                ),
            ],
            if (selectedView == _TournamentView.updates) ...[
              if (provider.matchHighlights.isNotEmpty) ...[
                AppSectionTitle(
                  title: 'Recent match highlights',
                  subtitle:
                      'Completed public bracket results with scores and round details.',
                ),
                const SizedBox(height: 12),
                ...provider.matchHighlights.map(
                  (highlight) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _TournamentMatchHighlightCard(highlight: highlight),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              AppSectionTitle(
                title: 'Community pulse',
                subtitle: communityPosts.isEmpty
                    ? 'Fresh promos, spotlights, and recap cards from the tournament desk will appear here.'
                    : 'Follow featured events, promos, and tournament recaps curated by the staff.',
              ),
              const SizedBox(height: 14),
              if (provider.isCommunityPostsLoading && communityPosts.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 18),
                  child: GlassPanel(
                    child: Row(
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 12),
                        Expanded(child: Text('Loading tournament community…')),
                      ],
                    ),
                  ),
                )
              else if (provider.communityPostsError != null &&
                  communityPosts.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: GlassPanel(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.wifi_tethering_error_rounded,
                          color: AppTheme.warning,
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'Community posts could not load. Check your connection and try again.',
                          ),
                        ),
                        TextButton(
                          onPressed: provider.loadCommunityPosts,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (communityPosts.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 18),
                  child: EmptyGlassState(
                    title: 'No community posts yet',
                    message:
                        'Tournament updates, promos, and recaps from the staff will appear here.',
                    icon: Icons.campaign_outlined,
                  ),
                )
              else
                ...communityPosts.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AppReveal(
                      delay: Duration(milliseconds: 40 * entry.key),
                      child: _TournamentCommunityPostCard(
                        post: entry.value,
                        onTap: () => _openCommunityPost(context, entry.value),
                        isSignedIn: isSignedIn,
                        isLiked: _likedCommunityPostIds.contains(
                          entry.value.postId,
                        ),
                        isBusy: _busyCommunityPostIds.contains(
                          entry.value.postId,
                        ),
                        reactionCount:
                            _communityReactionCounts[entry.value.postId] ??
                            entry.value.reactionCount,
                        onLike: auth.token == null
                            ? null
                            : () => _toggleCommunityReaction(
                                entry.value,
                                auth.token!,
                              ),
                        onReport: auth.token == null
                            ? null
                            : () => _reportCommunityPost(
                                entry.value,
                                auth.token!,
                              ),
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
