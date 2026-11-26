import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/menu.dart';
import '../../models/order.dart';
import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/order_provider.dart';
import '../../services/order_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/food_card.dart';
import 'cart_screen.dart';

class FoodScreen extends StatefulWidget {
  final int? bookingId;
  final int? businessId;
  final String? businessName;
  final String? businessTagline;

  const FoodScreen({
    super.key,
    this.bookingId,
    this.businessId,
    this.businessName,
    this.businessTagline,
  });

  @override
  State<FoodScreen> createState() => _FoodScreenState();
}

class _FoodScreenState extends State<FoodScreen> {
  final OrderService _orderService = OrderService();

  String selectedCategory = 'All';
  List<MenuItemModel> _browseMenu = const [];
  bool _browseLoading = false;
  String? _browseError;
  Timer? _orderRefreshTimer;

  bool get _canPlaceOrders => widget.bookingId != null;

  int? get _resolvedBusinessId =>
      widget.businessId ?? context.read<BusinessProvider>().selectedBusinessId;

  String _resolvedBusinessName(BusinessProvider businessProvider) {
    if (widget.businessName?.trim().isNotEmpty == true) {
      return widget.businessName!.trim();
    }

    return businessProvider.selectedBusiness?.name ?? 'Selected cafe';
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      await _hydrate();
    });
    if (_canPlaceOrders) {
      _orderRefreshTimer = Timer.periodic(const Duration(seconds: 30), (
        _,
      ) async {
        if (!mounted) return;
        final token = context.read<AuthProvider>().token;
        if (token != null && token.isNotEmpty) {
          await context.read<OrderProvider>().loadOrderBill(
            token,
            widget.bookingId!,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _orderRefreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _hydrate() async {
    final orderProvider = context.read<OrderProvider>();
    final token = context.read<AuthProvider>().token;
    final businessId = _resolvedBusinessId;

    if (_canPlaceOrders) {
      if (businessId != null) {
        await orderProvider.loadMenu(businessId: businessId);
      }
      if (token != null && token.isNotEmpty) {
        await orderProvider.loadOrderBill(token, widget.bookingId!);
      } else {
        orderProvider.clearOrderState(clearCartItems: true);
      }
      return;
    }

    await _loadBrowseMenu();
  }

  Future<void> _loadBrowseMenu() async {
    final businessId = _resolvedBusinessId;
    if (businessId == null) {
      setState(() {
        _browseLoading = false;
        _browseMenu = const [];
        _browseError =
            'Choose a cafe in the marketplace before browsing its menu.';
      });
      return;
    }

    setState(() {
      _browseLoading = true;
      _browseError = null;
    });

    try {
      final data = await _orderService.fetchMenu(businessId: businessId);
      if (!mounted) {
        return;
      }

      setState(() {
        _browseMenu = data
            .map(
              (item) => MenuItemModel.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList();
        _browseLoading = false;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _browseLoading = false;
        _browseError = e.toString();
        _browseMenu = const [];
      });
    }
  }

  Future<void> _openCart() async {
    final orderProvider = context.read<OrderProvider>();
    final token = context.read<AuthProvider>().token;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CartScreen(bookingId: widget.bookingId!),
      ),
    );

    if (!mounted) {
      return;
    }

    if (token != null && token.isNotEmpty) {
      await orderProvider.loadOrderBill(token, widget.bookingId!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orderProvider = context.watch<OrderProvider>();
    final businessProvider = context.watch<BusinessProvider>();
    final resolvedBusinessName = _resolvedBusinessName(businessProvider);
    final browseMenu = _canPlaceOrders ? orderProvider.menu : _browseMenu;
    final availableMenu = browseMenu.where((item) => item.isAvailable).toList();
    final featuredItems = availableMenu
        .where((item) => item.isFeatured)
        .take(6)
        .toList();
    final categories = [
      'All',
      ...{for (final item in browseMenu) item.category}.toList()..sort(),
    ];
    final visibleItems = selectedCategory == 'All'
        ? browseMenu
        : browseMenu
              .where((item) => item.category == selectedCategory)
              .toList();
    final activeOrders = orderProvider.orderSummary?.orders ?? const [];
    final isLoading = _canPlaceOrders
        ? orderProvider.isLoading
        : _browseLoading;
    final errorMessage = _canPlaceOrders
        ? orderProvider.errorMessage
        : _browseError;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _canPlaceOrders
              ? 'Order from $resolvedBusinessName'
              : 'Menu at $resolvedBusinessName',
        ),
        actions: _canPlaceOrders
            ? [
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: IconButton(
                    onPressed: _openCart,
                    icon: Badge(
                      label: Text('${orderProvider.cartItemCount}'),
                      isLabelVisible: orderProvider.cartItemCount > 0,
                      child: const Icon(Icons.shopping_bag_outlined),
                    ),
                  ),
                ),
              ]
            : null,
      ),
      backgroundColor: AppTheme.background,
      body: AppBackdrop(
        child: RefreshIndicator(
          onRefresh: () async {
            final token = context.read<AuthProvider>().token;
            final businessId = _resolvedBusinessId;
            if (_canPlaceOrders) {
              await orderProvider.loadMenu(businessId: businessId);
            } else {
              await _loadBrowseMenu();
            }
            if (_canPlaceOrders && token != null && token.isNotEmpty) {
              await orderProvider.loadOrderBill(token, widget.bookingId!);
            }
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 140),
            children: [
              AppReveal(
                child: HeroGlassPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          GlowBadge(
                            label: _canPlaceOrders
                                ? 'Delivery to your setup'
                                : resolvedBusinessName,
                            color: _canPlaceOrders
                                ? AppTheme.primaryOrange
                                : AppTheme.primaryTurquoise,
                            icon: Icons.room_service_outlined,
                          ),
                          GlowBadge(
                            label: '${categories.length - 1} categories',
                            color: AppTheme.primaryTurquoise,
                            icon: Icons.grid_view_rounded,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _canPlaceOrders
                            ? 'Fresh bites for your gaming session'
                            : 'Discover what $resolvedBusinessName is serving today',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _canPlaceOrders
                            ? 'Order snacks, shakes, and comfort food directly to your station, then settle it with your session checkout.'
                            : widget.businessTagline?.trim().isNotEmpty == true
                            ? widget.businessTagline!.trim()
                            : 'Explore the full menu now. Ordering will unlock as soon as your booking goes live.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                      const SizedBox(height: 20),
                      _DiscoveryBar(
                        hint: _canPlaceOrders
                            ? 'Search burgers, momos, fries, shakes...'
                            : 'Preview burgers, drinks, and quick bites...',
                      ),
                      const SizedBox(height: 18),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            StatChip(
                              label: 'Featured',
                              value: '${featuredItems.length} picks',
                              accent: AppTheme.primaryOrange,
                              icon: Icons.local_fire_department_rounded,
                            ),
                            const SizedBox(width: 12),
                            StatChip(
                              label: 'Prep speed',
                              value: 'Fast kitchen',
                              accent: AppTheme.primaryTurquoise,
                              icon: Icons.bolt_rounded,
                            ),
                            const SizedBox(width: 12),
                            StatChip(
                              label: _canPlaceOrders ? 'Cart' : 'Ordering',
                              value: _canPlaceOrders
                                  ? '${orderProvider.cartItemCount} items'
                                  : resolvedBusinessName,
                              accent: _canPlaceOrders
                                  ? AppTheme.primaryOrange
                                  : AppTheme.primaryTurquoise,
                              icon: _canPlaceOrders
                                  ? Icons.shopping_bag_outlined
                                  : Icons.schedule_rounded,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (featuredItems.isNotEmpty) ...[
                const SizedBox(height: 22),
                AppSectionTitle(
                  title: 'Quick picks',
                  subtitle: 'A shorter set of fast, popular choices.',
                  trailing: GlowBadge(
                    label: '${featuredItems.length} featured',
                    color: AppTheme.primaryOrange,
                    icon: Icons.stars_rounded,
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 256,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: featuredItems.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(width: 14),
                    itemBuilder: (context, index) {
                      final item = featuredItems[index];
                      return SizedBox(
                        width: 272,
                        child: _FeaturedMenuCard(item: item),
                      );
                    },
                  ),
                ),
              ],
              const SizedBox(height: 24),
              GlassPanel(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppSectionTitle(
                      title: 'Browse by category',
                      subtitle: 'Quick filters to find exactly what you want.',
                      trailing: GlowBadge(
                        label: '${visibleItems.length} shown',
                        color: AppTheme.primaryTurquoise,
                        icon: Icons.tune_rounded,
                      ),
                    ),
                    const SizedBox(height: 16),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final category in categories)
                            Padding(
                              padding: const EdgeInsets.only(right: 10),
                              child: ChoiceChip(
                                label: Text(category),
                                selected: selectedCategory == category,
                                showCheckmark: false,
                                selectedColor: AppTheme.primaryOrange
                                    .withValues(alpha: 0.12),
                                backgroundColor: AppTheme.raisedSurface,
                                side: BorderSide(
                                  color: selectedCategory == category
                                      ? AppTheme.primaryOrange.withValues(
                                          alpha: 0.45,
                                        )
                                      : AppTheme.subtleBorder.withValues(
                                          alpha: 0.95,
                                        ),
                                ),
                                labelStyle: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(
                                      color: selectedCategory == category
                                          ? AppTheme.primaryOrange
                                          : AppTheme.primaryText,
                                      fontWeight: FontWeight.w700,
                                    ),
                                onSelected: (_) {
                                  setState(() {
                                    selectedCategory = category;
                                  });
                                },
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (_canPlaceOrders && activeOrders.isNotEmpty) ...[
                const SizedBox(height: 18),
                _KitchenOrdersPanel(orders: activeOrders),
              ],
              const SizedBox(height: 22),
              AppSectionTitle(
                title: selectedCategory == 'All'
                    ? 'Popular around the cafe'
                    : '$selectedCategory picks',
                subtitle: _canPlaceOrders
                    ? 'Add items in a few taps and send them straight to the kitchen.'
                    : 'Browse the dishes now and order them when your session begins.',
              ),
              const SizedBox(height: 14),
              if (isLoading)
                const Padding(
                  padding: EdgeInsets.only(top: 26),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (errorMessage != null)
                EmptyGlassState(
                  title: 'Could not load this menu',
                  message: errorMessage,
                  icon: Icons.restaurant_menu_outlined,
                )
              else if (visibleItems.isEmpty)
                const EmptyGlassState(
                  title: 'No menu items found',
                  message: 'There is nothing in this category yet.',
                  icon: Icons.no_food_outlined,
                )
              else
                ...visibleItems.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: AppReveal(
                      delay: Duration(milliseconds: entry.key * 35),
                      child: FoodCard(
                        item: entry.value,
                        quantity: orderProvider.quantityFor(entry.value.id),
                        isOrderingEnabled: _canPlaceOrders,
                        disabledMessage:
                            'Ordering opens during your live session.',
                        onAdd: () => orderProvider.updateQuantity(
                          entry.value.id,
                          orderProvider.quantityFor(entry.value.id) + 1,
                        ),
                        onRemove: () => orderProvider.updateQuantity(
                          entry.value.id,
                          orderProvider.quantityFor(entry.value.id) - 1,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _canPlaceOrders
          ? SafeArea(
              minimum: const EdgeInsets.fromLTRB(20, 10, 20, 18),
              child: GlassPanel(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                borderRadius: const BorderRadius.all(Radius.circular(24)),
                glowColor: orderProvider.hasCartItems
                    ? AppTheme.primaryOrange
                    : AppTheme.primaryTurquoise,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            orderProvider.hasCartItems
                                ? '${orderProvider.cartItemCount} items selected'
                                : 'Start your order',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            orderProvider.hasCartItems
                                ? formatCurrency(
                                    orderProvider.localSelectionTotal,
                                  )
                                : 'Pay later with your session checkout',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: AppTheme.secondaryText),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: _openCart,
                      icon: const Icon(Icons.shopping_bag_outlined),
                      label: Text(
                        orderProvider.hasCartItems
                            ? 'Review order'
                            : 'Open cart',
                      ),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }
}

class _DiscoveryBar extends StatelessWidget {
  final String hint;

  const _DiscoveryBar({required this.hint});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.86),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.subtleBorder.withValues(alpha: 0.9)),
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, color: AppTheme.secondaryText),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              hint,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.primaryOrange.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              'Quick picks',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppTheme.primaryOrange,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeaturedMenuCard extends StatelessWidget {
  final dynamic item;

  const _FeaturedMenuCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: const EdgeInsets.all(14),
      glowColor: AppTheme.primaryOrange,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: item.imageUrl.isEmpty
                  ? Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppTheme.primaryOrange.withValues(alpha: 0.2),
                            AppTheme.raisedSurface,
                          ],
                        ),
                      ),
                      child: const Center(
                        child: Icon(Icons.restaurant_rounded, size: 42),
                      ),
                    )
                  : AppSmartImage(
                      source: item.image,
                      width: double.infinity,
                      fallback: Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              AppTheme.primaryOrange.withValues(alpha: 0.2),
                              AppTheme.raisedSurface,
                            ],
                          ),
                        ),
                        child: const Center(
                          child: Icon(Icons.restaurant_rounded, size: 42),
                        ),
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 14),
          Text(item.name, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            item.description.isEmpty
                ? 'Chef favourite for quick energy.'
                : item.description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              StatChip(
                label: 'Category',
                value: item.category,
                accent: AppTheme.primaryTurquoise,
                icon: Icons.local_dining_outlined,
              ),
              StatChip(
                label: 'Price',
                value: formatCurrency(item.amount),
                accent: AppTheme.primaryOrange,
                icon: Icons.payments_outlined,
              ),
              StatChip(
                label: 'Prep',
                value: '${item.prepTimeMinutes} min',
                icon: Icons.timer_outlined,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _KitchenOrdersPanel extends StatelessWidget {
  final List<OrderTicket> orders;

  const _KitchenOrdersPanel({required this.orders});

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      padding: const EdgeInsets.all(18),
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionTitle(
            title: 'Kitchen queue',
            subtitle: 'Track everything already sent to the cafe.',
            trailing: GlowBadge(
              label: '${orders.length} live',
              color: AppTheme.primaryTurquoise,
              icon: Icons.receipt_long_outlined,
            ),
          ),
          const SizedBox(height: 14),
          ...orders.map(
            (order) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _OrderTicketCard(order: order),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderTicketCard extends StatelessWidget {
  final OrderTicket order;

  const _OrderTicketCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.66),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.85),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Order #${order.orderId}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              GlowBadge(
                label: titleCase(order.status.replaceAll('_', ' ')),
                color: order.status == 'ready' || order.status == 'delivered'
                    ? AppTheme.primaryOrange
                    : AppTheme.primaryTurquoise,
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (order.status == 'preparing' && order.etaAt != null) ...[
            const SizedBox(height: 8),
            Text(
              _etaLabel(order.etaAt!),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppTheme.primaryTurquoise,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          if (order.notes.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Your note for the kitchen: ${order.notes}',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ],
          const SizedBox(height: 8),
          ...order.items.map(
            (item) => _OrderTicketLine(
              label: '${item.name} x ${item.qty}',
              value: formatCurrency(item.total),
            ),
          ),
          const SizedBox(height: 4),
          _OrderMilestone(label: 'Accepted', value: order.acceptedAt),
          if (order.preparingAt != null)
            _OrderMilestone(label: 'Preparing', value: order.preparingAt),
          if (order.readyAt != null)
            _OrderMilestone(label: 'Ready', value: order.readyAt),
          if (order.deliveredAt != null)
            _OrderMilestone(label: 'Delivered', value: order.deliveredAt),
          const SizedBox(height: 8),
          Text(
            'Order total ${formatCurrency(order.totalAmount)}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
        ],
      ),
    );
  }
}

String _etaLabel(DateTime etaAt) {
  final remaining = etaAt.toLocal().difference(DateTime.now());
  if (remaining.isNegative) {
    return 'Estimated ready time has passed. The cafe may update this shortly.';
  }
  if (remaining.inMinutes < 1) {
    return 'Estimated ready in less than a minute';
  }
  return 'Estimated ready in ${remaining.inMinutes} min';
}

class _OrderMilestone extends StatelessWidget {
  final String label;
  final DateTime? value;

  const _OrderMilestone({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    if (value == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Text(
        '$label · ${formatDateTime(value!.toLocal())}',
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
      ),
    );
  }
}

class _OrderTicketLine extends StatelessWidget {
  final String label;
  final String value;

  const _OrderTicketLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(value),
        ],
      ),
    );
  }
}
