import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/bill.dart';
import '../../models/booking.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../providers/bill_provider.dart';
import '../../providers/booking_provider.dart';
import '../../providers/business_provider.dart';
import '../../providers/theme_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_formatters.dart';
import '../../widgets/app_chrome.dart';
import '../../widgets/booking_card.dart';
import '../bill/bill_screen.dart';
import 'notification_center_screen.dart';
import '../support/support_center_screen.dart';
import 'loyalty_program_screen.dart';

part 'profile_screen_helpers.dart';
part 'profile_screen_components.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _mobileController = TextEditingController();
  final _gamerTagController = TextEditingController();
  final _favoriteGameController = TextEditingController();
  final _playerBioController = TextEditingController();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _otpController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  Uint8List? _selectedAvatarBytes;
  String? _selectedAvatarName;
  String _dateOfBirth = '';
  bool _removeAvatar = false;
  bool _isEditing = false;
  bool _showPasswordChange = false;
  bool _awaitingPasswordOtp = false;
  bool _obscureCurrentPassword = true;
  bool _obscureNewPassword = true;
  bool _showHistoryDetails = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthProvider>();
    final billProvider = context.read<BillProvider>();

    if (auth.user != null) {
      _hydrateForm(auth.user!);
    }

    Future.microtask(() {
      final token = auth.token;
      if (auth.user != null && token != null && token.isNotEmpty) {
        auth.refreshProfile();
      }
      if (auth.user != null &&
          token != null &&
          token.isNotEmpty &&
          billProvider.bills.isEmpty) {
        billProvider.loadUserBills(token: token, userId: auth.user!.id);
      }
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _mobileController.dispose();
    _gamerTagController.dispose();
    _favoriteGameController.dispose();
    _playerBioController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  void _hydrateForm(AppUser user) {
    _nameController.text = user.name;
    _emailController.text = user.email;
    _mobileController.text = user.mobile;
    _gamerTagController.text = user.gamerTag;
    _favoriteGameController.text = user.favoriteGame;
    _playerBioController.text = user.playerBio;
    _dateOfBirth = user.dateOfBirth;
    _selectedAvatarBytes = null;
    _selectedAvatarName = null;
    _removeAvatar = false;
  }

  void _startEditing(AppUser user) {
    _hydrateForm(user);
    setState(() {
      _isEditing = true;
    });
  }

  void _cancelEditing(AppUser user) {
    FocusScope.of(context).unfocus();
    _hydrateForm(user);
    setState(() {
      _isEditing = false;
    });
  }

  Future<void> _pickAvatar() async {
    final pickedFile = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1024,
      maxHeight: 1024,
    );

    if (pickedFile == null) {
      return;
    }

    final bytes = await pickedFile.readAsBytes();

    if (!mounted) {
      return;
    }

    setState(() {
      _selectedAvatarBytes = bytes;
      _selectedAvatarName = pickedFile.name;
      _removeAvatar = false;
    });
  }

  void _markAvatarForRemoval() {
    setState(() {
      _selectedAvatarBytes = null;
      _selectedAvatarName = null;
      _removeAvatar = true;
    });
  }

  String? _validateProfile() {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final mobile = _mobileController.text.trim();
    final emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

    if (name.isEmpty) {
      return 'Please enter your name.';
    }

    if (!emailPattern.hasMatch(email)) {
      return 'Please enter a valid email address.';
    }

    if (!RegExp(r'^\d{10}$').hasMatch(mobile)) {
      return 'Mobile number must be exactly 10 digits.';
    }

    if (_gamerTagController.text.trim().length > 64) {
      return 'Gamer tag must be 64 characters or fewer.';
    }

    if (_favoriteGameController.text.trim().length > 120) {
      return 'Favorite game must be 120 characters or fewer.';
    }

    if (_playerBioController.text.trim().length > 500) {
      return 'Bio must be 500 characters or fewer.';
    }

    return null;
  }

  String _maskEmail(String email) {
    final parts = email.trim().split('@');

    if (parts.length != 2) {
      return email.trim();
    }

    final local = parts[0];
    final domain = parts[1];

    if (local.length <= 2) {
      return '${local[0]}*@$domain';
    }

    return '${local.substring(0, 2)}${'*' * (local.length - 2)}@$domain';
  }

  String? _validatePasswordChange() {
    final currentPassword = _currentPasswordController.text.trim();
    final newPassword = _newPasswordController.text.trim();
    final hasStrongPassword =
        newPassword.length >= 8 &&
        RegExp(r'[A-Z]').hasMatch(newPassword) &&
        RegExp(r'[a-z]').hasMatch(newPassword) &&
        RegExp(r'\d').hasMatch(newPassword) &&
        RegExp(r'[^A-Za-z0-9]').hasMatch(newPassword);

    if (currentPassword.isEmpty || newPassword.isEmpty) {
      return 'Enter your current password and a new password.';
    }

    if (!hasStrongPassword) {
      return 'New password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
    }

    if (currentPassword == newPassword) {
      return 'New password must be different from your current password.';
    }

    return null;
  }

  void _cancelPasswordChangeFlow(AuthProvider auth) {
    FocusScope.of(context).unfocus();
    auth.clearPendingPasswordChange();
    _currentPasswordController.clear();
    _newPasswordController.clear();
    _otpController.clear();

    setState(() {
      _showPasswordChange = false;
      _awaitingPasswordOtp = false;
      _obscureCurrentPassword = true;
      _obscureNewPassword = true;
    });
  }

  void _openPasswordChangeFlow(AuthProvider auth) {
    if (_showPasswordChange) {
      return;
    }

    auth.clearError();
    setState(() {
      _showPasswordChange = true;
      _awaitingPasswordOtp = false;
    });
  }

  void _toggleCurrentPasswordVisibility() {
    setState(() {
      _obscureCurrentPassword = !_obscureCurrentPassword;
    });
  }

  void _toggleNewPasswordVisibility() {
    setState(() {
      _obscureNewPassword = !_obscureNewPassword;
    });
  }

  Future<void> _toggleHistoryDetails() async {
    final shouldShow = !_showHistoryDetails;

    setState(() {
      _showHistoryDetails = shouldShow;
    });

    if (shouldShow) {
      await _loadHistoryDetailsIfNeeded();
    }
  }

  Future<void> _requestPasswordChangeOtp() async {
    final validationError = _validatePasswordChange();

    if (validationError != null) {
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(validationError)));
      return;
    }

    FocusScope.of(context).unfocus();
    final auth = context.read<AuthProvider>();
    final success = await auth.requestPasswordChangeOtp(
      currentPassword: _currentPasswordController.text.trim(),
      newPassword: _newPasswordController.text.trim(),
    );

    if (!mounted) {
      return;
    }

    if (success) {
      setState(() {
        _awaitingPasswordOtp = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Verification code sent to ${_maskEmail(auth.user?.email ?? _emailController.text.trim())}.',
          ),
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(auth.errorMessage ?? 'Unable to send verification code.'),
      ),
    );
  }

  Future<void> _verifyPasswordChangeOtp() async {
    final otpValue = _otpController.text.trim();

    if (!RegExp(r'^\d{6}$').hasMatch(otpValue)) {
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the 6-digit verification code.')),
      );
      return;
    }

    FocusScope.of(context).unfocus();
    final auth = context.read<AuthProvider>();
    final success = await auth.verifyPasswordChangeOtp(otpValue);

    if (!mounted) {
      return;
    }

    if (success) {
      _cancelPasswordChangeFlow(auth);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password changed successfully.')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(auth.errorMessage ?? 'Unable to verify password change.'),
      ),
    );
  }

  Future<void> _saveProfile() async {
    final validationError = _validateProfile();

    if (validationError != null) {
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(validationError)));
      return;
    }

    FocusScope.of(context).unfocus();
    final auth = context.read<AuthProvider>();
    final success = await auth.updateProfile(
      name: _nameController.text.trim(),
      email: _emailController.text.trim(),
      mobile: _mobileController.text.trim(),
      gamerTag: _gamerTagController.text.trim(),
      favoriteGame: _favoriteGameController.text.trim(),
      playerBio: _playerBioController.text.trim(),
      dateOfBirth: _dateOfBirth,
      avatarBytes: _selectedAvatarBytes,
      avatarFileName: _selectedAvatarName,
      removeAvatar: _removeAvatar,
    );

    if (!mounted) {
      return;
    }

    if (success && auth.user != null) {
      _hydrateForm(auth.user!);
      setState(() {
        _isEditing = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated successfully.')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(auth.errorMessage ?? 'Unable to update profile.')),
    );
  }

  Future<void> _chooseBirthday() async {
    if (_dateOfBirth.isNotEmpty) return;
    final now = DateTime.now();
    final lastEligibleDate = DateTime(now.year - 13, now.month, now.day);
    final initialDate = DateTime(now.year - 18, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate.isAfter(lastEligibleDate)
          ? lastEligibleDate
          : initialDate,
      firstDate: DateTime(now.year - 120, 1, 1),
      lastDate: lastEligibleDate,
      helpText: 'Choose your birthday',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _dateOfBirth =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final billProvider = context.watch<BillProvider>();
    final bookingProvider = context.watch<BookingProvider>();
    final bills = billProvider.bills;
    final theme = context.watch<ThemeProvider>();
    final user = auth.user;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('No user profile found.')),
      );
    }

    if (!_isEditing) {
      _hydrateForm(user);
    }

    final totalSpend = bills.fold<double>(
      0,
      (sum, bill) => sum + bill.finalAmount,
    );
    final averageTicket = bills.isEmpty ? 0.0 : totalSpend / bills.length;
    final avatarImage = _profileImage(user);
    final hasAvatarPreview =
        _selectedAvatarBytes != null || user.avatarUrl.isNotEmpty;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppTheme.primaryOrange,
          onRefresh: _refreshAccount,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
            children: [
              Text(
                'Profile',
                style: Theme.of(
                  context,
                ).textTheme.headlineSmall?.copyWith(fontSize: 28),
              ),
              const SizedBox(height: 4),
              Text(
                'Keep your account, rewards, and tournament identity clean and up to date.',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.secondaryText),
              ),
              const SizedBox(height: 20),
              _AccountHeroCard(
                image: avatarImage,
                fallbackText: user.name.isEmpty
                    ? 'G'
                    : user.name[0].toUpperCase(),
                name: user.name,
                email: user.email,
                membershipLabel: '${_tierForPoints(user.loyaltyPoints)} member',
                pillLabel: user.tournamentRank == null
                    ? '${user.loyaltyPoints} pts'
                    : 'Rank #${user.tournamentRank}',
                isEditing: _isEditing,
                onEditTap: auth.isLoading
                    ? null
                    : () {
                        if (_isEditing) {
                          _cancelEditing(user);
                          return;
                        }
                        _startEditing(user);
                      },
                onMembershipTap: () => _showAccountOverview(
                  context,
                  user,
                  billsCount: bills.length,
                  totalSpend: totalSpend,
                ),
              ),
              const SizedBox(height: 16),
              LayoutBuilder(
                builder: (context, constraints) {
                  final hasThreeColumns = constraints.maxWidth >= 980;
                  final tileWidth = hasThreeColumns
                      ? (constraints.maxWidth - 24) / 3
                      : constraints.maxWidth >= 640
                      ? (constraints.maxWidth - 12) / 2
                      : constraints.maxWidth;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      SizedBox(
                        width: tileWidth,
                        child: _AccountSummaryTile(
                          icon: Icons.stars_rounded,
                          title: 'GameGrub points',
                          value: '${user.loyaltyPoints}',
                          helper: '${_tierForPoints(user.loyaltyPoints)} tier',
                          valueColor: const Color(0xFF059669),
                        ),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: _AccountSummaryTile(
                          icon: Icons.emoji_events_outlined,
                          title: 'Tournament rank',
                          value: user.tournamentRank == null
                              ? 'Unranked'
                              : '#${user.tournamentRank}',
                          helper: '${user.tournamentPoints} pts',
                          valueColor: const Color(0xFFB8860B),
                        ),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: _AccountSummaryTile(
                          icon: Icons.payments_outlined,
                          title: 'Lifetime spend',
                          value: formatCurrency(totalSpend),
                          helper: '${bills.length} bills logged',
                          valueColor: AppTheme.primaryOrange,
                        ),
                      ),
                    ],
                  );
                },
              ),
              if (_isEditing) ...[
                const SizedBox(height: 18),
                _AccountSectionCard(
                  title: 'Account details',
                  trailing: auth.isLoading
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : TextButton(
                          onPressed: auth.isLoading
                              ? null
                              : () => _cancelEditing(user),
                          child: const Text('Close'),
                        ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Column(
                          children: [
                            _ProfileAvatar(
                              radius: 42,
                              image: avatarImage,
                              fallbackText: user.name.isEmpty
                                  ? 'G'
                                  : user.name[0].toUpperCase(),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 10,
                              runSpacing: 10,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: auth.isLoading
                                      ? null
                                      : _pickAvatar,
                                  icon: const Icon(
                                    Icons.photo_library_outlined,
                                  ),
                                  label: Text(
                                    hasAvatarPreview && !_removeAvatar
                                        ? 'Change avatar'
                                        : 'Add avatar',
                                  ),
                                ),
                                if (hasAvatarPreview && !_removeAvatar)
                                  TextButton.icon(
                                    onPressed: auth.isLoading
                                        ? null
                                        : _markAvatarForRemoval,
                                    icon: const Icon(Icons.delete_outline),
                                    label: const Text('Remove photo'),
                                  ),
                              ],
                            ),
                            if (_selectedAvatarName != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _selectedAvatarName!,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: AppTheme.secondaryText),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: _nameController,
                        textInputAction: TextInputAction.next,
                        textCapitalization: TextCapitalization.words,
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Full name',
                          hint: 'Enter your full name',
                          icon: Icons.person_outline,
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        enableSuggestions: false,
                        inputFormatters: [
                          FilteringTextInputFormatter.deny(RegExp(r'\s')),
                        ],
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Email address',
                          hint: 'name@example.com',
                          icon: Icons.mail_outline,
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _mobileController,
                        keyboardType: TextInputType.phone,
                        textInputAction: TextInputAction.next,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(10),
                        ],
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Mobile number',
                          hint: '10-digit mobile number',
                          helper: 'Used for booking and tournament contact.',
                          icon: Icons.phone_android_outlined,
                        ),
                      ),
                      const SizedBox(height: 14),
                      InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: _dateOfBirth.isEmpty ? _chooseBirthday : null,
                        child: InputDecorator(
                          decoration: buildAppInputDecoration(
                            label: 'Birthday',
                            hint: 'Add your birthday',
                            helper: _dateOfBirth.isEmpty
                                ? 'Set once for your annual birthday reward. Your birthday is not public.'
                                : 'Birthday is saved and locked for reward safety.',
                            icon: Icons.cake_outlined,
                          ),
                          child: Text(
                            _dateOfBirth.isEmpty
                                ? 'Choose a date'
                                : _formatBirthday(_dateOfBirth),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _gamerTagController,
                        textInputAction: TextInputAction.next,
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Gamer tag',
                          hint: 'Enter the name other players know you by',
                          icon: Icons.videogame_asset_outlined,
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _favoriteGameController,
                        textInputAction: TextInputAction.next,
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Favorite game',
                          hint: 'Example: Valorant',
                          icon: Icons.sports_esports_outlined,
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _playerBioController,
                        textCapitalization: TextCapitalization.sentences,
                        minLines: 3,
                        maxLines: 5,
                        onTapOutside: (_) => FocusScope.of(context).unfocus(),
                        decoration: buildAppInputDecoration(
                          label: 'Tournament bio',
                          hint:
                              'Add a short intro for tournaments and your player card',
                          helper:
                              'Keep it short and clear so your profile is easy to scan.',
                          icon: Icons.description_outlined,
                          alignLabelWithHint: true,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: auth.isLoading
                                  ? null
                                  : () => _cancelEditing(user),
                              child: const Text('Discard'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: auth.isLoading ? null : _saveProfile,
                              icon: auth.isLoading
                                  ? const SizedBox(
                                      height: 18,
                                      width: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.save_outlined),
                              label: Text(
                                auth.isLoading ? 'Saving...' : 'Save changes',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 18),
              _AccountSectionCard(
                title: 'Account',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _SectionIntro(
                      text:
                          'Edit your contact details, player preferences, and appearance settings from one place.',
                    ),
                    _AccountMenuRow(
                      icon: Icons.person_outline_rounded,
                      title: 'Profile details',
                      subtitle: user.email,
                      value: _isEditing ? 'Open' : 'Edit',
                      onTap: auth.isLoading
                          ? null
                          : () {
                              if (_isEditing) {
                                return;
                              }
                              _startEditing(user);
                            },
                    ),
                    _AccountMenuRow(
                      icon: Icons.phone_iphone_rounded,
                      title: 'Mobile number',
                      value: user.mobile.isEmpty ? 'Not set' : user.mobile,
                      onTap: auth.isLoading
                          ? null
                          : () {
                              if (_isEditing) {
                                return;
                              }
                              _startEditing(user);
                            },
                    ),
                    _AccountMenuRow(
                      icon: Icons.sports_esports_outlined,
                      title: 'Favorite game',
                      value: user.favoriteGame.isEmpty
                          ? 'Not set'
                          : user.favoriteGame,
                      onTap: auth.isLoading
                          ? null
                          : () {
                              if (_isEditing) {
                                return;
                              }
                              _startEditing(user);
                            },
                    ),
                    _AccountMenuRow(
                      icon: Icons.palette_outlined,
                      title: 'Appearance',
                      value: _themeModeLabel(theme.mode),
                      onTap: _openAppearanceSheet,
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _AccountSectionCard(
                title: 'Rewards & billing',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _SectionIntro(
                      text:
                          'Quick stats for loyalty, spending, and billing without repeating the same numbers in multiple places.',
                    ),
                    _AccountMenuRow(
                      icon: Icons.workspace_premium_outlined,
                      title: 'Membership tier',
                      value: _tierForPoints(user.loyaltyPoints),
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.stars_rounded,
                      title: 'Loyalty points',
                      value: '${user.loyaltyPoints} pts',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.card_giftcard_outlined,
                      title: 'Loyalty program',
                      subtitle:
                          'Referrals, visit streaks, achievements, challenges, and points history.',
                      value: 'Open',
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => LoyaltyProgramScreen(),
                          ),
                        );
                      },
                    ),
                    _AccountMenuRow(
                      icon: Icons.receipt_long_outlined,
                      title: 'Bills logged',
                      value: '${bills.length}',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.payments_outlined,
                      title: 'Lifetime spend',
                      value: formatCurrency(totalSpend),
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.bar_chart_rounded,
                      title: 'Average bill',
                      value: formatCurrency(averageTicket),
                      showChevron: false,
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildPasswordChangePanel(context, auth, user),
              const SizedBox(height: 16),
              _AccountSectionCard(
                title: 'Gaming identity',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _SectionIntro(
                      text:
                          'This is the public-facing side of your player profile for tournaments and competitive events.',
                    ),
                    _AccountMenuRow(
                      icon: Icons.badge_outlined,
                      title: 'Display name',
                      value: user.displayName,
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.emoji_events_outlined,
                      title: 'Tournament rank',
                      value: user.tournamentRank == null
                          ? 'Unranked'
                          : '#${user.tournamentRank}',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.local_fire_department_outlined,
                      title: 'Tournament points',
                      value: '${user.tournamentPoints}',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.timeline_rounded,
                      title: 'Match win rate',
                      value: '${user.tournamentWinRate.toStringAsFixed(1)}%',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.sports_martial_arts_outlined,
                      title: 'Match record',
                      value:
                          '${user.tournamentMatchWins}-${user.tournamentMatchLosses}',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.military_tech_outlined,
                      title: 'Championships',
                      value: '${user.tournamentChampionships}',
                      showChevron: false,
                    ),
                    _AccountMenuRow(
                      icon: Icons.history_toggle_off_outlined,
                      title: 'Last tournament',
                      value: user.lastTournamentAt.isEmpty
                          ? 'No activity'
                          : formatDateTime(
                              DateTime.tryParse(user.lastTournamentAt),
                            ),
                      showChevron: false,
                      showDivider: user.playerBio.isNotEmpty,
                    ),
                    if (user.playerBio.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundDeep,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Bio',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              user.playerBio,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppTheme.secondaryText),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildHistorySection(context, bookingProvider, billProvider),
              const SizedBox(height: 16),
              _AccountSectionCard(
                title: 'More',
                child: Column(
                  children: [
                    _AccountMenuRow(
                      icon: Icons.info_outline_rounded,
                      title: 'About your account',
                      subtitle: 'View your membership snapshot',
                      onTap: () => _showAccountOverview(
                        context,
                        user,
                        billsCount: bills.length,
                        totalSpend: totalSpend,
                      ),
                    ),
                    _AccountMenuRow(
                      icon: Icons.refresh_rounded,
                      title: 'Refresh profile',
                      subtitle: 'Pull the latest account and billing data',
                      onTap: _refreshAccount,
                    ),
                    _AccountMenuRow(
                      icon: Icons.notifications_outlined,
                      title: 'Notifications',
                      subtitle: 'Inbox, push, and reminder preferences',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const NotificationCenterScreen(),
                        ),
                      ),
                    ),
                    _AccountMenuRow(
                      icon: Icons.support_agent_outlined,
                      title: 'Help & support',
                      subtitle:
                          'FAQs, cafe contacts, and your support requests',
                      onTap: () {
                        final business = context
                            .read<BusinessProvider>()
                            .selectedBusiness;
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => SupportCenterScreen(
                              businessId: business?.id,
                              businessName: business?.name,
                            ),
                          ),
                        );
                      },
                    ),
                    _AccountMenuRow(
                      icon: Icons.logout_rounded,
                      title: 'Log out',
                      value: 'Sign out',
                      textColor: AppTheme.danger,
                      iconColor: AppTheme.danger,
                      onTap: _confirmLogout,
                      showDivider: false,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
