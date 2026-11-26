import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../constants/station_categories.dart';
import '../../models/business.dart';
import '../../models/business_review.dart';
import '../../models/menu.dart';
import '../../models/pc.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../services/business_service.dart';
import '../../services/order_service.dart';
import '../../services/pc_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../booking/booking_screen.dart';
import '../food/food_screen.dart';
import '../support/support_center_screen.dart';
import '../tournaments/tournament_screen.dart';
import 'pc_list_screen.dart';

class CafeDetailScreen extends StatefulWidget {
  final Business initialBusiness;

  const CafeDetailScreen({super.key, required this.initialBusiness});

  @override
  State<CafeDetailScreen> createState() => _CafeDetailScreenState();
}

class _CafeDetailScreenState extends State<CafeDetailScreen> {
  static const String _rigFilterAll = 'all';
  static const String _rigFilterAvailable = 'available';

  final BusinessService _businessService = BusinessService();
  final PcService _pcService = PcService();
  final OrderService _orderService = OrderService();
  final TextEditingController _searchController = TextEditingController();

  late Business _business;
  List<PC> _pcs = const [];
  List<MenuItemModel> _menu = const [];
  List<BusinessReview> _reviews = const [];
  BusinessReviewState? _reviewState;
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';
  String _selectedRigFilter = _rigFilterAll;

  @override
  void initState() {
    super.initState();
    _business = widget.initialBusiness;
    Future.microtask(_loadSnapshot);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadSnapshot() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final authToken = context.read<AuthProvider>().token;
      final detailJson = await _businessService.fetchBusinessDetails(
        _business.slug.isNotEmpty ? _business.slug : '${_business.id}',
      );
      final businessBase = Business.fromJson(detailJson);
      final businessLookup = businessBase.slug.isNotEmpty
          ? businessBase.slug
          : '${businessBase.id}';
      final snapshotParts = await Future.wait<dynamic>([
        _pcService.fetchPCs(businessId: businessBase.id),
        _orderService.fetchMenu(businessId: businessBase.id),
        _businessService.fetchBusinessReviews(businessLookup),
        _loadReviewState(authToken, businessBase.id),
      ]);
      final reviewFeed = snapshotParts[2] as BusinessReviewFeed;
      final business = businessBase.copyWith(
        averageRating: reviewFeed.averageRating,
        reviewCount: reviewFeed.reviewCount,
      );
      final pcsJson = snapshotParts[0] as List;
      final menuJson = snapshotParts[1] as List;
      final reviewState = snapshotParts[3] as BusinessReviewState?;
      final pcs = pcsJson
          .map((item) => PC.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
      final menu = menuJson
          .map(
            (item) =>
                MenuItemModel.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();

      if (!mounted) {
        return;
      }

      setState(() {
        _business = business;
        _pcs = pcs;
        _menu = menu;
        _reviews = reviewFeed.reviews;
        _reviewState = reviewState;
        _isLoading = false;
      });

      await context.read<BusinessProvider>().hydrateSelection(business);
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<BusinessReviewState?> _loadReviewState(
    String? token,
    int businessId,
  ) async {
    final normalizedToken = token?.trim() ?? '';
    if (normalizedToken.isEmpty || businessId <= 0) {
      return null;
    }

    try {
      return await _businessService.fetchReviewState(
        token: normalizedToken,
        businessId: businessId,
      );
    } catch (_) {
      return null;
    }
  }

  List<MenuItemModel> get _previewMenu {
    final available = _menu.where((item) => item.isAvailable).toList();
    final featured = available.where((item) => item.isFeatured).toList();
    return (featured.isNotEmpty ? featured : available).take(3).toList();
  }

  List<PC> get _visiblePcs {
    final rigs = _pcs.where((pc) {
      return _matchesSearch(pc) && _matchesRigFilter(pc);
    }).toList();
    rigs.sort((left, right) => _rigScore(right).compareTo(_rigScore(left)));
    return rigs;
  }

  int _rigScore(PC pc) {
    var score = 0;
    if (pc.isAvailable) {
      score += 120;
    }
    if (pc.category == stationCategoryHighEndPc) {
      score += 70;
    }
    if (pc.category == stationCategoryConsole) {
      score += 48;
    }
    if (pc.remainingMinutes != null && pc.remainingMinutes! > 0) {
      score += 20;
    }
    score += (pc.price * 10).round();
    return score;
  }

  bool _matchesSearch(PC pc) {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return true;
    }

    return <String>[
      pc.stationTitle,
      pc.categoryLabel,
      pc.deviceLabel,
      pc.specs,
      pc.availabilityLabel,
    ].any((value) => value.toLowerCase().contains(query));
  }

  bool _matchesRigFilter(PC pc) {
    switch (_selectedRigFilter) {
      case _rigFilterAvailable:
        return pc.isAvailable;
      case stationCategoryHighEndPc:
      case stationCategoryEsportsPc:
      case stationCategoryConsole:
        return pc.matchesCategory(_selectedRigFilter);
      case _rigFilterAll:
      default:
        return true;
    }
  }

  double get _startingRigRate {
    if (_pcs.isEmpty) {
      return 0;
    }

    double? minimum;
    for (final pc in _pcs) {
      if (minimum == null || pc.price < minimum) {
        minimum = pc.price;
      }
    }
    return minimum ?? 0;
  }

  int get _availableRigCount => _pcs.where((pc) => pc.isAvailable).length;

  int get _featuredSignals {
    var total = 0;
    if (_business.menuItemCount > 0) {
      total += 1;
    }
    if (_business.publishedTournamentCount > 0) {
      total += 1;
    }
    if (_business.isFeatured) {
      total += 1;
    }
    return total;
  }

  Future<void> _openRigBooking(PC pc) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookingScreen(pc: pc, businessName: _business.name),
      ),
    );

    if (!mounted) {
      return;
    }

