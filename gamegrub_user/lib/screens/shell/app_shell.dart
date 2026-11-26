import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/business_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_chrome.dart';
import '../game_guru/game_guru_screen.dart';
import '../home/cafe_marketplace_screen.dart';
import '../profile/profile_screen.dart';
import '../session/session_screen.dart';
import '../tournaments/tournament_screen.dart';

class AppShellScreen extends StatefulWidget {
  const AppShellScreen({super.key});

  @override
  State<AppShellScreen> createState() => _AppShellScreenState();
}

class _AppShellScreenState extends State<AppShellScreen> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    context.read<BusinessProvider>().loadBusinesses();
  }

  static const List<_ShellNavItemData> _items = [
    _ShellNavItemData(
      label: 'Home',
      subtitle: 'Find your next arena',
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
    ),
    _ShellNavItemData(
      label: 'Events',
      subtitle: 'Join brackets',
      icon: Icons.emoji_events_outlined,
      activeIcon: Icons.emoji_events,
    ),
    _ShellNavItemData(
      label: 'Guru',
      subtitle: 'Ask the bot',
      icon: Icons.auto_awesome_outlined,
      activeIcon: Icons.auto_awesome,
    ),
    _ShellNavItemData(
      label: 'Session',
      subtitle: 'Track live play',
      icon: Icons.sports_esports_outlined,
      activeIcon: Icons.sports_esports,
    ),
    _ShellNavItemData(
      label: 'Profile',
      subtitle: 'Account and stats',
      icon: Icons.person_outline,
      activeIcon: Icons.person,
    ),
  ];

  Widget _screenForIndex(int index) {
    switch (index) {
      case 0:
        return const CafeMarketplaceScreen();
      case 1:
        return const TournamentScreen();
      case 2:
        return const GameGuruScreen();
      case 3:
        return const SessionScreen();
      case 4:
        return const ProfileScreen();
      default:
        return const CafeMarketplaceScreen();
    }
  }

  Widget _buildScreenSwitcher() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 360),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        final slide = Tween<Offset>(
          begin: const Offset(0.05, 0),
          end: Offset.zero,
        ).animate(animation);
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: slide, child: child),
        );
      },
      child: KeyedSubtree(
        key: ValueKey(_currentIndex),
        child: _screenForIndex(_currentIndex),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isWide = MediaQuery.sizeOf(context).width >= 1120;

    if (isWide) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: AppBackdrop(
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
              child: Row(
                children: [
                  SizedBox(
                    width: 278,
                    child: _DesktopShellRail(
                      auth: auth,
                      items: _items,
                      currentIndex: _currentIndex,
                      onSelect: (index) {
                        setState(() {
                          _currentIndex = index;
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: GlassPanel(
                      padding: EdgeInsets.zero,
                      blur: AppTheme.isDark ? 14 : 0,
                      shadowStrength: 1.15,
                      borderRadius: const BorderRadius.all(Radius.circular(34)),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(34),
                        child: _buildScreenSwitcher(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(bottom: false, child: _buildScreenSwitcher()),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 10, 16, 18),
        child: GlassPanel(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          borderRadius: const BorderRadius.all(Radius.circular(34)),
          blur: AppTheme.isDark ? 16 : 0,
          shadowStrength: 1.32,
          child: Row(
            children: List.generate(_items.length, (index) {
              final item = _items[index];
              return Expanded(
                child: _MobileShellNavItem(
                  data: item,
                  selected: _currentIndex == index,
                  onTap: () {
                    setState(() {
                      _currentIndex = index;
                    });
                  },
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _ShellNavItemData {
  final String label;
  final String subtitle;
  final IconData icon;
  final IconData activeIcon;

  const _ShellNavItemData({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.activeIcon,
  });
}

class _DesktopShellRail extends StatelessWidget {
  final AuthProvider auth;
  final List<_ShellNavItemData> items;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  const _DesktopShellRail({
    required this.auth,
    required this.items,
    required this.currentIndex,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final user = auth.user;
    final avatar = user == null ? null : resolveAppImageProvider(user.avatar);
    final firstName = user?.name.trim().split(' ').first ?? 'Player';
    final subtitle = user?.gamerTag.trim().isNotEmpty == true
        ? user!.gamerTag
        : 'Ready for the next queue';

    return GlassPanel(
      blur: 14,
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppIconOrb(
                icon: Icons.sports_esports_rounded,
                accent: AppTheme.primaryOrange,
                size: 54,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'GameGrub',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Gaming cafe hub',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.surface.withValues(alpha: 0.54),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: AppTheme.subtleBorder.withValues(alpha: 0.92),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppTheme.subtleBorder.withValues(alpha: 0.92),
                    ),
                    color: AppTheme.elevatedSurface,
                  ),
                  child: CircleAvatar(
                    backgroundColor: AppTheme.elevatedSurface,
                    foregroundImage: avatar,
                    child: Text(
                      firstName.isEmpty ? 'P' : firstName[0].toUpperCase(),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        firstName,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              StatChip(
                label: 'Tokens',
                value: '${user?.loyaltyPoints ?? 0}',
                accent: AppTheme.primaryOrange,
                icon: Icons.workspace_premium_outlined,
              ),
              StatChip(
                label: 'Mode',
                value: items[currentIndex].label,
                accent: AppTheme.primaryTurquoise,
                icon: items[currentIndex].activeIcon,
              ),
            ],
          ),
          const SizedBox(height: 16),
          const AppThemeToggle(showLabel: true),
          const SizedBox(height: 24),
          Text(
            'Navigate',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppTheme.secondaryText,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: ListView.separated(
              padding: EdgeInsets.zero,
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = items[index];
                return _DesktopShellNavItem(
                  data: item,
                  selected: currentIndex == index,
                  onTap: () => onSelect(index),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DesktopShellNavItem extends StatelessWidget {
  final _ShellNavItemData data;
  final bool selected;
  final VoidCallback onTap;

  const _DesktopShellNavItem({
    required this.data,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = selected
        ? AppTheme.primaryOrange
        : AppTheme.primaryTurquoise;

    return AppInteractiveSurface(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(24)),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          color: selected
              ? accent.withValues(alpha: 0.12)
              : AppTheme.elevatedSurface.withValues(alpha: 0.82),
          border: Border.all(
            color: selected
                ? accent.withValues(alpha: 0.24)
                : AppTheme.subtleBorder.withValues(alpha: 0.9),
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: accent.withValues(alpha: 0.12),
                    blurRadius: 30,
                    spreadRadius: -22,
                    offset: const Offset(0, 18),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            AppIconOrb(
              icon: selected ? data.activeIcon : data.icon,
              accent: accent,
              size: 44,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.label,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: selected
                          ? AppTheme.primaryText
                          : AppTheme.primaryText.withValues(alpha: 0.9),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    data.subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.arrow_forward_ios_rounded,
              size: 14,
              color: selected
                  ? AppTheme.primaryOrange
                  : AppTheme.secondaryText.withValues(alpha: 0.8),
            ),
          ],
        ),
      ),
    );
  }
}

class _MobileShellNavItem extends StatelessWidget {
  final _ShellNavItemData data;
  final bool selected;
  final VoidCallback onTap;

  const _MobileShellNavItem({
    required this.data,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = selected ? AppTheme.primaryOrange : AppTheme.secondaryText;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              color: selected
                  ? AppTheme.primaryOrange.withValues(alpha: 0.12)
                  : Colors.transparent,
              border: Border.all(
                color: selected
                    ? AppTheme.primaryOrange.withValues(alpha: 0.16)
                    : Colors.transparent,
              ),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: AppTheme.primaryOrange.withValues(alpha: 0.1),
                        blurRadius: 18,
                        spreadRadius: -14,
                        offset: const Offset(0, 10),
                      ),
                    ]
                  : null,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: selected
                        ? Colors.white.withValues(alpha: 0.98)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected
                          ? AppTheme.primaryOrange.withValues(alpha: 0.12)
                          : Colors.transparent,
                    ),
                  ),
                  child: Icon(
                    selected ? data.activeIcon : data.icon,
                    size: 18,
                    color: accent,
                  ),
                ),
                const SizedBox(height: 5),
                SizedBox(
                  width: double.infinity,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      data.label,
                      maxLines: 1,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: accent,
                        fontSize: 10.8,
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w600,
                        height: 1,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
