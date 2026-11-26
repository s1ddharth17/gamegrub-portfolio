import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/business.dart';
import '../../models/cafe_discovery.dart';
import '../../models/pc.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../services/business_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_chrome.dart';
import '../booking/booking_screen.dart';
import 'cafe_detail_screen.dart';
import '../game_guru/game_guru_screen.dart';

class CafeMarketplaceScreen extends StatefulWidget {
  const CafeMarketplaceScreen({super.key});

  @override
  State<CafeMarketplaceScreen> createState() => _CafeMarketplaceScreenState();
}

class _CafeMarketplaceScreenState extends State<CafeMarketplaceScreen> {
  static const List<_GameMood> _moods = [
    _GameMood(
      id: 'all',
      label: 'All',
      caption: 'Everything nearby',
      icon: Icons.travel_explore_rounded,
      tint: Color(0xFFFF5C72),
    ),
    _GameMood(
      id: 'squad',
      label: 'Squad',
      caption: 'Team nights',
      icon: Icons.groups_rounded,
      tint: Color(0xFF7C5CFF),
    ),
    _GameMood(
      id: 'esports',
      label: 'Esports',
      caption: 'Competitive play',
      icon: Icons.emoji_events_rounded,
      tint: Color(0xFF00BFA5),
    ),
    _GameMood(
      id: 'lateNight',
      label: 'Late Night',
      caption: 'After-hours grind',
      icon: Icons.nightlight_round_rounded,
      tint: Color(0xFF5B6CFF),
    ),
    _GameMood(
      id: 'foodPlay',
      label: 'Food + Play',
      caption: 'Snacks included',
      icon: Icons.fastfood_rounded,
      tint: Color(0xFFFFA726),
    ),
    _GameMood(
      id: 'premium',
      label: 'Premium',
      caption: 'Top-rated spots',
      icon: Icons.workspace_premium_rounded,
      tint: Color(0xFFFFC107),
    ),
  ];

  static const List<_QuickFilterData> _quickFilters = [
    _QuickFilterData(
      id: 'featured',
      label: 'Featured cafes',
      icon: Icons.auto_awesome_rounded,
    ),
    _QuickFilterData(
      id: 'topRated',
      label: 'Top rated',
      icon: Icons.star_rounded,
    ),
    _QuickFilterData(
      id: 'tournaments',
      label: 'Tournament ready',
      icon: Icons.emoji_events_rounded,
    ),
    _QuickFilterData(
      id: 'lateNight',
      label: 'Late night',
      icon: Icons.bedtime_rounded,
    ),
  ];

  final TextEditingController _searchController = TextEditingController();
  final Set<String> _activeFilters = <String>{};
  final BusinessService _businessService = BusinessService();
  List<CafeDiscoveryResult> _discoveryResults = const [];
  DateTime _planDate = DateTime.now();
  int _planStartHour = 19;
  int _planDurationHours = 2;
  int _planGroupSize = 1;
  String _locationFilter = '';
  String _gameFilter = '';
  String _categoryFilter = 'all';
  double? _maxPricePerHour;
  double _minimumRating = 0;
  bool _openNowOnly = false;
  bool _foodOnly = false;
  bool _tournamentOnly = false;
  bool _discoveryLoading = true;
  String? _discoveryError;