    await _loadSnapshot();
  }

  Future<void> _openRigDirectory() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PcListScreen(
          businessId: _business.id,
          businessName: _business.name,
          businessTagline: _business.tagline,
        ),
      ),
    );

    if (mounted) {
      await _loadSnapshot();
    }
  }

  Future<void> _openMenu() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FoodScreen(
          businessId: _business.id,
          businessName: _business.name,
          businessTagline: _business.tagline,
        ),
      ),
    );
  }

  Future<void> _openTournaments() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TournamentScreen(
          initialBusinessId: _business.id,
          initialBusinessName: _business.name,
        ),
      ),
    );
  }

  Future<void> _openReviewComposer() async {
    final auth = context.read<AuthProvider>();
    final token = auth.token?.trim() ?? '';

    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please log in again to leave a review.')),
      );
      return;
    }

    if (_reviewState != null && !_reviewState!.canReview) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_reviewState!.gateMessage)));
      return;
    }

    final draft = await showModalBottomSheet<_ReviewDraft>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _ReviewComposerSheet(
        businessName: _business.name,
        existingReview: _reviewState?.review,
      ),
    );

    if (!mounted || draft == null) {
      return;
    }

    try {
      await _businessService.submitBusinessReview(
        token: token,
        businessId: _business.id,
        rating: draft.rating,
        title: draft.title,
        reviewText: draft.reviewText,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _reviewState?.hasExistingReview == true
                ? 'Review updated for ${_business.name}.'
                : 'Review published for ${_business.name}.',
          ),
        ),
      );

      await _loadSnapshot();
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _openCafeSupport() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => SupportCenterScreen(
          businessId: _business.id,
          businessName: _business.name,
        ),
      ),
    );
  }

  Future<void> _openDirections() async {
    final destination = _business.hasCoordinates
        ? '${_business.latitude},${_business.longitude}'
        : _business.fullAddress;
    if (destination == 'Address coming soon') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Directions are unavailable until the cafe address is updated.',
          ),
        ),
      );
      return;
    }
    final uri = Uri.https('www.google.com', '/maps/dir/', {
      'api': '1',
      'destination': destination,
    });
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open directions on this device.'),
        ),
      );
    }
  }

  Future<void> _callCafe() async {
    final phone = _business.phone.trim();
    if (phone.isEmpty) return;
    final dialable = phone.replaceAll(RegExp(r'[^+\d]'), '');
    final launched = await launchUrl(Uri(scheme: 'tel', path: dialable));
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not start a call on this device.')),
      );
    }
  }

  Future<void> _emailCafe() async {
    final email = _business.contactEmail.trim();
    if (email.isEmpty) return;
    final launched = await launchUrl(Uri(scheme: 'mailto', path: email));
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open an email app on this device.'),
        ),
      );
    }
  }

  Future<void> _showMoreActions() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.md,
            AppSpace.md,
            AppSpace.md,
            AppSpace.lg,
          ),
          child: GlassPanel(
            padding: const EdgeInsets.all(AppSpace.lg),
            borderRadius: const BorderRadius.all(Radius.circular(28)),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _business.name,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: AppSpace.xs),
                Text(
                  'Quick actions for bookings, food, and player feedback.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: [
                    FilledButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        _openRigDirectory();
                      },
                      icon: const Icon(Icons.computer_rounded),
                      label: const Text('All rigs'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        _openMenu();
                      },
                      icon: const Icon(Icons.restaurant_menu_rounded),
                      label: const Text('Food counter'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        _openTournaments();
                      },
                      icon: const Icon(Icons.emoji_events_rounded),
                      label: const Text('Events'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        _openReviewComposer();
                      },
                      icon: const Icon(Icons.rate_review_rounded),
                      label: const Text('Review'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _showRigDetails(BuildContext context, PC pc) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) {
        final specTokens = _rigSpecTokens(pc.specs);
        final remainingMinutes = pc.remainingMinutes;
        final availabilityCaption =
            remainingMinutes != null && remainingMinutes > 0 && !pc.isAvailable
            ? 'Expected to free up in about $remainingMinutes mins.'
            : pc.isAvailable
            ? 'Ready for booking right now.'
            : 'Book ahead and lock the next open session window.';

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.md,
              AppSpace.md,
              AppSpace.md,
              AppSpace.lg,
            ),
            child: _CafeSurfaceCard(
              padding: const EdgeInsets.all(AppSpace.lg),
              radius: 30,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _RigStatusBadge(pc: pc),
                      const Spacer(),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  Text(
                    pc.stationTitle,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Text(
                    availabilityCaption,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                  const SizedBox(height: AppSpace.lg),
                  Wrap(
                    spacing: AppSpace.sm,
                    runSpacing: AppSpace.sm,
                    children: [
                      StatChip(
                        label: 'Hourly rate',
                        value: '${formatCurrency(pc.price)}/hr',
                        accent: AppTheme.primaryOrange,
                        icon: Icons.currency_rupee_rounded,
                      ),
                      StatChip(
                        label: 'Category',
                        value: pc.categoryLabel,
                        accent: _accentForCategory(pc.category),
                        icon: _iconForCategory(pc.category),
                      ),
                      StatChip(
                        label: 'Status',
                        value: pc.availabilityLabel,
                        accent: _statusColorForPc(pc),
                        icon: Icons.circle_notifications_rounded,
                      ),
                    ],
                  ),
                  if (specTokens.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.lg),
                    Text(
                      'Specs',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpace.sm),
                    Wrap(
                      spacing: AppSpace.sm,
                      runSpacing: AppSpace.sm,
                      children: specTokens
                          .map(
                            (token) => _CafeMetaPill(
                              label: token,
                              icon: Icons.memory_rounded,
                              color: AppTheme.primaryTurquoise,
                            ),
                          )
                          .toList(),
                    ),
                  ],
                  const SizedBox(height: AppSpace.lg),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => Navigator.pop(sheetContext),
                          icon: const Icon(Icons.arrow_back_rounded),
                          label: const Text('Back'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: pc.canReserve
                              ? () {
                                  Navigator.pop(sheetContext);
                                  _openRigBooking(pc);
                                }
                              : null,
                          icon: const Icon(Icons.add_rounded),
                          label: Text(
                            pc.canReserve ? 'Book this setup' : 'Unavailable',
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final visiblePcs = _visiblePcs;
    final previewMenu = _previewMenu;
    final latestReviews = _reviews.take(2).toList();
    final isInitialLoading = _isLoading && _pcs.isEmpty;
    final showInitialError =
        !_isLoading && _errorMessage != null && _pcs.isEmpty;

    final loadedChildren = <Widget>[
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.lg,
          AppSpace.md,
          0,
        ),
        child: _CafeSummaryCard(
          business: _business,
          availableRigCount: _availableRigCount,
          startingRate: _startingRigRate,
          onOpenMenu: _openMenu,
          onOpenEvents: _openTournaments,
          onBrowseRigs: _openRigDirectory,
          onContactSupport: _openCafeSupport,
          onDirections: _openDirections,
          onCallCafe: _business.phone.trim().isEmpty ? null : _callCafe,
          onEmailCafe: _business.contactEmail.trim().isEmpty
              ? null
              : _emailCafe,
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
          0,
        ),
        child: _CafeProfileDetailsCard(business: _business, pcs: _pcs),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
          0,
        ),
        child: _CafeOfferStrip(
          availableCount: _availableRigCount,
          startingRate: _startingRigRate,
          perkCount: _featuredSignals,
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
          0,
        ),
        child: _RigFilterBar(
          selectedFilter: _selectedRigFilter,
          onSelected: (value) {
            setState(() {
              _selectedRigFilter = value;
            });
          },
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.xl,
          AppSpace.md,
          0,
        ),
        child: _CafeSectionHeader(
          title: 'Recommended for you',
          subtitle:
              '${visiblePcs.length} setups match this gaming cafe right now',
          trailing: _isLoading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : null,
        ),
      ),
    ];

    if (visiblePcs.isEmpty) {
      loadedChildren.add(
        Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: EmptyGlassState(
            title: 'No setups match this filter',
            message:
                'Try a different search or switch the booking filters to see more rigs.',
            icon: Icons.search_off_rounded,
            action: TextButton(
              onPressed: () {
                _searchController.clear();
                setState(() {
                  _searchQuery = '';
                  _selectedRigFilter = _rigFilterAll;
                });
              },
              child: const Text('Clear filters'),
            ),
          ),
        ),
      );
    } else {
      loadedChildren.addAll(
        visiblePcs.map(
          (pc) => Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.md,
              AppSpace.lg,
              AppSpace.md,
              0,
            ),
            child: _RigBookingCard(
              pc: pc,
              onBook: () => _openRigBooking(pc),
              onViewDetails: () => _showRigDetails(context, pc),
            ),
          ),
        ),
      );
    }

    loadedChildren.addAll([
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.xl,
          AppSpace.md,
          0,
        ),
        child: const _CafeSectionHeader(
          title: 'Explore more',
          subtitle:
              'Keep the rest of the cafe details one tap away while the booking list stays front and center.',
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
          0,
        ),
        child: _CafeExploreRow(
          tiles: [
            _CafeExploreTileData(
              title: 'Food counter',
              subtitle: previewMenu.isEmpty
                  ? 'Menu updates soon'
                  : previewMenu.length == 1
                  ? previewMenu.first.name
                  : '${previewMenu.first.name} + ${previewMenu.length - 1} more',
              icon: Icons.fastfood_rounded,
              color: AppTheme.primaryOrange,
              onTap: _openMenu,
            ),
            _CafeExploreTileData(
              title: 'Events',
              subtitle: _business.publishedTournamentCount == 0
                  ? 'No live events yet'
                  : '${_business.publishedTournamentCount} tournaments live',
              icon: Icons.emoji_events_rounded,
              color: AppTheme.primaryTurquoise,
              onTap: _openTournaments,
            ),
            _CafeExploreTileData(
              title: 'Review',
              subtitle: _reviewState?.canReview == true
                  ? 'Verified player review'
                  : _business.reviewSummaryLabel,
              icon: Icons.rate_review_rounded,
              color: AppTheme.success,
              onTap: _openReviewComposer,
            ),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.xl,
          AppSpace.md,
          0,
        ),
        child: _CafeSectionHeader(
          title: 'Player reviews',
          subtitle:
              'Verified buyers help the next player judge setup quality, comfort, and service before booking.',
          trailing: GlowBadge(
            label: _business.hasReviews
                ? '${_business.averageRating.toStringAsFixed(1)} avg'
                : 'Fresh listing',
            color: AppTheme.warning,
            icon: Icons.star_rounded,
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
          0,
        ),
        child: Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: [
            StatChip(
              label: 'Review count',
              value: '${_business.reviewCount}',
              accent: AppTheme.primaryTurquoise,
              icon: Icons.chat_bubble_outline_rounded,
            ),
            if (_reviewState?.proofBillId != null)
              const GlowBadge(
                label: 'Verified customer',
                color: AppTheme.success,
                icon: Icons.verified_rounded,
              ),
            if (_reviewState?.review != null)
              GlowBadge(
                label: 'Your rating: ${_reviewState!.review!.rating}/5',
                color: AppTheme.primaryOrange,
                icon: Icons.edit_note_rounded,
              ),
          ],
        ),
      ),
    ]);

    if (_reviewState?.gateMessage != null) {
      loadedChildren.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.md,
            AppSpace.md,
            AppSpace.md,
            0,
          ),
          child: Text(
            _reviewState!.gateMessage,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
          ),
        ),
      );
    }

    if (_reviewState?.proofBillCreatedAt.isNotEmpty ?? false) {
      loadedChildren.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.md,
            AppSpace.sm,
            AppSpace.md,
            0,
          ),
          child: Text(
            'Latest verified visit: ${_formatReviewDate(_reviewState!.proofBillCreatedAt)}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
        ),
      );
    }

    if (latestReviews.isEmpty) {
      loadedChildren.add(
        Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: EmptyGlassState(
            title: 'No reviews published yet',
            message: _reviewState?.canReview == true
                ? 'Be the first verified player to rate this cafe.'
                : 'Reviews appear here after players complete bookings or cafe checkout.',
            icon: Icons.reviews_outlined,
            action: _reviewState?.canReview == true
                ? FilledButton.icon(
                    onPressed: _openReviewComposer,
                    icon: const Icon(Icons.rate_review_rounded),
                    label: const Text('Write the first review'),
                  )
                : null,
          ),
        ),
      );
    } else {
      loadedChildren.addAll(
        latestReviews.map(
          (review) => Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.md,
              AppSpace.md,
              AppSpace.md,
              0,
            ),
            child: _BusinessReviewCard(review: review),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.isDark ? AppTheme.background : Colors.white,
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: isInitialLoading
          ? null
          : _CafeFloatingShortcut(label: 'All rigs', onTap: _openRigDirectory),
      body: RefreshIndicator(
        onRefresh: _loadSnapshot,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          padding: const EdgeInsets.only(bottom: 120),
          children: [
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.md,
                  AppSpace.md,
                  AppSpace.md,
                  0,
                ),
                child: _CafeTopBar(
                  controller: _searchController,
                  query: _searchQuery,
                  hint: 'Search in ${_business.name}',
                  onChanged: (value) {
                    setState(() {
                      _searchQuery = value;
                    });
                  },
                  onBack: () => Navigator.maybePop(context),
                  onClear: () {
                    _searchController.clear();
                    setState(() {
                      _searchQuery = '';
                    });
                  },
                  onMore: _showMoreActions,
                ),
              ),
            ),
            if (isInitialLoading)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (showInitialError)
              Padding(
                padding: const EdgeInsets.all(AppSpace.lg),
                child: EmptyGlassState(
                  title: 'Could not load cafe details',
                  message: _errorMessage!,
                  icon: Icons.store_mall_directory_outlined,
                  action: OutlinedButton.icon(
                    onPressed: _loadSnapshot,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ),
              ),
            if (!isInitialLoading && !showInitialError) ...loadedChildren,
            const SizedBox(height: AppSpace.xl),
          ],
        ),
      ),
    );
  }
}

