part of 'profile_screen.dart';

extension _ProfileScreenStateHelpers on _ProfileScreenState {
  String _tierForPoints(int points) {
    if (points >= 5000) return 'Legend';
    if (points >= 2000) return 'Pro';
    if (points >= 500) return 'Regular';
    return 'Starter';
  }

  String _formatBirthday(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return 'Birthday saved';
    const months = [
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
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }

  ImageProvider<Object>? _profileImage(AppUser user) {
    if (_selectedAvatarBytes != null) {
      return MemoryImage(_selectedAvatarBytes!);
    }

    if (_removeAvatar) {
      return null;
    }

    return resolveAppImageProvider(user.avatar);
  }

  List<Booking> _sortedHistoryBookings(List<Booking> bookings) {
    final sorted = List<Booking>.from(bookings);
    sorted.sort((left, right) {
      final leftValue =
          left.startTime ??
          left.bookingDate ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final rightValue =
          right.startTime ??
          right.bookingDate ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final dateCompare = rightValue.compareTo(leftValue);
      if (dateCompare != 0) {
        return dateCompare;
      }
      return right.bookingId.compareTo(left.bookingId);
    });
    return sorted;
  }

  List<Bill> _sortedHistoryBills(List<Bill> bills) {
    final sorted = List<Bill>.from(bills);
    sorted.sort((left, right) {
      final leftValue =
          left.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final rightValue =
          right.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final dateCompare = rightValue.compareTo(leftValue);
      if (dateCompare != 0) {
        return dateCompare;
      }
      return right.billId.compareTo(left.billId);
    });
    return sorted;
  }

  Future<void> _loadHistoryDetailsIfNeeded({bool force = false}) async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final billProvider = context.read<BillProvider>();
    final currentUser = auth.user;
    final token = auth.token;

    if (currentUser == null || token == null || token.isEmpty) {
      return;
    }

    final requests = <Future<void>>[];

    if (force || bookingProvider.bookings.isEmpty) {
      requests.add(
        bookingProvider.loadUserBookings(token: token, userId: currentUser.id),
      );
    }

    if (force || billProvider.bills.isEmpty) {
      requests.add(
        billProvider.loadUserBills(token: token, userId: currentUser.id),
      );
    }

    if (requests.isEmpty) {
      return;
    }

    await Future.wait(requests);
  }

  Future<void> _refreshAccount() async {
    final auth = context.read<AuthProvider>();
    final bookingProvider = context.read<BookingProvider>();
    final billProvider = context.read<BillProvider>();
    final currentUser = auth.user;
    final token = auth.token;

    if (currentUser == null || token == null || token.isEmpty) {
      return;
    }

    await auth.refreshProfile();
    final refreshedUser = auth.user ?? currentUser;
    await Future.wait([
      billProvider.loadUserBills(token: token, userId: refreshedUser.id),
      if (_showHistoryDetails || bookingProvider.bookings.isNotEmpty)
        bookingProvider.loadUserBookings(
          token: token,
          userId: refreshedUser.id,
        ),
    ]);
  }

