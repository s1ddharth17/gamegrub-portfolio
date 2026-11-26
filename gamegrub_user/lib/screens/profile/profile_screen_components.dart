part of 'profile_screen.dart';

class _ProfileAvatar extends StatelessWidget {
  final double radius;
  final ImageProvider<Object>? image;
  final String fallbackText;
  final Color? borderColor;
  final Color? backgroundColor;
  final Color? textColor;

  const _ProfileAvatar({
    required this.radius,
    required this.image,
    required this.fallbackText,
    this.borderColor,
    this.backgroundColor,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: borderColor ?? AppTheme.subtleBorder,
          width: 1.5,
        ),
        color: backgroundColor ?? AppTheme.elevatedSurface,
      ),
      child: CircleAvatar(
        radius: radius - 1,
        backgroundColor: backgroundColor ?? AppTheme.elevatedSurface,
        foregroundImage: image,
        child: Text(
          fallbackText,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(color: textColor),
        ),
      ),
    );
  }
}

class _AccountHeroCard extends StatelessWidget {
  final ImageProvider<Object>? image;
  final String fallbackText;
  final String name;
  final String email;
  final String membershipLabel;
  final String pillLabel;
  final bool isEditing;
  final VoidCallback? onEditTap;
  final VoidCallback? onMembershipTap;

  const _AccountHeroCard({
    required this.image,
    required this.fallbackText,
    required this.name,
    required this.email,
    required this.membershipLabel,
    required this.pillLabel,
    required this.isEditing,
    required this.onEditTap,
    required this.onMembershipTap,
  });

  @override
  Widget build(BuildContext context) {
    final heroAccent = Theme.of(context).colorScheme.primary;
    final heroSoft = heroAccent.withValues(alpha: 0.12);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.surface,
            Color.alphaBlend(heroSoft, AppTheme.surface),
          ],
        ),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.92),
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.softShadowColor.withValues(alpha: 0.72),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ProfileAvatar(
                  radius: 38,
                  image: image,
                  fallbackText: fallbackText,
                  borderColor: heroAccent.withValues(alpha: 0.2),
                  backgroundColor: AppTheme.raisedSurface,
                  textColor: heroAccent,
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        email,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: AppTheme.secondaryText,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _HeroPill(
                            icon: Icons.workspace_premium_rounded,
                            label: membershipLabel,
                            accent: heroAccent,
                          ),
                          _HeroPill(
                            icon: Icons.leaderboard_rounded,
                            label: pillLabel,
                            accent: const Color(0xFFF59E0B),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed: onEditTap,
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          foregroundColor: heroAccent,
                        ),
                        child: Text(
                          isEditing ? 'Close editor' : 'Edit profile',
                          style: Theme.of(
                            context,
                          ).textTheme.titleSmall?.copyWith(color: heroAccent),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(
            height: 1,
            thickness: 1,
            color: AppTheme.subtleBorder.withValues(alpha: 0.82),
          ),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onMembershipTap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                child: Row(
                  children: [
                    Icon(
                      Icons.insights_rounded,
                      color: heroAccent.withValues(alpha: 0.78),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Open account overview',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: AppTheme.secondaryText,
                      size: 28,
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

class _AccountSummaryTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final String helper;
  final Color? valueColor;

  const _AccountSummaryTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.helper,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.raisedSurface.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.86),
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.softShadowColor.withValues(alpha: 0.5),
            blurRadius: 14,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: AppTheme.backgroundDeep.withValues(alpha: 0.78),
            ),
            child: Icon(icon, color: AppTheme.secondaryText),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: valueColor ?? AppTheme.primaryText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  helper,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryText,
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

class _AccountSectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? trailing;

  const _AccountSectionCard({
    required this.title,
    required this.child,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final trailingWidgets = trailing == null ? const <Widget>[] : [trailing!];

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: AppTheme.subtleBorder.withValues(alpha: 0.92),
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.softShadowColor.withValues(alpha: 0.52),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              ...trailingWidgets,
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _AccountMenuRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? value;
  final VoidCallback? onTap;
  final bool showChevron;
  final bool showDivider;
  final Color? textColor;
  final Color? iconColor;

  const _AccountMenuRow({
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
    this.onTap,
    this.showChevron = true,
    this.showDivider = true,
    this.textColor,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final titleColor = textColor ?? AppTheme.primaryText;
    final trailingColor = textColor ?? AppTheme.secondaryText;
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        crossAxisAlignment: subtitle == null
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: subtitle == null ? 0 : 2),
            child: Icon(
              icon,
              size: 24,
              color: iconColor ?? AppTheme.secondaryText,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: titleColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.secondaryText,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (value != null)
                Text(
                  value!,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: trailingColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              if (showChevron) ...[
                if (value != null) const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  color: AppTheme.secondaryText,
                  size: 28,
                ),
              ],
            ],
          ),
        ],
      ),
    );

    return Container(
      decoration: BoxDecoration(
        border: showDivider
            ? Border(bottom: BorderSide(color: AppTheme.subtleBorder))
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: rowContent,
        ),
      ),
    );
  }
}