Color _accentForCategory(String category) {
  switch (normalizeStationCategory(category)) {
    case stationCategoryHighEndPc:
      return AppTheme.primaryOrange;
    case stationCategoryConsole:
      return AppTheme.primaryTurquoise;
    case stationCategoryEsportsPc:
    default:
      return AppTheme.success;
  }
}

Color _secondaryAccentForCategory(String category) {
  switch (normalizeStationCategory(category)) {
    case stationCategoryHighEndPc:
      return const Color(0xFFFFD8DE);
    case stationCategoryConsole:
      return const Color(0xFFE4DEFF);
    case stationCategoryEsportsPc:
    default:
      return const Color(0xFFDFF8E6);
  }
}

IconData _iconForCategory(String category) {
  switch (normalizeStationCategory(category)) {
    case stationCategoryHighEndPc:
      return Icons.memory_rounded;
    case stationCategoryConsole:
      return Icons.sports_esports_rounded;
    case stationCategoryEsportsPc:
    default:
      return Icons.desktop_windows_rounded;
  }
}

Color _statusColorForPc(PC pc) {
  if (pc.isDisabled) {
    return AppTheme.danger;
  }

  final liveState = (pc.liveState ?? '').toLowerCase();
  if (liveState == 'reserved' || liveState == 'no_show_risk') {
    return AppTheme.primaryTurquoise;
  }
  if (liveState == 'overtime' || liveState == 'awaiting_settlement') {
    return AppTheme.warning;
  }
  if (pc.isAvailable) {
    return AppTheme.success;
  }
  return AppTheme.warning;
}