  String _searchQuery = '';
  String _selectedMoodId = 'all';
  bool _squadMode = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final moveToTomorrow = now.hour >= 22;
    _planDate = DateTime(
      now.year,
      now.month,
      now.day + (moveToTomorrow ? 1 : 0),
    );
    _planStartHour = moveToTomorrow ? 9 : (now.hour < 9 ? 9 : now.hour + 1);
    context.read<BusinessProvider>().loadBusinesses();
    Future.microtask(_loadDiscovery);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _openCafe(Business business) async {
    await context.read<BusinessProvider>().selectBusiness(business);

    if (!mounted) {
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CafeDetailScreen(initialBusiness: business),
      ),
    );
  }

  Future<void> _loadDiscovery() async {
    if (!mounted) return;
    setState(() {
      _discoveryLoading = true;
      _discoveryError = null;
    });
    try {
      final rows = await _businessService.fetchCafeDiscovery(
        date: _planDate,
        startHour: _planStartHour,
        durationHours: _planDurationHours,
      );
      if (!mounted) return;
      setState(() {
        _discoveryResults = rows
            .map(
              (row) => CafeDiscoveryResult.fromJson(
                Map<String, dynamic>.from(row as Map),
              ),
            )
            .toList();
      });
    } catch (error) {
      if (mounted) {
        setState(
          () =>
              _discoveryError = 'Live availability is temporarily unavailable.',
        );
      }
    } finally {
      if (mounted) setState(() => _discoveryLoading = false);
    }
  }

  Future<void> _refreshMarketplace() async {
    await Future.wait([
      context.read<BusinessProvider>().loadBusinesses(forceRefresh: true),
      _loadDiscovery(),
    ]);
  }

  Future<void> _openDiscoveryFilters() async {
    final locationController = TextEditingController(text: _locationFilter);
    final priceController = TextEditingController(
      text: _maxPricePerHour?.toStringAsFixed(0) ?? '',
    );
    var selectedGame = _gameFilter;
    var selectedCategory = _categoryFilter;
    var selectedRating = _minimumRating;
    var selectedDate = _planDate;
    var selectedHour = _planStartHour;
    var selectedDuration = _planDurationHours;
    var selectedGroupSize = _planGroupSize;
    var openNow = _openNowOnly;
    var foodOnly = _foodOnly;
    var tournamentOnly = _tournamentOnly;
    final games =
        _discoveryResults.expand((result) => result.gameTitles).toSet().toList()
          ..sort();

    final filters = await showModalBottomSheet<_CafeDiscoveryFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.9,
            ),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Plan your gaming session',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                    children: [
                      TextField(
                        controller: locationController,
                        decoration: const InputDecoration(
                          labelText: 'Location',
                          hintText: 'City, state, or area',
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue:
                            selectedGame.isEmpty || games.contains(selectedGame)
                            ? selectedGame
                            : '',
                        decoration: const InputDecoration(
                          labelText: 'Game / tournament',
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('Any game'),
                          ),
                          ...games.map(
                            (game) => DropdownMenuItem(
                              value: game,
                              child: Text(game),
                            ),
                          ),
                        ],
                        onChanged: (value) =>
                            setSheetState(() => selectedGame = value ?? ''),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: selectedCategory,
                        decoration: const InputDecoration(labelText: 'PC tier'),
                        items: const [
                          DropdownMenuItem(
                            value: 'all',
                            child: Text('Any setup'),
                          ),
                          DropdownMenuItem(
                            value: 'esports_pc',
                            child: Text('Esports PC'),
                          ),
                          DropdownMenuItem(
                            value: 'high_end_pc',
                            child: Text('High-end PC'),
                          ),
                          DropdownMenuItem(
                            value: 'console',
                            child: Text('Console'),
                          ),
                        ],
                        onChanged: (value) => setSheetState(
                          () => selectedCategory = value ?? 'all',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: priceController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Maximum setup price per hour',
                          prefixText: 'Rs ',
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<double>(
                        initialValue: selectedRating,
                        decoration: const InputDecoration(
                          labelText: 'Minimum rating',
                        ),
                        items: const [0.0, 3.0, 4.0, 4.5]
                            .map(
                              (rating) => DropdownMenuItem(
                                value: rating,
                                child: Text(
                                  rating == 0
                                      ? 'Any rating'
                                      : '$rating stars and up',
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) =>
                            setSheetState(() => selectedRating = value ?? 0),
                      ),
                      const SizedBox(height: 10),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Open right now'),
                        value: openNow,
                        onChanged: (value) =>
                            setSheetState(() => openNow = value),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Food available'),
                        value: foodOnly,
                        onChanged: (value) =>
                            setSheetState(() => foodOnly = value),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Upcoming tournaments'),
                        value: tournamentOnly,
                        onChanged: (value) =>
                            setSheetState(() => tournamentOnly = value),
                      ),
                      const Divider(height: 24),
                      Text(
                        'Live availability',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Visit date'),
                        subtitle: Text(
                          '${selectedDate.day}/${selectedDate.month}/${selectedDate.year}',
                        ),
                        trailing: const Icon(Icons.calendar_month_outlined),
                        onTap: () async {
                          final now = DateTime.now();
                          final picked = await showDatePicker(
                            context: sheetContext,
                            firstDate: DateTime(now.year, now.month, now.day),
                            lastDate: DateTime(now.year + 1),
                            initialDate: selectedDate,
                          );
                          if (picked != null) {
                            setSheetState(() => selectedDate = picked);
                          }
                        },
                      ),
                      DropdownButtonFormField<int>(
                        initialValue: selectedHour,
                        decoration: const InputDecoration(
                          labelText: 'Start time',
                        ),
                        items: List.generate(14, (index) => index + 9)
                            .map(
                              (hour) => DropdownMenuItem(
                                value: hour,
                                child: Text(_formatHour(hour)),
                              ),
                            )
                            .toList(),
                        onChanged: (value) => setSheetState(() {
                          selectedHour = value ?? 19;
                          if (selectedDuration > 23 - selectedHour) {
                            selectedDuration = 23 - selectedHour;
                          }
                        }),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        initialValue: selectedDuration,
                        decoration: const InputDecoration(
                          labelText: 'Session duration',
                        ),
                        items:
                            List.generate(
                                  (23 - selectedHour).clamp(1, 8).toInt(),
                                  (index) => index + 1,
                                )
                                .map(
                                  (hours) => DropdownMenuItem(
                                    value: hours,
                                    child: Text(
                                      '$hours ${hours == 1 ? 'hour' : 'hours'}',
                                    ),
                                  ),
                                )
                                .toList(),
                        onChanged: (value) =>
                            setSheetState(() => selectedDuration = value ?? 2),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        initialValue: selectedGroupSize,
                        decoration: const InputDecoration(
                          labelText: 'Group size',
                        ),
                        items: List.generate(8, (index) => index + 1)
                            .map(
                              (size) => DropdownMenuItem(
                                value: size,
                                child: Text(
                                  '$size ${size == 1 ? 'player' : 'players'}',
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) =>
                            setSheetState(() => selectedGroupSize = value ?? 1),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => Navigator.pop(
                        sheetContext,
                        _CafeDiscoveryFilters(
                          location: locationController.text.trim(),
                          game: selectedGame,
                          category: selectedCategory,
                          maxPricePerHour: double.tryParse(
                            priceController.text.trim(),
                          ),
                          minRating: selectedRating,
                          openNow: openNow,
                          foodOnly: foodOnly,
                          tournamentsOnly: tournamentOnly,
                          date: selectedDate,
                          startHour: selectedHour,
                          durationHours: selectedDuration,
                          groupSize: selectedGroupSize,
                        ),
                      ),
                      icon: const Icon(Icons.auto_awesome_rounded),
                      label: const Text('Find my setup'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    locationController.dispose();
    priceController.dispose();
    if (filters == null || !mounted) return;
    setState(() {
      _locationFilter = filters.location;
      _gameFilter = filters.game;
      _categoryFilter = filters.category;
      _maxPricePerHour = filters.maxPricePerHour;
      _minimumRating = filters.minRating;
      _openNowOnly = filters.openNow;
      _foodOnly = filters.foodOnly;
      _tournamentOnly = filters.tournamentsOnly;
      _planDate = filters.date;
      _planStartHour = filters.startHour;
      _planDurationHours = filters.durationHours;
      _planGroupSize = filters.groupSize;
    });
    await _loadDiscovery();
  }

  List<PC> _eligibleSetups(CafeDiscoveryResult result) =>
      result.availableSetups.where((setup) {
        if (_categoryFilter != 'all' && setup.category != _categoryFilter) {
          return false;
        }
        if (_maxPricePerHour != null && setup.price > _maxPricePerHour!) {
          return false;
        }
        return true;
      }).toList();

  int get _requestedGroupSize =>
      _squadMode ? math.max(4, _planGroupSize) : _planGroupSize;

  bool _matchesDiscovery(CafeDiscoveryResult result) {
    final business = result.business;
    final location = _locationFilter.trim().toLowerCase();
    if (location.isNotEmpty &&
        ![
          business.city,
          business.state,
          business.addressLine1,
        ].any((value) => value.toLowerCase().contains(location))) {
      return false;
    }
    if (!_isCafeOpenForPlan(business)) return false;
    if (_openNowOnly && !result.isOpenNow) return false;
    if (_gameFilter.isNotEmpty &&
        !result.gameTitles.any(
          (game) => game.toLowerCase() == _gameFilter.toLowerCase(),
        )) {
      return false;
    }
    if (_maxPricePerHour != null &&
        (result.minPricePerHour == null ||
            result.minPricePerHour! > _maxPricePerHour!)) {
      return false;
    }
    if (_minimumRating > 0 && business.averageRating < _minimumRating) {
      return false;
    }
    if (_foodOnly && business.menuItemCount == 0) return false;
    if (_tournamentOnly && business.publishedTournamentCount == 0) return false;
    return _eligibleSetups(result).length >= _requestedGroupSize;
  }

  bool _isCafeOpenForPlan(Business business) {
    final opensAt = _clockMinutes(business.opensAt);
    final closesAt = _clockMinutes(business.closesAt);
    if (opensAt == null || closesAt == null) return true;

    final closingBoundary = closesAt <= opensAt ? closesAt + 24 * 60 : closesAt;
    for (
      var hour = _planStartHour;
      hour < _planStartHour + _planDurationHours;
      hour++
    ) {
      final slotStart = hour * 60;
      final slotEnd = slotStart + 60;
      if (slotStart < opensAt || slotEnd > closingBoundary) return false;
    }
    return true;
  }

  int? _clockMinutes(String value) {
    final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(value.trim());
    if (match == null) return null;
    final hour = int.tryParse(match.group(1)!);
    final minute = int.tryParse(match.group(2)!);
    if (hour == null || minute == null || hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  List<String> _reasonsFor(CafeDiscoveryResult result) {
    final business = result.business;
    final eligible = _eligibleSetups(result);
    return [
      '${eligible.length} live ${eligible.length == 1 ? 'setup' : 'setups'} fit your $_requestedGroupSize-player group for $_planDurationHours ${_planDurationHours == 1 ? 'hour' : 'hours'} starting ${_formatHour(_planStartHour)}.',
      if (_categoryFilter != 'all')
        'Includes ${_categoryLabel(_categoryFilter)} setups.',
      if (_maxPricePerHour != null)
        'At least one matching setup stays within Rs ${_maxPricePerHour!.toStringAsFixed(0)}/hour.',
      if (_gameFilter.isNotEmpty) 'Hosts an upcoming $_gameFilter tournament.',
      if (_foodOnly)
        '${business.menuItemCount} menu items are listed as available.',
      if (_minimumRating > 0)
        'Rated ${business.averageRating.toStringAsFixed(1)} from ${business.reviewCount} reviews.',
      if (_openNowOnly) 'Open now in the cafe timezone.',
      if (_tournamentOnly && _gameFilter.isEmpty)
        '${business.publishedTournamentCount} upcoming tournaments are published.',
    ].take(3).toList();
  }

  int _discoveryScore(CafeDiscoveryResult result) {
    return _eligibleSetups(result).length * 100 +
        (result.business.averageRating * 10).round() +
        (result.business.isFeatured ? 10 : 0) +
        (result.isOpenNow ? 4 : 0) +
        (result.business.menuItemCount > 0 ? 2 : 0);
  }

  Future<void> _bookRecommendedSetup(CafeDiscoveryResult result) async {
    final setups = _eligibleSetups(result);
    if (setups.isEmpty) return;
    await context.read<BusinessProvider>().selectBusiness(result.business);
    if (!mounted) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => BookingScreen(
          pc: setups.first,
          businessName: result.business.name,
          initialDate: _planDate,
          initialStartHour: _planStartHour,
          initialDurationHours: _planDurationHours,
        ),
      ),
    );
  }

  Future<void> _askGameGuru(CafeDiscoveryResult result) async {
    final setups = _eligibleSetups(result);
    final setup = setups.isEmpty ? null : setups.first;
    final game = _gameFilter.isNotEmpty ? _gameFilter : 'a competitive game';
    final prompt = setup == null
        ? 'Help me choose a cafe for $game in ${result.business.city}.'
        : 'Would the ${setup.category} setup at ${result.business.name} suit $game for a $_requestedGroupSize-player group during a $_planDurationHours-hour session under Rs ${_maxPricePerHour?.toStringAsFixed(0) ?? 'any'}/hour?';
    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => GameGuruScreen(initialQuery: prompt),
      ),
    );
  }

  static String _formatHour(int hour) {
    final normalized = hour % 24;
    final display = normalized % 12 == 0 ? 12 : normalized % 12;
    return '$display ${normalized >= 12 ? 'PM' : 'AM'}';
  }

  static String _categoryLabel(String category) => switch (category) {
    'high_end_pc' => 'High-end PC',
    'console' => 'Console',
    'esports_pc' => 'Esports PC',
    _ => 'Gaming setup',
  };

  void _toggleQuickFilter(String id) {
    setState(() {
      if (_activeFilters.contains(id)) {
        _activeFilters.remove(id);
      } else {
        _activeFilters.add(id);
      }
    });
  }

  void _clearRefinements() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedMoodId = 'all';
      _squadMode = false;
      _activeFilters.clear();
      _locationFilter = '';
      _gameFilter = '';
      _categoryFilter = 'all';
      _maxPricePerHour = null;
      _minimumRating = 0;
      _openNowOnly = false;
      _foodOnly = false;
      _tournamentOnly = false;
      _planGroupSize = 1;
    });
  }

  bool _matchesSearch(Business business) {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return true;
    }

    return <String>[
      business.name,
      business.tagline,
      business.description,
      business.city,
      business.state,
      business.addressLine1,
    ].any((value) => value.toLowerCase().contains(query));
  }

  bool _matchesMood(Business business) {
    switch (_selectedMoodId) {
      case 'squad':
        return business.availableRigs >= 4 || business.totalRigs >= 8;
      case 'esports':
        return business.publishedTournamentCount > 0 || business.isFeatured;
      case 'lateNight':
        return _isLateNightCafe(business);
      case 'foodPlay':
        return business.menuItemCount >= 6 ||
            business.featuredMenuItemCount > 0;
      case 'premium':
        return business.isFeatured || business.averageRating >= 4.2;
      case 'all':
      default:
        return true;
    }
  }

  bool _matchesQuickFilters(Business business) {
    if (_squadMode && business.availableRigs < 4) {
      return false;
    }

    if (_activeFilters.contains('featured') && !business.isFeatured) {
      return false;
    }

    if (_activeFilters.contains('topRated') && business.averageRating < 4.0) {
      return false;
    }

    if (_activeFilters.contains('tournaments') &&
        business.publishedTournamentCount == 0) {
      return false;
    }

    if (_activeFilters.contains('lateNight') && !_isLateNightCafe(business)) {
      return false;
    }

    return true;
  }

  bool _isLateNightCafe(Business business) {
    final hour = _parseHour(business.closesAt);
    if (hour == null) {
      return false;
    }

    return hour >= 23 || hour <= 4;
  }

  int? _parseHour(String rawTime) {
    final value = rawTime.trim();
    if (value.isEmpty) {
      return null;
    }

    final segments = value.split(':');
    if (segments.length < 2) {
      return null;
    }

    final hour = int.tryParse(segments.first);
    if (hour == null) {
      return null;
    }

    return ((hour % 24) + 24) % 24;
  }

  int _businessScore(Business business) {
    final featuredScore = business.isFeatured ? 160 : 0;
    final ratingScore = (business.averageRating * 100).round();
    final reviewScore = business.reviewCount.clamp(0, 400);
    final rigScore = business.availableRigs * 14;
    final menuScore = business.menuItemCount * 5;
    final tournamentScore = business.publishedTournamentCount * 40;
    return featuredScore +
        ratingScore +
        reviewScore +
        rigScore +
        menuScore +
        tournamentScore;
  }

  List<Business> _sortBusinesses(Iterable<Business> businesses) {
    final sorted = businesses.toList();
    sorted.sort((left, right) {
      return _businessScore(right).compareTo(_businessScore(left));
    });
    return sorted;
  }

  String _searchHintForUser(AuthProvider auth) {
    final favoriteGame = auth.user?.favoriteGame.trim() ?? '';
    if (favoriteGame.isNotEmpty) {
      return 'Search "$favoriteGame" cafes';
    }

    return 'Search cafes, games, or squads';
  }

  String _headlineLocation(Business? selectedBusiness) {
    if (selectedBusiness == null) {
      return 'Discover gaming cafes near you';
    }

    return selectedBusiness.fullAddress;
  }

  String _selectedCafeBannerText(Business? selectedBusiness) {
    if (selectedBusiness == null) {
      return 'Auto-matching high-energy gaming cafes with live rigs and food counters near you.';
    }

    return '${selectedBusiness.name} has ${selectedBusiness.availableRigs} rigs open, ${selectedBusiness.menuItemCount} food picks, and ${selectedBusiness.publishedTournamentCount} live events.';
  }

  String _promoHeadline(Business? selectedBusiness) {
    if (selectedBusiness != null && selectedBusiness.isFeatured) {
      return 'UNLOCK WEEKEND BOOSTS';
    }

    return 'QUEUE UP TONIGHT';
  }

  String _promoSubtitle(Business? selectedBusiness, int cafeCount) {
    if (selectedBusiness != null) {
      return 'Start with ${selectedBusiness.name} or scout $cafeCount listed cafes before your squad locks in.';
    }

    return 'Compare rigs, food counters, and community events before you book your next arena.';
  }

  String _dealLabel(Business business) {
    if (business.publishedTournamentCount > 0) {
      final suffix = business.publishedTournamentCount == 1 ? '' : 's';
      return '${business.publishedTournamentCount} tournament$suffix live';
    }

    if (business.availableRigs >= 6) {
      return 'Squad-ready rigs open';
    }

    if (business.menuItemCount >= 6) {
      return 'Food + play combo live';
    }

    if (business.isFeatured) {
      return 'Featured cafe tonight';
    }

    return 'Late-night queue ready';
  }

  String _secondaryMeta(Business business) {
    final parts = <String>[
      '${business.availableRigs} rigs open',
      if (business.publishedTournamentCount > 0)
        '${business.publishedTournamentCount} events',
      if (business.menuItemCount > 0) '${business.menuItemCount} snacks',
    ];

    return parts.isEmpty ? 'Gaming cafe live' : parts.join('  |  ');
  }

  String _compactReviewLabel(Business business) {
    if (!business.hasReviews) {
      return 'New';
    }

    return business.averageRating.toStringAsFixed(1);
  }

  String _reviewFootnote(Business business) {
    if (!business.hasReviews) {
      return 'Be the first to rate';
    }

    final reviewCount = business.reviewCount;
    if (reviewCount >= 1000) {
      final compact = reviewCount >= 10000
          ? '${(reviewCount / 1000).round()}K+'
          : '${(reviewCount / 1000).toStringAsFixed(1)}K+';
      return 'By $compact players';
    }

    return 'By $reviewCount+ players';
  }

  String _bottomStatLabel(Business business) {
    if (_isLateNightCafe(business)) {
      return 'Late night';
    }

    if (business.isFeatured) {
      return 'Featured';
    }

    return business.shortLocation;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final businessProvider = context.watch<BusinessProvider>();
    final selectedBusiness = businessProvider.selectedBusiness;
    final discoveryMatches =
        _discoveryResults.where((result) {
          final gameMatchesSearch =
              _searchQuery.trim().isEmpty ||
              result.gameTitles.any(
                (game) => game.toLowerCase().contains(
                  _searchQuery.trim().toLowerCase(),
                ),
              );
          return _matchesDiscovery(result) &&
              (gameMatchesSearch || _matchesSearch(result.business)) &&
              _matchesMood(result.business) &&
              _matchesQuickFilters(result.business);
        }).toList()..sort(
          (left, right) =>
              _discoveryScore(right).compareTo(_discoveryScore(left)),
        );
    final hasLiveDiscovery = _discoveryResults.isNotEmpty;
    final filteredBusinesses = hasLiveDiscovery
        ? discoveryMatches.map((result) => result.business).toList()
        : _sortBusinesses(
            businessProvider.businesses.where(
              (business) =>
                  _matchesSearch(business) &&
                  _matchesMood(business) &&
                  _matchesQuickFilters(business),
            ),
          );

    final recommendedBusinesses = filteredBusinesses.take(6).toList();
    final featuredBusinesses = filteredBusinesses
        .where((business) => business.isFeatured)
        .take(4)
        .toList();
    final showcaseBusinesses = featuredBusinesses.isEmpty
        ? filteredBusinesses.take(4).toList()
        : featuredBusinesses;
    final totalAvailableRigs = hasLiveDiscovery
        ? discoveryMatches.fold<int>(
            0,
            (sum, result) => sum + _eligibleSetups(result).length,
          )
        : filteredBusinesses.fold<int>(
            0,
            (sum, business) => sum + business.availableRigs,
          );
    final hasActiveRefinements =
        _searchQuery.trim().isNotEmpty ||
        _selectedMoodId != 'all' ||
        _squadMode ||
        _activeFilters.isNotEmpty ||
        _locationFilter.isNotEmpty ||
        _gameFilter.isNotEmpty ||
        _categoryFilter != 'all' ||
        _maxPricePerHour != null ||
        _minimumRating > 0 ||
        _openNowOnly ||
        _foodOnly ||
        _tournamentOnly ||
        _planGroupSize > 1;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(color: AppTheme.background),
            ),
          ),
          Positioned(
            top: -64,
            left: -24,
            right: -24,
            child: IgnorePointer(
              child: Container(
                height: 320,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      const Color(
                        0xFF9E84FF,
                      ).withValues(alpha: AppTheme.isDark ? 0.72 : 0.88),
                      const Color(
                        0xFF6C7BFF,
                      ).withValues(alpha: AppTheme.isDark ? 0.68 : 0.82),
                      const Color(
                        0xFFFFB3C5,
                      ).withValues(alpha: AppTheme.isDark ? 0.58 : 0.74),
                    ],
                  ),
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(56),
                    bottomRight: Radius.circular(56),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: 84,
            right: -40,
            child: IgnorePointer(
              child: Container(
                width: 150,
                height: 150,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(
                    alpha: AppTheme.isDark ? 0.08 : 0.18,
                  ),
                ),
              ),
            ),
          ),
          RefreshIndicator(
            onRefresh: _refreshMarketplace,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: const EdgeInsets.fromLTRB(
                AppSpace.md,
                AppSpace.lg,
                AppSpace.md,
                120,
              ),
              children: [
                Align(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1180),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final isWide = constraints.maxWidth >= 960;
                        final isCompactMobile = constraints.maxWidth < 430;
                        final canShowHeaderBadge = constraints.maxWidth >= 420;
                        final prioritizeFeed =
                            isCompactMobile &&
                            filteredBusinesses.isNotEmpty &&
                            !(businessProvider.errorMessage != null &&
                                businessProvider.businesses.isEmpty) &&
                            !(businessProvider.isLoading &&
                                businessProvider.businesses.isEmpty);

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppReveal(
                              child: _MarketplaceHeader(
                                title: 'Home',
                                location: _headlineLocation(selectedBusiness),
                                accentLabel: canShowHeaderBadge
                                    ? _headerAccentLabel(
                                        auth,
                                        totalAvailableRigs,
                                      )
                                    : null,
                              ),
                            ),
                            const SizedBox(height: AppSpace.md),
                            AppReveal(
                              delay: AppMotion.fast,
                              child: _SearchDock(
                                controller: _searchController,
                                searchHint: _searchHintForUser(auth),
                                searchQuery: _searchQuery,
                                squadMode: _squadMode,
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
                                onSquadModeChanged: (value) {
                                  setState(() {
                                    _squadMode = value;
                                  });
                                },
                              ),
                            ),
                            const SizedBox(height: AppSpace.sm),
                            AppReveal(
                              delay: AppMotion.fast,
                              child: Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.94),
                                  borderRadius: BorderRadius.circular(22),
                                  border: Border.all(
                                    color: const Color(0xFFECEAF5),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.auto_awesome_rounded,
                                      color: AppTheme.primaryOrange,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          const Text(
                                            'GameGuru setup planner',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          Text(
                                            _discoveryLoading
                                                ? 'Checking live cafe availability…'
                                                : '$_planGroupSize ${_planGroupSize == 1 ? 'player' : 'players'} · ${_planDurationHours}h · ${_formatHour(_planStartHour)}',
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall
                                                ?.copyWith(
                                                  color: AppTheme.secondaryText,
                                                ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    OutlinedButton.icon(
                                      onPressed: _openDiscoveryFilters,
                                      icon: const Icon(Icons.tune_rounded),
                                      label: const Text('Plan a visit'),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (_discoveryError != null) ...[
                              const SizedBox(height: AppSpace.sm),
                              Text(
                                'Live setup availability could not be refreshed. Pull down to retry. ${_discoveryError!}',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.danger),
                              ),
                            ],
                            const SizedBox(height: AppSpace.lg),
                            AppReveal(
                              delay: AppMotion.normal,
                              child: _PromoBanner(
                                headline: _promoHeadline(selectedBusiness),
                                subtitle: _promoSubtitle(
                                  selectedBusiness,
                                  businessProvider.businesses.length,
                                ),
                                accentLabel: selectedBusiness == null
                                    ? 'Gaming cafe drops'
                                    : 'Ends tonight',
                                onPressed: selectedBusiness == null
                                    ? null
                                    : () => _openCafe(selectedBusiness),
                              ),
                            ),
                            const SizedBox(height: AppSpace.md),
                            AppReveal(
                              delay: const Duration(milliseconds: 240),
                              child: _SelectedCafeStrip(
                                message: _selectedCafeBannerText(
                                  selectedBusiness,
                                ),
                                ctaLabel: selectedBusiness == null
                                    ? 'Browse all'
                                    : 'Open selected cafe',
                                onTap: selectedBusiness == null
                                    ? null
                                    : () => _openCafe(selectedBusiness),
                              ),
                            ),
                            if (!prioritizeFeed) ...[
                              const SizedBox(height: AppSpace.lg),
                              AppReveal(
                                delay: const Duration(milliseconds: 320),
                                child: _GameMoodScroller(
                                  moods: _moods,
                                  selectedMoodId: _selectedMoodId,
                                  onSelected: (id) {
                                    setState(() {
                                      _selectedMoodId = id;
                                    });
                                  },
                                ),
                              ),
                              const SizedBox(height: AppSpace.md),
                              AppReveal(
                                delay: const Duration(milliseconds: 380),
                                child: _QuickFilterRow(
                                  filters: _quickFilters,
                                  activeFilters: _activeFilters,
                                  hasActiveRefinements: hasActiveRefinements,
                                  onToggle: _toggleQuickFilter,
                                  onClearAll: _clearRefinements,
                                ),
                              ),
                              const SizedBox(height: AppSpace.xl),
                            ] else
                              const SizedBox(height: AppSpace.lg),
                            if (businessProvider.errorMessage != null &&
                                businessProvider.businesses.isEmpty)
                              EmptyGlassState(
                                title: 'Could not load cafes',
                                message: businessProvider.errorMessage!,
                                icon: Icons.store_mall_directory_outlined,
                                action: OutlinedButton.icon(
                                  onPressed: () => context
                                      .read<BusinessProvider>()
                                      .loadBusinesses(forceRefresh: true),
                                  icon: const Icon(Icons.refresh_rounded),
                                  label: const Text('Try again'),
                                ),
                              )
                            else if (businessProvider.isLoading &&
                                businessProvider.businesses.isEmpty)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 48),
                                child: Center(
                                  child: CircularProgressIndicator(),
                                ),
                              )
                            else if (filteredBusinesses.isEmpty)
                              const EmptyGlassState(
                                title: 'No cafes match this setup',
                                message:
                                    'Try a different search, switch gamer vibes, or clear the quick filters to bring more cafes back into the feed.',
                                icon: Icons.search_off_rounded,
                              )
                            else ...[
                              if (discoveryMatches.isNotEmpty) ...[
                                _SectionEyebrow(
                                  title: 'GameGuru setup picks',
                                  subtitle:
                                      'Ranked by live stations for your time, group, budget, and setup needs.',
                                ),
                                const SizedBox(height: AppSpace.md),
                                ...discoveryMatches
                                    .take(3)
                                    .map(
                                      (result) => Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: AppSpace.md,
                                        ),
                                        child: _CafeSetupRecommendationCard(
                                          result: result,
                                          setup: _eligibleSetups(result).first,
                                          matchingSetupCount: _eligibleSetups(
                                            result,
                                          ).length,
                                          reasons: _reasonsFor(result),
                                          onBook: () =>
                                              _bookRecommendedSetup(result),
                                          onOpen: () =>
                                              _openCafe(result.business),
                                          onAskGameGuru: () =>
                                              _askGameGuru(result),
                                        ),
                                      ),
                                    ),
                                const SizedBox(height: AppSpace.md),
                              ],
                              _SectionEyebrow(
                                title: 'Explore cafes',
                                subtitle:
                                    '${filteredBusinesses.length} cafes match your filters and gaming vibe',
                              ),
                              const SizedBox(height: AppSpace.md),
                              _RecommendedCafeSection(
                                businesses: recommendedBusinesses,
                                selectedBusinessId: selectedBusiness?.id,
                                isWide: isWide,
                                onOpen: _openCafe,
                                onSelect: (business) => context
                                    .read<BusinessProvider>()
                                    .selectBusiness(business),
                                dealLabelBuilder: _dealLabel,
                                ratingLabelBuilder: _compactReviewLabel,
                                metaLabelBuilder: _secondaryMeta,
                                locationLabelBuilder: _bottomStatLabel,
                              ),
                              if (prioritizeFeed) ...[
                                const SizedBox(height: AppSpace.lg),
                                AppReveal(
                                  delay: const Duration(milliseconds: 320),
                                  child: _GameMoodScroller(
                                    moods: _moods,
                                    selectedMoodId: _selectedMoodId,
                                    onSelected: (id) {
                                      setState(() {
                                        _selectedMoodId = id;
                                      });
                                    },
                                  ),
                                ),
                                const SizedBox(height: AppSpace.md),
                                AppReveal(
                                  delay: const Duration(milliseconds: 380),
                                  child: _QuickFilterRow(
                                    filters: _quickFilters,
                                    activeFilters: _activeFilters,
                                    hasActiveRefinements: hasActiveRefinements,
                                    onToggle: _toggleQuickFilter,
                                    onClearAll: _clearRefinements,
                                  ),
                                ),
                                const SizedBox(height: AppSpace.xl),
                              ] else
                                const SizedBox(height: AppSpace.xl),
                              _SectionEyebrow(
                                title: 'Explore More',
                                subtitle:
                                    'Shortcut into the parts of the feed players keep opening first',
                              ),
                              const SizedBox(height: AppSpace.md),
                              _ExploreMoreRow(
                                items: [
                                  _ExploreShortcut(
                                    title: 'Offers',
                                    subtitle: 'Featured drops',
                                    icon: Icons.sell_rounded,
                                    color: const Color(0xFF5B8CFF),
                                    onTap: () {
                                      setState(() {
                                        _selectedMoodId = 'premium';
                                        _activeFilters.add('featured');
                                      });
                                    },
                                  ),
                                  _ExploreShortcut(
                                    title: 'Tournaments',
                                    subtitle: 'Join brackets',
                                    icon: Icons.emoji_events_rounded,
                                    color: const Color(0xFFFF8A65),
                                    onTap: () {
                                      setState(() {
                                        _selectedMoodId = 'esports';
                                        _activeFilters.add('tournaments');
                                      });
                                    },
                                  ),
                                  _ExploreShortcut(
                                    title: 'Late night',
                                    subtitle: 'After-hours sessions',
                                    icon: Icons.dark_mode_rounded,
                                    color: const Color(0xFF7C5CFF),
                                    onTap: () {
                                      setState(() {
                                        _selectedMoodId = 'lateNight';
                                        _activeFilters.add('lateNight');
                                      });
                                    },
                                  ),
                                  _ExploreShortcut(
                                    title: 'Food + Play',
                                    subtitle: 'Snacks on deck',
                                    icon: Icons.fastfood_rounded,
                                    color: const Color(0xFFFFB300),
                                    onTap: () {
                                      setState(() {
                                        _selectedMoodId = 'foodPlay';
                                      });
                                    },
                                  ),
                                ],
                              ),
                              const SizedBox(height: AppSpace.xl),
                              _SectionEyebrow(
                                title: 'Featured Cafes',
                                subtitle:
                                    'Big venues, strong ratings, and the best overall browse-to-book picks',
                              ),
                              const SizedBox(height: AppSpace.md),
                              _FeaturedCafeSection(
                                businesses: showcaseBusinesses,
                                selectedBusinessId: selectedBusiness?.id,
                                isWide: isWide,
                                onOpen: _openCafe,
                                onSelect: (business) => context
                                    .read<BusinessProvider>()
                                    .selectBusiness(business),
                                dealLabelBuilder: _dealLabel,
                                ratingLabelBuilder: _compactReviewLabel,
                                reviewFootnoteBuilder: _reviewFootnote,
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String? _headerAccentLabel(AuthProvider auth, int totalAvailableRigs) {
    final gamerTag = auth.user?.gamerTag.trim() ?? '';
    if (gamerTag.isNotEmpty) {
      return gamerTag;
    }

    if (totalAvailableRigs > 0) {
      return '$totalAvailableRigs rigs live';
    }

    return null;
  }
}

class _CafeDiscoveryFilters {
  final String location;
  final String game;
  final String category;
  final double? maxPricePerHour;
  final double minRating;
  final bool openNow;
  final bool foodOnly;
  final bool tournamentsOnly;
  final DateTime date;
  final int startHour;
  final int durationHours;
  final int groupSize;

  const _CafeDiscoveryFilters({
    required this.location,
    required this.game,
    required this.category,
    required this.maxPricePerHour,
    required this.minRating,
    required this.openNow,
    required this.foodOnly,
    required this.tournamentsOnly,
    required this.date,
    required this.startHour,
    required this.durationHours,
    required this.groupSize,
  });
}

class _CafeSetupRecommendationCard extends StatelessWidget {
  final CafeDiscoveryResult result;
  final PC setup;
  final int matchingSetupCount;
  final List<String> reasons;
  final VoidCallback onBook;
  final VoidCallback onOpen;
  final VoidCallback onAskGameGuru;

  const _CafeSetupRecommendationCard({
    required this.result,
    required this.setup,
    required this.matchingSetupCount,
    required this.reasons,
    required this.onBook,
    required this.onOpen,
    required this.onAskGameGuru,
  });

  String get _sessionTime {
    final hour = result.startHour % 24;
    final displayHour = hour % 12 == 0 ? 12 : hour % 12;
    final period = hour >= 12 ? 'PM' : 'AM';
    final endHour = (hour + result.durationHours) % 24;
    final displayEnd = endHour % 12 == 0 ? 12 : endHour % 12;
    final endPeriod = endHour >= 12 ? 'PM' : 'AM';
    return '$displayHour $period–$displayEnd $endPeriod';
  }

  String get _sessionDate {
    final parsed = DateTime.tryParse(result.availabilityDate);
    if (parsed == null) return result.availabilityDate;
    return '${parsed.day}/${parsed.month}/${parsed.year}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: AppTheme.primaryTurquoise.withValues(alpha: 0.28),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF172033).withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppTheme.primaryTurquoise.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.sports_esports_rounded,
                  color: AppTheme.primaryTurquoise,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.business.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      result.business.shortLocation,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              if (result.business.hasReviews)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.star_rounded,
                      size: 18,
                      color: Color(0xFFFFB020),
                    ),
                    const SizedBox(width: 3),
                    Text(
                      result.business.averageRating.toStringAsFixed(1),
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _SoftPill(
                label:
                    '$matchingSetupCount matching setups free for this window',
                color: AppTheme.success,
              ),
              _SoftPill(
                label:
                    '$_sessionDate · $_sessionTime · ${result.durationHours}h',
                color: AppTheme.primaryTurquoise,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            setup.specs,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${setup.categoryLabel} · Rs ${setup.price.toStringAsFixed(0)}/hour',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.secondaryText,
            ),
          ),
          if (reasons.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...reasons.map(
              (reason) => Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.check_circle_outline_rounded,
                      size: 17,
                      color: AppTheme.primaryTurquoise,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(reason, style: theme.textTheme.bodySmall),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: onBook,
                icon: const Icon(Icons.event_available_rounded),
                label: const Text('Book setup'),
              ),
              OutlinedButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.storefront_outlined),
                label: const Text('View cafe'),
              ),
              TextButton.icon(
                onPressed: onAskGameGuru,
                icon: const Icon(Icons.auto_awesome_rounded),
                label: const Text('Ask GameGuru'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MarketplaceHeader extends StatelessWidget {
  final String title;
  final String location;
  final String? accentLabel;

  const _MarketplaceHeader({
    required this.title,
    required this.location,
    this.accentLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: AppSpace.xs2),
              Text(
                location,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white.withValues(alpha: 0.88),
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
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
              border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
            ),
            child: Text(
              accentLabel!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _SearchDock extends StatelessWidget {
  final TextEditingController controller;
  final String searchHint;
  final String searchQuery;
  final bool squadMode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final ValueChanged<bool> onSquadModeChanged;

  const _SearchDock({
    required this.controller,
    required this.searchHint,
    required this.searchQuery,
    required this.squadMode,
    required this.onChanged,
    required this.onClear,
    required this.onSquadModeChanged,
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
                          Icons.mic_none_rounded,
                          key: ValueKey('mic'),
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
        _SquadModeToggle(enabled: squadMode, onChanged: onSquadModeChanged),
      ],
    );
  }
}

class _SquadModeToggle extends StatelessWidget {
  final bool enabled;
  final ValueChanged<bool> onChanged;

  const _SquadModeToggle({required this.enabled, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 94,
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
            'SQUAD',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFF191D33),
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          Text(
            'MODE',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFF191D33),
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: AppSpace.xs),
          Transform.scale(
            scale: 0.84,
            child: Switch(
              value: enabled,
              onChanged: onChanged,
              activeThumbColor: Colors.white,
              activeTrackColor: AppTheme.primaryTurquoise,
              inactiveTrackColor: const Color(0xFFD7DAE6),
              inactiveThumbColor: Colors.white,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ),
        ],
      ),
    );
  }
}

class _PromoBanner extends StatelessWidget {
  final String headline;
  final String subtitle;
  final String accentLabel;
  final VoidCallback? onPressed;

  const _PromoBanner({
    required this.headline,
    required this.subtitle,
    required this.accentLabel,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isCompact = constraints.maxWidth < 380;
        final illustration = SizedBox(
          width: isCompact ? 108 : 138,
          height: isCompact ? 108 : 138,
          child: const FittedBox(
            fit: BoxFit.contain,
            alignment: Alignment.bottomRight,
            child: _PromoArcadeIllustration(),
          ),
        );

        final headerCard = Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: AppSpace.sm,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF1B2144).withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
          ),
          child: isCompact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headline,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: const Color(0xFFDCFF74),
                        fontWeight: FontWeight.w900,
                        fontStyle: FontStyle.italic,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: AppSpace.xs),
                    Text(
                      accentLabel,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFFDCFF74),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        headline,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: const Color(0xFFDCFF74),
                          fontWeight: FontWeight.w900,
                          fontStyle: FontStyle.italic,
                          height: 1,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Flexible(
                      child: Text(
                        accentLabel,
                        textAlign: TextAlign.right,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFFDCFF74),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
        );

        final bodyContent = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                height: 1.45,
              ),
              maxLines: isCompact ? 5 : 4,
              overflow: TextOverflow.ellipsis,
            ),
            if (onPressed != null) ...[
              const SizedBox(height: AppSpace.md),
              FilledButton.icon(
                onPressed: onPressed,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF252945),
                ),
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Explore cafe'),
              ),
            ],
          ],
        );

        return AppInteractiveSurface(
          onTap: onPressed,
          borderRadius: const BorderRadius.all(Radius.circular(30)),
          child: Container(
            constraints: BoxConstraints(minHeight: isCompact ? 246 : 214),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(30),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF4859F6),
                  Color(0xFF6956FF),
                  Color(0xFFB277FF),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6A5BFF).withValues(alpha: 0.18),
                  blurRadius: 28,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                headerCard,
                const SizedBox(height: AppSpace.md),
                if (isCompact) ...[
                  bodyContent,
                  const SizedBox(height: AppSpace.sm),
                  Align(alignment: Alignment.centerRight, child: illustration),
                ] else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(child: bodyContent),
                      const SizedBox(width: AppSpace.md),
                      illustration,
                    ],
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _PromoArcadeIllustration extends StatelessWidget {
  const _PromoArcadeIllustration();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 138,
      height: 138,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: 22,
            left: 24,
            child: Transform.rotate(
              angle: -0.12,
              child: Container(
                width: 96,
                height: 78,
                decoration: BoxDecoration(
                  color: const Color(0xFF1D2143),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: const Color(0xFF83E2FF).withValues(alpha: 0.64),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF101431).withValues(alpha: 0.34),
                      blurRadius: 12,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.sports_esports_rounded,
                    color: Color(0xFFDCFF74),
                    size: 42,
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 14,
            top: 0,
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
              ),
              child: const Icon(
                Icons.stars_rounded,
                color: Colors.white,
                size: 15,
              ),
            ),
          ),
          Positioned(
            left: 0,
            bottom: 22,
            child: Transform.rotate(
              angle: math.pi / 5.5,
              child: Container(
                width: 74,
                height: 74,
                decoration: BoxDecoration(
                  color: const Color(0xFFFF95C8),
                  borderRadius: BorderRadius.circular(38),
                ),
                child: const Icon(
                  Icons.ads_click_rounded,
                  color: Color(0xFF252945),
                  size: 34,
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: const Color(0xFF2A2F5A),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
              ),
              child: const Icon(
                Icons.emoji_events_rounded,
                color: Color(0xFF8DE2FF),
                size: 34,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectedCafeStrip extends StatelessWidget {
  final String message;
  final String ctaLabel;
  final VoidCallback? onTap;

  const _SelectedCafeStrip({
    required this.message,
    required this.ctaLabel,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final background = AppTheme.isDark
        ? const Color(0xFF3B3324)
        : const Color(0xFFFFF4DD);
    final border = AppTheme.isDark
        ? const Color(0xFF5A4F35)
        : const Color(0xFFF5E5BF);
    final textColor = AppTheme.isDark
        ? const Color(0xFFFFF2CD)
        : const Color(0xFF4B3E1D);

    return LayoutBuilder(
      builder: (context, constraints) {
        final shouldStackCta = onTap != null && constraints.maxWidth < 430;

        final icon = Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFFFFD36B),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFF7C94D).withValues(alpha: 0.24),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(
            Icons.workspace_premium_rounded,
            color: Colors.black,
          ),
        );

        final cta = onTap == null
            ? null
            : TextButton(
                onPressed: onTap,
                child: Text(
                  ctaLabel,
                  style: TextStyle(
                    color: textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              );

        return Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: border),
          ),
          child: shouldStackCta
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        icon,
                        const SizedBox(width: AppSpace.md),
                        Expanded(
                          child: Text(
                            message,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: textColor,
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ),
                      ],
                    ),
                    if (cta != null) ...[
                      const SizedBox(height: AppSpace.xs),
                      Align(alignment: Alignment.centerRight, child: cta),
                    ],
                  ],
                )
              : Row(
                  children: [
                    icon,
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Text(
                        message,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: textColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (cta != null) ...[
                      const SizedBox(width: AppSpace.sm),
                      cta,
                    ],
                  ],
                ),
        );
      },
    );
  }
}