class _HeroPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color accent;

  const _HeroPill({
    required this.icon,
    required this.label,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: accent.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: accent),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: accent,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionIntro extends StatelessWidget {
  final String text;

  const _SectionIntro({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.raisedSurface.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.subtleBorder.withValues(alpha: 0.76),
          ),
        ),
        child: Text(
          text,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
        ),
      ),
    );
  }
}

class _AccountOverviewLine extends StatelessWidget {
  final String label;
  final String value;

  const _AccountOverviewLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _AppearanceThemeSheet extends StatefulWidget {
  final ThemeMode initialMode;

  const _AppearanceThemeSheet({required this.initialMode});

  @override
  State<_AppearanceThemeSheet> createState() => _AppearanceThemeSheetState();
}

class _AppearanceThemeSheetState extends State<_AppearanceThemeSheet> {
  late ThemeMode _selectedMode;

  @override
  void initState() {
    super.initState();
    _selectedMode = widget.initialMode;
  }

  void _selectMode(ThemeMode mode) {
    setState(() {
      _selectedMode = mode;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final bottomPadding = MediaQuery.viewPaddingOf(context).bottom;
    final sheetColor = isDark ? const Color(0xFF121214) : Colors.white;
    final dividerColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : const Color(0xFFF0F1F5);
    final closeColor = isDark
        ? const Color(0xFF27243B)
        : const Color(0xFF2A2740);
    final inactiveRing = isDark
        ? Colors.white.withValues(alpha: 0.22)
        : const Color(0xFFC8CBD6);
    final sheetBottomPadding = bottomPadding > 12 ? bottomPadding + 12 : 24.0;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => Navigator.of(context).pop(),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                width: 82,
                height: 82,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: closeColor,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(
                        alpha: isDark ? 0.28 : 0.18,
                      ),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.close_rounded,
                  color: Colors.white,
                  size: 42,
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Container(
              decoration: BoxDecoration(
                color: sheetColor,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(32),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.24 : 0.12),
                    blurRadius: 28,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(28, 24, 28, sheetBottomPadding),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Appearance',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontSize: 34,
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? Colors.white
                              : const Color(0xFF151515),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Divider(height: 1, color: dividerColor),
                      _AppearanceThemeOptionTile(
                        title: 'Light theme',
                        selected: _selectedMode == ThemeMode.light,
                        dividerColor: dividerColor,
                        inactiveRingColor: inactiveRing,
                        onTap: () => _selectMode(ThemeMode.light),
                      ),
                      _AppearanceThemeOptionTile(
                        title: 'Dark theme',
                        selected: _selectedMode == ThemeMode.dark,
                        dividerColor: dividerColor,
                        inactiveRingColor: inactiveRing,
                        onTap: () => _selectMode(ThemeMode.dark),
                      ),
                      _AppearanceThemeOptionTile(
                        title: 'Use device theme',
                        selected: _selectedMode == ThemeMode.system,
                        showDivider: false,
                        dividerColor: dividerColor,
                        inactiveRingColor: inactiveRing,
                        onTap: () => _selectMode(ThemeMode.system),
                      ),
                      const SizedBox(height: 28),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () =>
                              Navigator.of(context).pop(_selectedMode),
                          style: ElevatedButton.styleFrom(
                            minimumSize: const Size.fromHeight(60),
                            backgroundColor: AppTheme.primaryOrange,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            textStyle: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                          ),
                          child: const Text('Save preference'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AppearanceThemeOptionTile extends StatelessWidget {
  final String title;
  final bool selected;
  final bool showDivider;
  final Color dividerColor;
  final Color inactiveRingColor;
  final VoidCallback onTap;

  const _AppearanceThemeOptionTile({
    required this.title,
    required this.selected,
    required this.dividerColor,
    required this.inactiveRingColor,
    required this.onTap,
    this.showDivider = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: showDivider
            ? Border(bottom: BorderSide(color: dividerColor))
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 26),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontSize: 24,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                _AppearanceThemeRadio(
                  selected: selected,
                  inactiveRingColor: inactiveRingColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AppearanceThemeRadio extends StatelessWidget {
  final bool selected;
  final Color inactiveRingColor;

  const _AppearanceThemeRadio({
    required this.selected,
    required this.inactiveRingColor,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: AppMotion.fast,
      curve: Curves.easeOut,
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? AppTheme.primaryOrange : inactiveRingColor,
          width: 2.8,
        ),
      ),
      child: Center(
        child: AnimatedContainer(
          duration: AppMotion.fast,
          curve: Curves.easeOut,
          width: selected ? 18 : 0,
          height: selected ? 18 : 0,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: AppTheme.primaryOrange,
          ),
        ),
      ),
    );
  }
}