List<String> _rigSpecTokens(String specs) {
  final rawTokens = specs
      .split(RegExp(r'[|,/•]'))
      .map((token) => token.trim())
      .where((token) => token.isNotEmpty)
      .toList();

  final unique = <String>[];
  for (final token in rawTokens) {
    if (!unique.any(
      (existing) => existing.toLowerCase() == token.toLowerCase(),
    )) {
      unique.add(token);
    }
  }

  if (unique.isNotEmpty) {
    return unique.take(4).toList();
  }

  final normalized = specs.trim();
  if (normalized.isEmpty) {
    return const [];
  }
  return [normalized];
}

String _rigDescription(PC pc) {
  final tokens = _rigSpecTokens(pc.specs);
  if (tokens.isEmpty) {
    return 'Player-ready setup with smooth booking flow and flexible session slots.';
  }

  return tokens.take(2).join(' · ');
}

String _compactCount(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(value >= 10000000 ? 0 : 1)}M+';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(value >= 10000 ? 0 : 1)}K+';
  }
  return '$value+';
}

String _rigAvailabilityCaption(PC pc) {
  if (pc.isDisabled) {
    return 'Maintenance window';
  }
  if (pc.isAvailable) {
    return 'Available now';
  }

  final liveState = (pc.liveState ?? '').toLowerCase();
  if (liveState == 'reserved') {
    return 'Reserved next';
  }
  if (liveState == 'overtime' || liveState == 'awaiting_settlement') {
    return 'Ending soon';
  }
  if (pc.remainingMinutes != null && pc.remainingMinutes! > 0) {
    return 'Free in ${pc.remainingMinutes} mins';
  }
  return pc.availabilityLabel;
}

double _rigAvailabilityMeter(PC pc) {
  if (pc.isDisabled) {
    return 0.18;
  }
  if (pc.isAvailable) {
    return 0.94;
  }

  final liveState = (pc.liveState ?? '').toLowerCase();
  if (liveState == 'reserved') {
    return 0.66;
  }
  if (liveState == 'overtime' || liveState == 'awaiting_settlement') {
    return 0.42;
  }
  return 0.56;
}

class _CafeSurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;

  const _CafeSurfaceCard({
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.radius = 26,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color ?? AppTheme.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppTheme.subtleBorder.withValues(alpha: 0.9)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.softShadowColor.withValues(
              alpha: AppTheme.isDark ? 0.22 : 0.08,
            ),
            blurRadius: AppTheme.isDark ? 18 : 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class _CafeTopBar extends StatelessWidget {
  final TextEditingController controller;
  final String query;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onBack;
  final VoidCallback onClear;
  final VoidCallback onMore;

  const _CafeTopBar({
    required this.controller,
    required this.query,
    required this.hint,
    required this.onChanged,
    required this.onBack,
    required this.onClear,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _CircleActionButton(
          icon: Icons.arrow_back_ios_new_rounded,
          onTap: onBack,
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: Container(
            height: 60,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppTheme.subtleBorder),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.softShadowColor.withValues(alpha: 0.06),
                  blurRadius: 18,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Row(
              children: [
                const SizedBox(width: AppSpace.md),
                Icon(
                  Icons.search_rounded,
                  color: AppTheme.primaryOrange,
                  size: 32,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: TextField(
                    controller: controller,
                    onChanged: onChanged,
                    cursorColor: AppTheme.primaryOrange,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    decoration: InputDecoration(
                      hintText: hint,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      isCollapsed: true,
                      hintStyle: Theme.of(context).textTheme.bodyLarge
                          ?.copyWith(
                            color: AppTheme.disabledText,
                            fontWeight: FontWeight.w500,
                          ),
                    ),
                  ),
                ),
                if (query.trim().isNotEmpty)
                  IconButton(
                    onPressed: onClear,
                    icon: const Icon(Icons.close_rounded),
                    color: AppTheme.secondaryText,
                  ),
                const SizedBox(width: AppSpace.xs),
              ],
            ),
          ),
        ),
        const SizedBox(width: AppSpace.sm),
        _CircleActionButton(icon: Icons.more_vert_rounded, onTap: onMore),
      ],
    );
  }
}