class _GameMoodScroller extends StatelessWidget {
  final List<_GameMood> moods;
  final String selectedMoodId;
  final ValueChanged<String> onSelected;

  const _GameMoodScroller({
    required this.moods,
    required this.selectedMoodId,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: moods.length,
        separatorBuilder: (context, index) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final mood = moods[index];
          final isSelected = mood.id == selectedMoodId;
          return _GameMoodPill(
            mood: mood,
            selected: isSelected,
            onTap: () => onSelected(mood.id),
          );
        },
      ),
    );
  }
}

class _GameMoodPill extends StatelessWidget {
  final _GameMood mood;
  final bool selected;
  final VoidCallback onTap;

  const _GameMoodPill({
    required this.mood,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(24)),
      child: SizedBox(
        width: 88,
        child: Column(
          children: [
            AnimatedContainer(
              duration: AppMotion.normal,
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    mood.tint.withValues(alpha: selected ? 0.34 : 0.16),
                    Colors.white.withValues(alpha: selected ? 0.96 : 0.92),
                  ],
                ),
                border: Border.all(
                  color: selected
                      ? mood.tint
                      : mood.tint.withValues(alpha: 0.16),
                  width: selected ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: mood.tint.withValues(alpha: selected ? 0.16 : 0.06),
                    blurRadius: 18,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Icon(mood.icon, color: mood.tint, size: 30),
            ),
            const SizedBox(height: 6),
            Text(
              mood.label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: AppTheme.primaryText,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            AnimatedContainer(
              duration: AppMotion.normal,
              width: selected ? 46 : 24,
              height: 4,
              decoration: BoxDecoration(
                color: selected ? AppTheme.primaryOrange : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickFilterRow extends StatelessWidget {
  final List<_QuickFilterData> filters;
  final Set<String> activeFilters;
  final bool hasActiveRefinements;
  final ValueChanged<String> onToggle;
  final VoidCallback onClearAll;

  const _QuickFilterRow({
    required this.filters,
    required this.activeFilters,
    required this.hasActiveRefinements,
    required this.onToggle,
    required this.onClearAll,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          ...filters.map((filter) {
            final selected = activeFilters.contains(filter.id);
            return Padding(
              padding: const EdgeInsets.only(right: AppSpace.sm),
              child: FilterChip(
                selected: selected,
                showCheckmark: false,
                onSelected: (_) => onToggle(filter.id),
                avatar: Icon(
                  filter.icon,
                  size: 18,
                  color: selected
                      ? Colors.white
                      : Theme.of(context).colorScheme.onSurface,
                ),
                label: Text(filter.label),
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
          if (hasActiveRefinements)
            TextButton(onPressed: onClearAll, child: const Text('Clear all')),
        ],
      ),
    );
  }
}

class _SectionEyebrow extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SectionEyebrow({required this.title, required this.subtitle});

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

class _RecommendedCafeSection extends StatelessWidget {
  final List<Business> businesses;
  final int? selectedBusinessId;
  final bool isWide;
  final ValueChanged<Business> onOpen;
  final ValueChanged<Business> onSelect;
  final String Function(Business business) dealLabelBuilder;
  final String Function(Business business) ratingLabelBuilder;
  final String Function(Business business) metaLabelBuilder;
  final String Function(Business business) locationLabelBuilder;

  const _RecommendedCafeSection({
    required this.businesses,
    required this.selectedBusinessId,
    required this.isWide,
    required this.onOpen,
    required this.onSelect,
    required this.dealLabelBuilder,
    required this.ratingLabelBuilder,
    required this.metaLabelBuilder,
    required this.locationLabelBuilder,
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
            children: businesses.map((business) {
              return SizedBox(
                width: width,
                child: _RecommendedCafeCard(
                  business: business,
                  isSelected: selectedBusinessId == business.id,
                  onOpen: () => onOpen(business),
                  onSelect: () => onSelect(business),
                  dealLabel: dealLabelBuilder(business),
                  ratingLabel: ratingLabelBuilder(business),
                  metaLabel: metaLabelBuilder(business),
                  locationLabel: locationLabelBuilder(business),
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
        itemCount: businesses.length,
        separatorBuilder: (context, index) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final business = businesses[index];
          return SizedBox(
            width: 254,
            child: _RecommendedCafeCard(
              business: business,
              isSelected: selectedBusinessId == business.id,
              onOpen: () => onOpen(business),
              onSelect: () => onSelect(business),
              dealLabel: dealLabelBuilder(business),
              ratingLabel: ratingLabelBuilder(business),
              metaLabel: metaLabelBuilder(business),
              locationLabel: locationLabelBuilder(business),
            ),
          );
        },
      ),
    );
  }
}

class _RecommendedCafeCard extends StatelessWidget {
  final Business business;
  final bool isSelected;
  final VoidCallback onOpen;
  final VoidCallback onSelect;
  final String dealLabel;
  final String ratingLabel;
  final String metaLabel;
  final String locationLabel;

  const _RecommendedCafeCard({
    required this.business,
    required this.isSelected,
    required this.onOpen,
    required this.onSelect,
    required this.dealLabel,
    required this.ratingLabel,
    required this.metaLabel,
    required this.locationLabel,
  });

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onOpen,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: isSelected
                ? AppTheme.primaryOrange.withValues(alpha: 0.4)
                : const Color(0xFFF0F1F6),
          ),
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
                      source: business.coverOrLogoImage,
                      fallback: _CafeArtFallback(
                        business: business,
                        compact: true,
                      ),
                    ),
                    Positioned(
                      top: AppSpace.sm,
                      left: AppSpace.sm,
                      child: _DealTag(label: dealLabel),
                    ),
                    Positioned(
                      top: AppSpace.sm,
                      right: AppSpace.sm,
                      child: _BookmarkButton(
                        selected: isSelected,
                        onPressed: onSelect,
                      ),
                    ),
                    Positioned(
                      left: AppSpace.sm,
                      bottom: AppSpace.sm,
                      child: _RatingBadge(label: ratingLabel),
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
                    business.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF1B1E2E),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpace.xs2),
                  Text(
                    business.tagline.trim().isEmpty
                        ? business.summaryDescription
                        : business.tagline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF74798D),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Text(
                    metaLabel,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF00A86B),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpace.xs2),
                  Text(
                    locationLabel,
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

class _ExploreMoreRow extends StatelessWidget {
  final List<_ExploreShortcut> items;

  const _ExploreMoreRow({required this.items});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 182,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: items.length,
        separatorBuilder: (context, index) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final item = items[index];
          return _ExploreShortcutTile(item: item);
        },
      ),
    );
  }
}

class _ExploreShortcutTile extends StatelessWidget {
  final _ExploreShortcut item;

  const _ExploreShortcutTile({required this.item});

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: item.onTap,
      child: Container(
        width: 142,
        padding: const EdgeInsets.all(AppSpace.md),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: const Color(0xFFEEF0F6)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF101828).withValues(alpha: 0.05),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(item.icon, color: item.color, size: 28),
            ),
            const Spacer(),
            Text(
              item.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: const Color(0xFF202434),
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: AppSpace.xs2),
            Text(
              item.subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: const Color(0xFF7B8096),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeaturedCafeSection extends StatelessWidget {
  final List<Business> businesses;
  final int? selectedBusinessId;
  final bool isWide;
  final ValueChanged<Business> onOpen;
  final ValueChanged<Business> onSelect;
  final String Function(Business business) dealLabelBuilder;
  final String Function(Business business) ratingLabelBuilder;
  final String Function(Business business) reviewFootnoteBuilder;

  const _FeaturedCafeSection({
    required this.businesses,
    required this.selectedBusinessId,
    required this.isWide,
    required this.onOpen,
    required this.onSelect,
    required this.dealLabelBuilder,
    required this.ratingLabelBuilder,
    required this.reviewFootnoteBuilder,
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
            children: businesses.map((business) {
              return SizedBox(
                width: width,
                child: _FeaturedCafeCard(
                  business: business,
                  isSelected: selectedBusinessId == business.id,
                  onOpen: () => onOpen(business),
                  onSelect: () => onSelect(business),
                  dealLabel: dealLabelBuilder(business),
                  ratingLabel: ratingLabelBuilder(business),
                  reviewFootnote: reviewFootnoteBuilder(business),
                ),
              );
            }).toList(),
          );
        },
      );
    }

    return Column(
      children: businesses.map((business) {
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.md),
          child: _FeaturedCafeCard(
            business: business,
            isSelected: selectedBusinessId == business.id,
            onOpen: () => onOpen(business),
            onSelect: () => onSelect(business),
            dealLabel: dealLabelBuilder(business),
            ratingLabel: ratingLabelBuilder(business),
            reviewFootnote: reviewFootnoteBuilder(business),
          ),
        );
      }).toList(),
    );
  }
}

class _FeaturedCafeCard extends StatelessWidget {
  final Business business;
  final bool isSelected;
  final VoidCallback onOpen;
  final VoidCallback onSelect;
  final String dealLabel;
  final String ratingLabel;
  final String reviewFootnote;