  String _themeModeLabel(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 'Light';
      case ThemeMode.dark:
        return 'Dark';
      case ThemeMode.system:
        return 'Device';
    }
  }

  Future<void> _openAppearanceSheet() async {
    final themeProvider = context.read<ThemeProvider>();
    final selectedMode = await showModalBottomSheet<ThemeMode>(
      context: context,
      isScrollControlled: true,
      useSafeArea: false,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.56),
      builder: (sheetContext) {
        return _AppearanceThemeSheet(initialMode: themeProvider.mode);
      },
    );

    if (selectedMode == null || selectedMode == themeProvider.mode) {
      return;
    }

    await themeProvider.setMode(selectedMode);
  }

  Future<void> _confirmLogout() async {
    final shouldLogout =
        await showDialog<bool>(
          context: context,
          builder: (dialogContext) {
            return AlertDialog(
              title: const Text('Log out?'),
              content: const Text(
                'You will need to sign in again to access your GameGrub account.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(true),
                  child: const Text('Log out'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!shouldLogout || !mounted) {
      return;
    }

    await context.read<AuthProvider>().logout();
  }

  Future<void> _showAccountOverview(
    BuildContext context,
    AppUser user, {
    required int billsCount,
    required double totalSpend,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        final theme = Theme.of(dialogContext);
        return AlertDialog(
          title: const Text('Account overview'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(user.displayName, style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
              _AccountOverviewLine(label: 'Email', value: user.email),
              _AccountOverviewLine(
                label: 'Membership',
                value: '${_tierForPoints(user.loyaltyPoints)} member',
              ),
              _AccountOverviewLine(
                label: 'Loyalty points',
                value: '${user.loyaltyPoints}',
              ),
              _AccountOverviewLine(
                label: 'Tournament rank',
                value: user.tournamentRank == null
                    ? 'Unranked'
                    : '#${user.tournamentRank}',
              ),
              _AccountOverviewLine(
                label: 'Payments logged',
                value: '$billsCount',
              ),
              _AccountOverviewLine(
                label: 'Lifetime spend',
                value: formatCurrency(totalSpend),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildHistoryGroupHeader(
    BuildContext context, {
    required IconData icon,
    required String title,
    required int count,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.secondaryText),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppTheme.raisedSurface.withValues(alpha: 0.72),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: AppTheme.subtleBorder.withValues(alpha: 0.82),
            ),
          ),
          child: Text(
            '$count',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppTheme.secondaryText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  String _billHistorySubtitle(Bill bill) {
    final details = <String>[
      if (bill.createdAt != null)
        formatDateTime(bill.createdAt)
      else
        'Session bill',
      titleCase((bill.paymentMethod ?? 'unassigned').replaceAll('_', ' ')),
      if (bill.earnedLoyalty > 0) '+${bill.earnedLoyalty} pts earned',
    ];
    return details.join('  |  ');
  }

  Widget _buildHistorySection(
    BuildContext context,
    BookingProvider bookingProvider,
    BillProvider billProvider,
  ) {
    final bookings = _sortedHistoryBookings(bookingProvider.bookings);
    final bills = _sortedHistoryBills(billProvider.bills);
    final isRefreshing = bookingProvider.isLoading || billProvider.isLoading;

    return _AccountSectionCard(
      title: 'History',
      trailing: TextButton(
        onPressed: () => _toggleHistoryDetails(),
        child: Text(_showHistoryDetails ? 'Hide details' : 'Show details'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionIntro(
            text:
                'Your bookings and bill history now lives inside profile. Details stay hidden until you choose to open them.',
          ),
          _AccountMenuRow(
            icon: Icons.history_rounded,
            title: 'Activity archive',
            subtitle: _showHistoryDetails
                ? 'Bookings and bills are expanded below.'
                : 'Details stay hidden until you tap show details.',
            value: _showHistoryDetails ? 'Visible' : 'Hidden',
            onTap: () => _toggleHistoryDetails(),
            showDivider: _showHistoryDetails,
          ),
          if (_showHistoryDetails) ...[
            const SizedBox(height: 18),
            if (isRefreshing)
              Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Row(
                  children: [
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'Refreshing history...',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
            _buildHistoryGroupHeader(
              context,
              icon: Icons.event_note_outlined,
              title: 'Bookings',
              count: bookings.length,
            ),
            const SizedBox(height: 12),
            if (bookingProvider.errorMessage != null && bookings.isEmpty)
              Text(
                bookingProvider.errorMessage!,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
              )
            else if (bookings.isEmpty)
              Text(
                'Your reservations will appear here once you book a setup.',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
              )
            else
              ...bookings.map((booking) => BookingCard(booking: booking)),
            const SizedBox(height: 10),
            _buildHistoryGroupHeader(
              context,
              icon: Icons.receipt_long_outlined,
              title: 'Bills',
              count: bills.length,
            ),
            const SizedBox(height: 12),
            if (billProvider.errorMessage != null && bills.isEmpty)
              Text(
                billProvider.errorMessage!,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
              )
            else if (bills.isEmpty)
              Text(
                'Bills show up here after checkout is completed.',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
              )
            else
              Container(
                decoration: BoxDecoration(
                  color: AppTheme.raisedSurface.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppTheme.subtleBorder.withValues(alpha: 0.82),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  children: bills.asMap().entries.map((entry) {
                    final index = entry.key;
                    final bill = entry.value;
                    return _AccountMenuRow(
                      icon: Icons.receipt_long_outlined,
                      title: 'Bill #${bill.billId}',
                      subtitle: _billHistorySubtitle(bill),
                      value: formatCurrency(bill.finalAmount),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => BillScreen(billId: bill.billId),
                          ),
                        );
                      },
                      showDivider: index != bills.length - 1,
                    );
                  }).toList(),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildDevOtpHint(BuildContext context, String otpCode) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.primaryTurquoise.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.primaryTurquoise.withValues(alpha: 0.24),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Development OTP',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 6),
          Text(otpCode, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            'SMTP is not configured, so the backend returned the code for local testing.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
          ),
        ],
      ),
    );
  }

  Widget _buildPasswordChangePanel(
    BuildContext context,
    AuthProvider auth,
    AppUser user,
  ) {
    return _AccountSectionCard(
      title: 'Security',
      trailing: _showPasswordChange
          ? TextButton(
              onPressed: auth.isLoading
                  ? null
                  : () => _cancelPasswordChangeFlow(auth),
              child: const Text('Close'),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AccountMenuRow(
            icon: Icons.alternate_email_rounded,
            title: 'Protected email',
            value: _maskEmail(user.email),
            showChevron: false,
          ),
          _AccountMenuRow(
            icon: _awaitingPasswordOtp
                ? Icons.verified_user_outlined
                : Icons.lock_reset_outlined,
            title: _awaitingPasswordOtp
                ? 'Verify password change'
                : 'Change password',
            subtitle: _awaitingPasswordOtp
                ? 'Enter the code sent to ${_maskEmail(user.email)}.'
                : 'Approve password updates with an email verification code.',
            value: _showPasswordChange ? 'Open' : 'Start',
            showDivider: _showPasswordChange,
            onTap: auth.isLoading ? null : () => _openPasswordChangeFlow(auth),
          ),
          if (_showPasswordChange) ...[
            const SizedBox(height: 20),
            if (_awaitingPasswordOtp) ...[
              TextField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                onSubmitted: (_) {
                  if (!auth.isLoading) {
                    _verifyPasswordChangeOtp();
                  }
                },
                decoration: buildAppInputDecoration(
                  label: 'Email verification code',
                  hint: 'Enter the 6-digit code',
                  helper:
                      'Use the code sent to your email to approve this password change.',
                  icon: Icons.verified_user_outlined,
                ),
              ),
              if (auth.passwordChangeDevelopmentOtp != null) ...[
                const SizedBox(height: 16),
                _buildDevOtpHint(context, auth.passwordChangeDevelopmentOtp!),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: auth.isLoading
                          ? null
                          : _requestPasswordChangeOtp,
                      child: const Text('Resend code'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: auth.isLoading
                          ? null
                          : _verifyPasswordChangeOtp,
                      icon: auth.isLoading
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check_circle_outline),
                      label: Text(
                        auth.isLoading
                            ? 'Verifying...'
                            : 'Verify password change',
                      ),
                    ),
                  ),
                ],
              ),
            ] else ...[
              TextField(
                controller: _currentPasswordController,
                obscureText: _obscureCurrentPassword,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.password],
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                decoration: buildAppInputDecoration(
                  label: 'Current password',
                  hint: 'Enter your current password',
                  icon: Icons.lock_outline,
                  suffixIcon: IconButton(
                    onPressed: _toggleCurrentPasswordVisibility,
                    icon: Icon(
                      _obscureCurrentPassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _newPasswordController,
                obscureText: _obscureNewPassword,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                onSubmitted: (_) {
                  if (!auth.isLoading) {
                    _requestPasswordChangeOtp();
                  }
                },
                decoration: buildAppInputDecoration(
                  label: 'New password',
                  hint: 'Use at least 8 characters',
                  helper:
                      'Include uppercase, lowercase, a number, and a special character.',
                  icon: Icons.lock_reset_outlined,
                  suffixIcon: IconButton(
                    onPressed: _toggleNewPasswordVisibility,
                    icon: Icon(
                      _obscureNewPassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppTheme.secondaryText),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: auth.isLoading ? null : _requestPasswordChangeOtp,
                  icon: auth.isLoading
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.mark_email_read_outlined),
                  label: Text(
                    auth.isLoading
                        ? 'Sending code...'
                        : 'Send verification code',
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