class _CircleActionButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _CircleActionButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(22)),
      child: Container(
        width: 60,
        height: 60,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppTheme.subtleBorder),
        ),
        child: Icon(icon, color: AppTheme.primaryText),
      ),
    );
  }
}

class _CafeSummaryCard extends StatelessWidget {
  final Business business;
  final int availableRigCount;
  final double startingRate;
  final VoidCallback onOpenMenu;
  final VoidCallback onOpenEvents;
  final VoidCallback onBrowseRigs;
  final VoidCallback onContactSupport;
  final VoidCallback onDirections;
  final VoidCallback? onCallCafe;
  final VoidCallback? onEmailCafe;

  const _CafeSummaryCard({
    required this.business,
    required this.availableRigCount,
    required this.startingRate,
    required this.onOpenMenu,
    required this.onOpenEvents,
    required this.onBrowseRigs,
    required this.onContactSupport,
    required this.onDirections,
    required this.onCallCafe,
    required this.onEmailCafe,
  });

  @override
  Widget build(BuildContext context) {
    final quickSignals = <Widget>[
      const _CafeMetaPill(
        label: 'Instant seat booking',
        icon: Icons.check_rounded,
        color: AppTheme.success,
      ),
      if (business.menuItemCount > 0)
        const _CafeMetaPill(
          label: 'Food counter live',
          icon: Icons.fastfood_rounded,
          color: AppTheme.primaryOrange,
        ),
      if (business.publishedTournamentCount > 0)
        const _CafeMetaPill(
          label: 'Events ready',
          icon: Icons.emoji_events_rounded,
          color: AppTheme.primaryTurquoise,
        ),
    ];

    return _CafeSurfaceCard(
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GlowBadge(
            label: business.isFeatured ? 'Featured arena' : 'Gaming cafe',
            color: AppTheme.success,
            icon: Icons.sports_esports_rounded,
          ),
          const SizedBox(height: AppSpace.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      business.name,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800, height: 1.05),
                    ),
                    if (business.summaryDescription.trim().isNotEmpty) ...[
                      const SizedBox(height: AppSpace.sm),
                      Text(
                        business.summaryDescription,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpace.md),
                    _CafeInfoLine(
                      icon: Icons.place_outlined,
                      label: business.fullAddress,
                    ),
                    const SizedBox(height: AppSpace.sm),
                    _CafeInfoLine(
                      icon: Icons.flash_on_rounded,
                      highlight: '$availableRigCount rigs open',
                      label: 'right now',
                      highlightColor: AppTheme.success,
                    ),
                    const SizedBox(height: AppSpace.sm),
                    _CafeInfoLine(
                      icon: Icons.schedule_rounded,
                      label:
                          'Daily hours: ${business.scheduleLabel} (${business.timezone})',
                    ),
                    const SizedBox(height: AppSpace.sm),
                    _CafeInfoLine(
                      icon: Icons.support_agent_rounded,
                      label: business.contactLabel,
                    ),
                    if (startingRate > 0) ...[
                      const SizedBox(height: AppSpace.sm),
                      _CafeInfoLine(
                        icon: Icons.currency_rupee_rounded,
                        highlight: '${formatCurrency(startingRate)}/hr',
                        label: 'entry rate for walk-in bookings',
                        highlightColor: AppTheme.primaryOrange,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.md),
              _CafeRatingCluster(business: business),
            ],
          ),
          if (quickSignals.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            Wrap(
              spacing: AppSpace.sm,
              runSpacing: AppSpace.sm,
              children: quickSignals,
            ),
          ],
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              OutlinedButton.icon(
                onPressed: onDirections,
                icon: const Icon(Icons.directions_rounded),
                label: const Text('Directions'),
              ),
              if (onCallCafe != null)
                OutlinedButton.icon(
                  onPressed: onCallCafe,
                  icon: const Icon(Icons.call_outlined),
                  label: const Text('Call'),
                ),
              if (onEmailCafe != null)
                OutlinedButton.icon(
                  onPressed: onEmailCafe,
                  icon: const Icon(Icons.email_outlined),
                  label: const Text('Email'),
                ),
              OutlinedButton.icon(
                onPressed: onBrowseRigs,
                icon: const Icon(Icons.desktop_windows_rounded),
                label: const Text('Browse rigs'),
              ),
              OutlinedButton.icon(
                onPressed: onOpenMenu,
                icon: const Icon(Icons.fastfood_rounded),
                label: const Text('Food counter'),
              ),
              OutlinedButton.icon(
                onPressed: onOpenEvents,
                icon: const Icon(Icons.emoji_events_rounded),
                label: const Text('Events'),
              ),
              OutlinedButton.icon(
                onPressed: onContactSupport,
                icon: const Icon(Icons.support_agent_rounded),
                label: const Text('Contact cafe'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CafeRatingCluster extends StatelessWidget {
  final Business business;

  const _CafeRatingCluster({required this.business});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: AppSpace.sm,
          ),
          decoration: BoxDecoration(
            color: AppTheme.success,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.star_rounded, color: Colors.white, size: 20),
              const SizedBox(width: AppSpace.xs),
              Text(
                business.hasReviews
                    ? business.averageRating.toStringAsFixed(1)
                    : 'New',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.xs),
        Text(
          business.reviewCount > 0
              ? 'By ${_compactCount(business.reviewCount)} players'
              : 'Fresh listing',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          textAlign: TextAlign.right,
        ),
      ],
    );
  }
}

class _CafeProfileDetailsCard extends StatelessWidget {
  final Business business;
  final List<PC> pcs;

  const _CafeProfileDetailsCard({required this.business, required this.pcs});

