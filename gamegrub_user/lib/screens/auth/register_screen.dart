import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_chrome.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final name = TextEditingController();
  final email = TextEditingController();
  final mobile = TextEditingController();
  final password = TextEditingController();
  final otp = TextEditingController();

  bool obscurePassword = true;
  bool _awaitingVerification = false;

  @override
  void dispose() {
    final auth = context.read<AuthProvider>();
    auth.clearPendingRegistration();

    name.dispose();
    email.dispose();
    mobile.dispose();
    password.dispose();
    otp.dispose();
    super.dispose();
  }

  String? _validateRegistration() {
    final trimmedName = name.text.trim();
    final trimmedEmail = email.text.trim();
    final normalizedMobile = mobile.text.trim();
    final trimmedPassword = password.text.trim();
    final emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    final hasStrongPassword =
        trimmedPassword.length >= 8 &&
        RegExp(r'[A-Z]').hasMatch(trimmedPassword) &&
        RegExp(r'[a-z]').hasMatch(trimmedPassword) &&
        RegExp(r'\d').hasMatch(trimmedPassword) &&
        RegExp(r'[^A-Za-z0-9]').hasMatch(trimmedPassword);

    if ([
      trimmedName,
      trimmedEmail,
      normalizedMobile,
      trimmedPassword,
    ].any((value) => value.isEmpty)) {
      return 'Fill all fields before registering.';
    }

    if (!emailPattern.hasMatch(trimmedEmail)) {
      return 'Please enter a valid email address.';
    }

    if (!RegExp(r'^\d{10}$').hasMatch(normalizedMobile)) {
      return 'Mobile number must be exactly 10 digits.';
    }

    if (!hasStrongPassword) {
      return 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
    }

    return null;
  }

  Future<void> _sendVerificationCode() async {
    FocusScope.of(context).unfocus();
    final auth = context.read<AuthProvider>();
    final validationError = _validateRegistration();

    if (validationError != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(validationError)));
      return;
    }

    final success = await auth.register(
      name.text.trim(),
      email.text.trim(),
      mobile.text.trim(),
      password.text.trim(),
    );

    if (!mounted) {
      return;
    }

    if (success) {
      setState(() {
        _awaitingVerification = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Verification code sent to ${auth.pendingRegistrationEmail ?? email.text.trim()}.',
          ),
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(auth.errorMessage ?? 'Unable to send OTP')),
    );
  }

  Future<void> _verifyRegistration() async {
    FocusScope.of(context).unfocus();
    final auth = context.read<AuthProvider>();
    final otpValue = otp.text.trim();

    if (!RegExp(r'^\d{6}$').hasMatch(otpValue)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the 6-digit verification code.')),
      );
      return;
    }

    final success = await auth.verifyRegistrationOtp(otpValue);

    if (!mounted) {
      return;
    }

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Registered successfully. You can log in now.'),
        ),
      );
      Navigator.pop(context);
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(auth.errorMessage ?? 'Verification failed')),
    );
  }

  void _editRegistrationDetails() {
    context.read<AuthProvider>().clearPendingRegistration();
    otp.clear();

    setState(() {
      _awaitingVerification = false;
    });
  }

  Widget _buildShowcasePanel(BuildContext context) {
    return HeroGlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _awaitingVerification ? 'Verify your email' : 'Create your account',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            _awaitingVerification
                ? 'One more step. Enter the code we sent to finish creating your account.'
                : 'Create one account for stations, food, and payments.',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppTheme.secondaryText),
          ),
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

  Widget _buildRegistrationFields(BuildContext context, AuthProvider auth) {
    return AutofillGroup(
      child: Column(
        children: [
          TextField(
            controller: name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.name],
            onTapOutside: (_) => FocusScope.of(context).unfocus(),
            decoration: buildAppInputDecoration(
              label: 'Full name',
              hint: 'Enter your full name',
              icon: Icons.person_outline,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            autocorrect: false,
            enableSuggestions: false,
            inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
            onTapOutside: (_) => FocusScope.of(context).unfocus(),
            decoration: buildAppInputDecoration(
              label: 'Email address',
              hint: 'name@example.com',
              icon: Icons.mail_outline,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: mobile,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.telephoneNumber],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            onTapOutside: (_) => FocusScope.of(context).unfocus(),
            decoration: buildAppInputDecoration(
              label: 'Mobile number',
              hint: '10-digit mobile number',
              helper: 'Used for booking and order updates.',
              icon: Icons.phone_android_outlined,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: password,
            obscureText: obscurePassword,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.newPassword],
            onTapOutside: (_) => FocusScope.of(context).unfocus(),
            onSubmitted: (_) {
              if (!auth.isLoading) {
                _sendVerificationCode();
              }
            },
            decoration: buildAppInputDecoration(
              label: 'Create password',
              hint: 'Use at least 8 characters',
              helper:
                  'Include uppercase, lowercase, a number, and a special character.',
              icon: Icons.lock_outline,
              suffixIcon: IconButton(
                onPressed: () {
                  setState(() {
                    obscurePassword = !obscurePassword;
                  });
                },
                icon: Icon(
                  obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVerificationFields(BuildContext context, AuthProvider auth) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.elevatedSurface.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppTheme.subtleBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Code sent to',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 4),
              Text(
                auth.pendingRegistrationEmail ?? email.text.trim(),
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: otp,
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
              _verifyRegistration();
            }
          },
          decoration: buildAppInputDecoration(
            label: 'Email verification code',
            hint: 'Enter the 6-digit code',
            helper: 'Check your inbox for the one-time verification code.',
            icon: Icons.verified_user_outlined,
          ),
        ),
        if (auth.registrationDevelopmentOtp != null) ...[
          const SizedBox(height: 16),
          _buildDevOtpHint(context, auth.registrationDevelopmentOtp!),
        ],
      ],
    );
  }

  Widget _buildFormPanel(BuildContext context, AuthProvider auth) {
    return GlassPanel(
      padding: const EdgeInsets.all(28),
      glowColor: AppTheme.primaryTurquoise,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('GameGrub', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 18),
          Text(
            _awaitingVerification ? 'Verify email' : 'Create account',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            _awaitingVerification
                ? 'Enter the 6-digit code to finish your signup.'
                : 'Fill in each field so your account details stay clear and consistent.',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppTheme.secondaryText),
          ),
          const SizedBox(height: 24),
          if (_awaitingVerification)
            _buildVerificationFields(context, auth)
          else
            _buildRegistrationFields(context, auth),
          if (auth.errorMessage != null) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppTheme.danger.withValues(alpha: 0.24),
                ),
              ),
              child: Text(
                auth.errorMessage!,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppTheme.primaryText),
              ),
            ),
          ],
          const SizedBox(height: 24),
          if (_awaitingVerification) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.isLoading ? null : _verifyRegistration,
                child: auth.isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Verify and create account'),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: auth.isLoading ? null : _sendVerificationCode,
                child: const Text('Resend code'),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: auth.isLoading ? null : _editRegistrationDetails,
                child: const Text('Edit registration details'),
              ),
            ),
          ] else
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.isLoading ? null : _sendVerificationCode,
                child: auth.isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Send verification code'),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      appBar: AppBar(
        title: Text(_awaitingVerification ? 'Verify email' : 'Create account'),
      ),
      body: AppBackdrop(
        child: SafeArea(
          top: false,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: AppReveal(
                  child: AppResponsiveSplit(
                    primary: _buildShowcasePanel(context),
                    secondary: _buildFormPanel(context, auth),
                    spacing: 20,
                    primaryFlex: 11,
                    secondaryFlex: 10,
                    minPrimaryWidth: 360,
                    minSecondaryWidth: 340,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