  const _FeaturedCafeCard({
    required this.business,
    required this.isSelected,
    required this.onOpen,
    required this.onSelect,
    required this.dealLabel,
    required this.ratingLabel,
    required this.reviewFootnote,
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
          border: Border.all(
            color: isSelected
                ? AppTheme.primaryTurquoise.withValues(alpha: 0.42)
                : const Color(0xFFEDEFF6),
          ),
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
                height: 254,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AppSmartImage(
                      source: business.coverOrLogoImage,
                      fallback: _CafeArtFallback(
                        business: business,
                        compact: false,
                      ),
                    ),
                    Positioned(
                      top: AppSpace.md,
                      left: AppSpace.md,
                      child: _DealTag(label: dealLabel),
                    ),
                    Positioned(
                      top: AppSpace.md,
                      right: AppSpace.md,
                      child: _BookmarkButton(
                        selected: isSelected,
                        onPressed: onSelect,
                      ),
                    ),
                    Positioned(
                      right: AppSpace.md,
                      bottom: AppSpace.md,
                      child: Row(
                        children: List.generate(
                          6,
                          (index) => Container(
                            margin: const EdgeInsets.only(left: 5),
                            width: index == 0 ? 22 : 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(
                                alpha: index == 0 ? 0.92 : 0.5,
                              ),
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
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
                        child: Text(
                          business.name,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(
                                color: const Color(0xFF171A2B),
                                fontWeight: FontWeight.w900,
                              ),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _RatingBadge(label: ratingLabel, large: true),
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            reviewFootnote,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: const Color(0xFF8A8FA1),
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Text(
                    business.tagline.trim().isEmpty
                        ? business.summaryDescription
                        : business.tagline,
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
                      _MetaLine(
                        icon: Icons.flash_on_rounded,
                        label: '${business.availableRigs} rigs open',
                        color: const Color(0xFF00A86B),
                      ),
                      _MetaLine(
                        icon: Icons.location_on_outlined,
                        label: business.shortLocation,
                        color: const Color(0xFF00A86B),
                      ),
                      _MetaLine(
                        icon: Icons.fastfood_rounded,
                        label: business.menuItemCount > 0
                            ? '${business.menuItemCount} snack picks'
                            : 'Food counter soon',
                        color: const Color(0xFF00A86B),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.md),
                  Text(
                    business.scheduleLabel,
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
                      _SoftPill(
                        label: business.isFeatured
                            ? 'Featured arena'
                            : 'Local pick',
                        color: AppTheme.primaryOrange,
                      ),
                      _SoftPill(
                        label: business.publishedTournamentCount > 0
                            ? '${business.publishedTournamentCount} live events'
                            : 'Community nights',
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

class _CafeArtFallback extends StatelessWidget {
  final Business business;
  final bool compact;

  const _CafeArtFallback({required this.business, required this.compact});

  @override
  Widget build(BuildContext context) {
    final highlight = business.isFeatured
        ? const Color(0xFFFF6F91)
        : const Color(0xFF6D6EFF);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            highlight.withValues(alpha: 0.92),
            const Color(0xFF2D356B),
            const Color(0xFF151A33),
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: compact ? 18 : 24,
            right: compact ? 18 : 28,
            child: Container(
              width: compact ? 72 : 94,
              height: compact ? 72 : 94,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          ),
          Positioned(
            left: compact ? 18 : 24,
            right: compact ? 18 : 24,
            bottom: compact ? 18 : 24,
            child: Row(
              children: [
                Container(
                  width: compact ? 48 : 64,
                  height: compact ? 48 : 64,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(compact ? 18 : 22),
                  ),
                  child: Icon(
                    Icons.sports_esports_rounded,
                    color: Colors.white,
                    size: compact ? 24 : 30,
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        business.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: AppSpace.xs2),
                      Text(
                        business.shortLocation,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white.withValues(alpha: 0.84),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DealTag extends StatelessWidget {
  final String label;

  const _DealTag({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF202437).withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(12),
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

class _BookmarkButton extends StatelessWidget {
  final bool selected;
  final VoidCallback onPressed;

  const _BookmarkButton({required this.selected, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.96),
          ),
          child: Icon(
            selected ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
            color: selected ? AppTheme.primaryOrange : const Color(0xFF51556A),
          ),
        ),
      ),
    );
  }
}

class _RatingBadge extends StatelessWidget {
  final String label;
  final bool large;

  const _RatingBadge({required this.label, this.large = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 14 : 12,
        vertical: large ? 10 : 6,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF0AA05E),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.star_rounded, size: large ? 18 : 16, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _MetaLine({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppSpace.xs2),
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _SoftPill extends StatelessWidget {
  final String label;
  final Color color;

  const _SoftPill({required this.label, required this.color});

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

class _GameMood {
  final String id;
  final String label;
  final String caption;
  final IconData icon;
  final Color tint;

  const _GameMood({
    required this.id,
    required this.label,
    required this.caption,
    required this.icon,
    required this.tint,
  });
}

class _QuickFilterData {
  final String id;
  final String label;
  final IconData icon;

  const _QuickFilterData({
    required this.id,
    required this.label,
    required this.icon,
  });
}

class _ExploreShortcut {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ExploreShortcut({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });
}