  @override
  Widget build(BuildContext context) {
    final equipment = <String>{
      ...business.equipmentHighlights,
      ...pcs.map((pc) => pc.categoryLabel),
    }.toList();
    final hasDetails =
        business.amenities.isNotEmpty ||
        equipment.isNotEmpty ||
        business.parkingInfo.trim().isNotEmpty ||
        business.accessibilityInfo.trim().isNotEmpty ||
        business.policies.trim().isNotEmpty ||
        business.galleryImages.isNotEmpty;
    if (!hasDetails) return const SizedBox.shrink();

    return _CafeSurfaceCard(
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Cafe details',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          if (business.amenities.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _CafeProfileDetailSection(
              title: 'Amenities',
              icon: Icons.star_outline_rounded,
              items: business.amenities,
            ),
          ],
          if (equipment.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _CafeProfileDetailSection(
              title: 'Equipment',
              icon: Icons.computer_rounded,
              items: equipment,
            ),
          ],
          if (business.parkingInfo.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _CafeProfileTextDetail(
              title: 'Parking',
              icon: Icons.local_parking_rounded,
              text: business.parkingInfo,
            ),
          ],
          if (business.accessibilityInfo.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _CafeProfileTextDetail(
              title: 'Accessibility',
              icon: Icons.accessible_forward_rounded,
              text: business.accessibilityInfo,
            ),
          ],
          if (business.policies.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            _CafeProfileTextDetail(
              title: 'Cafe policies',
              icon: Icons.rule_rounded,
              text: business.policies,
            ),
          ],
          if (business.galleryImages.isNotEmpty) ...[
            const SizedBox(height: AppSpace.lg),
            Text(
              'Gallery',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: AppSpace.sm),
            SizedBox(
              height: 174,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: business.galleryImages.length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                itemBuilder: (context, index) => ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: SizedBox(
                    width: 250,
                    child: AppSmartImage(
                      source: business.galleryImages[index],
                      fallback: Container(
                        color: AppTheme.surface,
                        child: const Icon(Icons.photo_outlined, size: 44),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CafeProfileDetailSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<String> items;

  const _CafeProfileDetailSection({
    required this.title,
    required this.icon,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 18, color: AppTheme.primaryTurquoise),
            const SizedBox(width: AppSpace.xs),
            Text(title, style: Theme.of(context).textTheme.titleSmall),
          ],
        ),
        const SizedBox(height: AppSpace.sm),
        Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: items
              .map(
                (item) => _CafeMetaPill(
                  label: item,
                  icon: icon,
                  color: AppTheme.primaryTurquoise,
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _CafeProfileTextDetail extends StatelessWidget {
  final String title;
  final IconData icon;
  final String text;

  const _CafeProfileTextDetail({
    required this.title,
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 19, color: AppTheme.primaryTurquoise),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 3),
              Text(text, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

class _CafeInfoLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? highlight;
  final Color? highlightColor;

  const _CafeInfoLine({
    required this.icon,
    required this.label,
    this.highlight,
    this.highlightColor,
  });

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
      color: AppTheme.secondaryText,
      fontWeight: FontWeight.w600,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: highlightColor ?? AppTheme.secondaryText),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: style,
              children: [
                if (highlight != null)
                  TextSpan(
                    text: '$highlight ',
                    style: style?.copyWith(
                      color: highlightColor ?? AppTheme.primaryText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                TextSpan(text: label),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CafeOfferStrip extends StatelessWidget {
  final int availableCount;
  final double startingRate;
  final int perkCount;

  const _CafeOfferStrip({
    required this.availableCount,
    required this.startingRate,
    required this.perkCount,
  });

  @override
  Widget build(BuildContext context) {
    final headline = startingRate > 0
        ? 'Open rigs from ${formatCurrency(startingRate)}/hr'
        : 'Fresh booking rates landing soon';
    final trailing = availableCount > 0
        ? '$availableCount open now'
        : perkCount > 0
        ? '$perkCount cafe extras'
        : 'New sync';

    return _CafeSurfaceCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: AppSpace.md,
      ),
      radius: 22,
      color: AppTheme.elevatedSurface,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.primaryTurquoise.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.local_offer_outlined,
              color: AppTheme.primaryTurquoise,
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Text(
              headline,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Text(
            trailing,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: AppTheme.secondaryText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _RigFilterBar extends StatelessWidget {
  final String selectedFilter;
  final ValueChanged<String> onSelected;

  const _RigFilterBar({required this.selectedFilter, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    const filters = <_FilterOption>[
      _FilterOption(
        value: _CafeDetailScreenState._rigFilterAll,
        label: 'All rigs',
        icon: Icons.tune_rounded,
      ),
      _FilterOption(
        value: _CafeDetailScreenState._rigFilterAvailable,
        label: 'Available now',
        icon: Icons.bolt_rounded,
      ),
      _FilterOption(
        value: stationCategoryHighEndPc,
        label: 'High-end',
        icon: Icons.memory_rounded,
      ),
      _FilterOption(
        value: stationCategoryEsportsPc,
        label: 'Esports',
        icon: Icons.desktop_windows_rounded,
      ),
      _FilterOption(
        value: stationCategoryConsole,
        label: 'Console',
        icon: Icons.sports_esports_rounded,
      ),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: filters.map((filter) {
          final isSelected = selectedFilter == filter.value;
          return Padding(
            padding: const EdgeInsets.only(right: AppSpace.sm),
            child: _FilterChip(
              label: filter.label,
              icon: filter.icon,
              selected: isSelected,
              onTap: () => onSelected(filter.value),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _FilterOption {
  final String value;
  final String label;
  final IconData icon;

  const _FilterOption({
    required this.value,
    required this.label,
    required this.icon,
  });
}

class _FilterChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(18)),
      child: AnimatedContainer(
        duration: AppMotion.normal,
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.md,
          vertical: AppSpace.sm,
        ),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primaryOrange.withValues(alpha: 0.1)
              : AppTheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected
                ? AppTheme.primaryOrange.withValues(alpha: 0.28)
                : AppTheme.subtleBorder,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? AppTheme.primaryOrange : AppTheme.primaryText,
            ),
            const SizedBox(width: AppSpace.xs),
            Text(
              label,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: selected ? AppTheme.primaryOrange : AppTheme.primaryText,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CafeSectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const _CafeSectionHeader({required this.title, this.subtitle, this.trailing});

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
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: AppSpace.xs),
                Text(
                  subtitle!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: AppSpace.sm),
          trailing!,
        ],
      ],
    );
  }
}

class _RigBookingCard extends StatelessWidget {
  final PC pc;
  final VoidCallback onBook;
  final VoidCallback onViewDetails;

  const _RigBookingCard({
    required this.pc,
    required this.onBook,
    required this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    final accent = _accentForCategory(pc.category);
    final specTokens = _rigSpecTokens(pc.specs).take(3).toList();
    final canOpenBooking = pc.canReserve;

    return _CafeSurfaceCard(
      padding: const EdgeInsets.all(AppSpace.md),
      radius: 28,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      _iconForCategory(pc.category),
                      size: 26,
                      color: accent,
                    ),
                    const SizedBox(width: AppSpace.xs),
                    if (pc.isAvailable)
                      Icon(
                        Icons.local_fire_department_rounded,
                        size: 18,
                        color: AppTheme.primaryOrange,
                      ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                Text(
                  pc.stationTitle,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: AppSpace.sm),
                _RigMomentumMeter(pc: pc),
                const SizedBox(height: AppSpace.md),
                Text(
                  '${formatCurrency(pc.price)}/hr',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: AppSpace.sm),
                Text(
                  _rigDescription(pc),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.secondaryText,
                  ),
                ),
                if (specTokens.isNotEmpty) ...[
                  const SizedBox(height: AppSpace.md),
                  Wrap(
                    spacing: AppSpace.xs,
                    runSpacing: AppSpace.xs,
                    children: specTokens
                        .map(
                          (token) => _CafeMetaPill(
                            label: token,
                            icon: Icons.memory_rounded,
                            color: accent,
                            compact: true,
                          ),
                        )
                        .toList(),
                  ),
                ],
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    _MiniCircleAction(
                      icon: Icons.info_outline_rounded,
                      onTap: onViewDetails,
                    ),
                    const SizedBox(width: AppSpace.sm),
                    _MiniCircleAction(
                      icon: Icons.play_circle_outline_rounded,
                      onTap: canOpenBooking ? onBook : onViewDetails,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.md),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 150),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _RigPreviewArt(pc: pc),
                const SizedBox(height: AppSpace.sm),
                SizedBox(
                  height: 56,
                  child: OutlinedButton(
                    onPressed: canOpenBooking ? onBook : null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryOrange,
                      backgroundColor: AppTheme.primaryOrange.withValues(
                        alpha: 0.04,
                      ),
                      side: BorderSide(
                        color: AppTheme.primaryOrange.withValues(
                          alpha: canOpenBooking ? 0.38 : 0.16,
                        ),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          canOpenBooking ? 'ADD' : 'LOCKED',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(
                                color: canOpenBooking
                                    ? AppTheme.primaryOrange
                                    : AppTheme.disabledText,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.4,
                              ),
                        ),
                        const SizedBox(width: AppSpace.xs),
                        Icon(
                          Icons.add_rounded,
                          color: canOpenBooking
                              ? AppTheme.primaryOrange
                              : AppTheme.disabledText,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppSpace.xs),
                Center(
                  child: Text(
                    canOpenBooking ? 'choose slots' : 'maintenance',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.secondaryText,
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
}

class _RigMomentumMeter extends StatelessWidget {
  final PC pc;

  const _RigMomentumMeter({required this.pc});

  @override
  Widget build(BuildContext context) {
    final color = _statusColorForPc(pc);

    return Row(
      children: [
        Container(
          width: 96,
          height: 12,
          decoration: BoxDecoration(
            color: AppTheme.raisedSurface,
            borderRadius: BorderRadius.circular(999),
          ),
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: _rigAvailabilityMeter(pc),
            child: Container(
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: Text(
            _rigAvailabilityCaption(pc),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _MiniCircleAction extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _MiniCircleAction({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(18)),
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppTheme.subtleBorder),
        ),
        child: Icon(icon, color: AppTheme.secondaryText),
      ),
    );
  }
}

class _RigPreviewArt extends StatelessWidget {
  final PC pc;

  const _RigPreviewArt({required this.pc});

  @override
  Widget build(BuildContext context) {
    final accent = _accentForCategory(pc.category);
    final secondary = _secondaryAccentForCategory(pc.category);
    final specTokens = _rigSpecTokens(pc.specs).take(2).toList();

    return AspectRatio(
      aspectRatio: 0.92,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [secondary, accent.withValues(alpha: 0.16), Colors.white],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -14,
              right: -10,
              child: Container(
                width: 78,
                height: 78,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withValues(alpha: 0.14),
                ),
              ),
            ),
            Positioned(
              left: 14,
              right: 14,
              top: 14,
              child: _CafeMetaPill(
                label: pc.categoryLabel,
                icon: _iconForCategory(pc.category),
                color: accent,
              ),
            ),
            Center(
              child: Icon(
                _iconForCategory(pc.category),
                size: 56,
                color: accent,
              ),
            ),
            if (specTokens.isNotEmpty)
              Positioned(
                left: 14,
                right: 14,
                bottom: 14,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: specTokens
                      .map(
                        (token) => Padding(
                          padding: const EdgeInsets.only(top: AppSpace.xs),
                          child: Text(
                            token,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: AppTheme.primaryText,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RigStatusBadge extends StatelessWidget {
  final PC pc;

  const _RigStatusBadge({required this.pc});

  @override
  Widget build(BuildContext context) {
    return GlowBadge(
      label: _rigAvailabilityCaption(pc),
      color: _statusColorForPc(pc),
      icon: Icons.circle_notifications_rounded,
    );
  }
}

class _CafeMetaPill extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool compact;

  const _CafeMetaPill({
    required this.label,
    required this.icon,
    required this.color,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? AppSpace.sm : AppSpace.md,
        vertical: compact ? 6 : AppSpace.sm,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.16)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 14 : 16, color: color),
          const SizedBox(width: AppSpace.xs),
          Flexible(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CafeExploreTileData {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _CafeExploreTileData({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });
}

class _CafeExploreRow extends StatelessWidget {
  final List<_CafeExploreTileData> tiles;

  const _CafeExploreRow({required this.tiles});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 760) {
          return Row(
            children: tiles
                .map(
                  (tile) => Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        right: tile == tiles.last ? 0 : AppSpace.sm,
                      ),
                      child: _CafeExploreTile(tile: tile),
                    ),
                  ),
                )
                .toList(),
          );
        }

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          physics: const BouncingScrollPhysics(),
          child: Row(
            children: tiles
                .map(
                  (tile) => Padding(
                    padding: EdgeInsets.only(
                      right: tile == tiles.last ? 0 : AppSpace.sm,
                    ),
                    child: SizedBox(
                      width: 220,
                      child: _CafeExploreTile(tile: tile),
                    ),
                  ),
                )
                .toList(),
          ),
        );
      },
    );
  }
}

class _CafeExploreTile extends StatelessWidget {
  final _CafeExploreTileData tile;

  const _CafeExploreTile({required this.tile});

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: tile.onTap,
      borderRadius: const BorderRadius.all(Radius.circular(24)),
      child: _CafeSurfaceCard(
        radius: 24,
        padding: const EdgeInsets.all(AppSpace.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: tile.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(tile.icon, color: tile.color),
            ),
            const SizedBox(height: AppSpace.md),
            Text(
              tile.title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: AppSpace.xs),
            Text(
              tile.subtitle,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
        ),
      ),
    );
  }
}

class _CafeFloatingShortcut extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _CafeFloatingShortcut({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(22)),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.md,
          vertical: AppSpace.sm,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFF252533),
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 18,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.computer_rounded, color: Colors.white),
            const SizedBox(width: AppSpace.sm),
            Text(
              label,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BusinessReviewCard extends StatelessWidget {
  final BusinessReview review;

  const _BusinessReviewCard({required this.review});

  @override
  Widget build(BuildContext context) {
    final avatarProvider = resolveAppImageProvider(review.authorAvatar);

    return _CafeSurfaceCard(
      radius: 24,
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppTheme.elevatedSurface,
                backgroundImage: avatarProvider,
                child: avatarProvider == null
                    ? Text(
                        review.authorInitial,
                        style: Theme.of(context).textTheme.titleMedium,
                      )
                    : null,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: AppSpace.xs,
                      runSpacing: AppSpace.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          review.authorName,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if (review.isMine)
                          const GlowBadge(
                            label: 'You',
                            color: AppTheme.primaryOrange,
                            icon: Icons.person_rounded,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.xs),
                    Row(
                      children: [
                        _StaticStarRating(rating: review.rating),
                        const SizedBox(width: AppSpace.sm),
                        Text(
                          review.dateLabel,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppTheme.secondaryText),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Text(
            review.displayTitle,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            review.reviewText,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
          ),
        ],
      ),
    );
  }
}

class _ReviewComposerSheet extends StatefulWidget {
  final String businessName;
  final BusinessReview? existingReview;

  const _ReviewComposerSheet({
    required this.businessName,
    required this.existingReview,
  });

  @override
  State<_ReviewComposerSheet> createState() => _ReviewComposerSheetState();
}

class _ReviewComposerSheetState extends State<_ReviewComposerSheet> {
  static const int _titleLimit = 80;
  static const int _reviewLimit = 480;

  late final TextEditingController _titleController;
  late final TextEditingController _reviewController;
  int _rating = 0;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(
      text: widget.existingReview?.title ?? '',
    );
    _reviewController = TextEditingController(
      text: widget.existingReview?.reviewText ?? '',
    );
    _rating = widget.existingReview?.rating ?? 0;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _reviewController.dispose();
    super.dispose();
  }

  void _submit() {
    final reviewText = _reviewController.text.trim();

    if (_rating < 1 || _rating > 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick a star rating before submitting.')),
      );
      return;
    }

    if (reviewText.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Write a short note about your cafe experience.'),
        ),
      );
      return;
    }

    Navigator.pop(
      context,
      _ReviewDraft(
        rating: _rating,
        title: _titleController.text.trim(),
        reviewText: reviewText,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(0, 0, 0, bottomInset),
      child: GlassPanel(
        margin: const EdgeInsets.all(AppSpace.lg),
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: AppSpace.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              AppSectionTitle(
                title: widget.existingReview == null
                    ? 'Review ${widget.businessName}'
                    : 'Update your review',
                subtitle:
                    'Keep it useful for the next player: rig quality, food speed, comfort, and service.',
              ),
              const SizedBox(height: AppSpace.md),
              Text(
                'Your rating',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpace.sm),
              _StarRatingInput(
                rating: _rating,
                onChanged: (value) {
                  setState(() {
                    _rating = value;
                  });
                },
              ),
              const SizedBox(height: AppSpace.md),
              TextField(
                controller: _titleController,
                maxLength: _titleLimit,
                decoration: buildAppInputDecoration(
                  label: 'Headline',
                  hint: 'What stood out most?',
                  icon: Icons.title_rounded,
                ),
              ),
              const SizedBox(height: AppSpace.sm),
              TextField(
                controller: _reviewController,
                maxLength: _reviewLimit,
                minLines: 4,
                maxLines: 7,
                decoration: buildAppInputDecoration(
                  label: 'Review',
                  hint:
                      'Share what the session felt like, what you ordered, and whether you would book again.',
                  icon: Icons.chat_bubble_outline_rounded,
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: AppSpace.md),
              Wrap(
                spacing: AppSpace.sm,
                runSpacing: AppSpace.sm,
                children: [
                  FilledButton.icon(
                    onPressed: _submit,
                    icon: const Icon(Icons.send_rounded),
                    label: Text(
                      widget.existingReview == null
                          ? 'Publish review'
                          : 'Save changes',
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Cancel'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StarRatingInput extends StatelessWidget {
  final int rating;
  final ValueChanged<int> onChanged;

  const _StarRatingInput({required this.rating, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpace.xs,
      children: List<Widget>.generate(5, (index) {
        final starValue = index + 1;
        final isActive = starValue <= rating;

        return IconButton(
          onPressed: () => onChanged(starValue),
          tooltip: '$starValue stars',
          icon: Icon(
            isActive ? Icons.star_rounded : Icons.star_border_rounded,
            color: isActive ? AppTheme.warning : AppTheme.disabledText,
            size: 32,
          ),
        );
      }),
    );
  }
}

class _StaticStarRating extends StatelessWidget {
  final int rating;

  const _StaticStarRating({required this.rating});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List<Widget>.generate(5, (index) {
        final isActive = index < rating;
        return Icon(
          isActive ? Icons.star_rounded : Icons.star_border_rounded,
          size: 16,
          color: isActive ? AppTheme.warning : AppTheme.disabledText,
        );
      }),
    );
  }
}

class _ReviewDraft {
  final int rating;
  final String title;
  final String reviewText;

  const _ReviewDraft({
    required this.rating,
    required this.title,
    required this.reviewText,
  });
}

String _formatReviewDate(String rawValue) {
  final parsed = DateTime.tryParse(rawValue);
  if (parsed == null) {
    return 'Recently';
  }

  const months = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  return '${months[parsed.month - 1]} ${parsed.day}, ${parsed.year}';
}
