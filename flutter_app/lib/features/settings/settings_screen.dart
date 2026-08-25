import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/biometric_service.dart';
import 'package:go_router/go_router.dart';
import '../../core/services/offline_queue_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

class SettingsScreen extends StatefulWidget {
  final bool isPersonal;

  const SettingsScreen({super.key, this.isPersonal = false});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _deviceAuthEnabled = false;
  bool _canDeviceAuth = false;
  String _appVersion = '';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final availability = await BiometricService.checkDeviceAuthAvailability();
    final enabled = await BiometricService.isDeviceAuthEnabled();
    final packageInfo = await PackageInfo.fromPlatform();

    if (mounted) {
      setState(() {
        _canDeviceAuth = availability == BiometricAvailability.available;
        _deviceAuthEnabled = enabled;
        _appVersion = 'v${packageInfo.version}+${packageInfo.buildNumber}';
      });
    }
  }

  Future<void> _toggleDeviceAuth(bool value) async {
    if (value) {
      final result = await BiometricService.enableDeviceAuthWithResult();

      if (result != BiometricResult.success) {
        if (!mounted) return;

        final message = switch (result) {
          BiometricResult.notAvailable =>
            'Phone authentication is unavailable. Set up a phone PIN, '
                'pattern, password, fingerprint, or face unlock first.',
          BiometricResult.notEnrolled =>
            'Set up a secure screen lock in your phone Settings first.',
          BiometricResult.lockedOut =>
            'Phone authentication is temporarily locked. Unlock your phone '
                'normally, then try again.',
          BiometricResult.permanentlyLockedOut =>
            'Phone authentication is locked. Unlock the phone with its PIN, '
                'pattern, or password, then try again.',
          BiometricResult.cancelled =>
            'Offline sign-in was not enabled because phone authentication '
                'was cancelled.',
          BiometricResult.error =>
            'AgentPro could not open phone authentication. Please try again.',
          BiometricResult.success => '',
        };

        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));

        return;
      }
    } else {
      // This is a local device preference only. Do not use account logout
      // as a side effect of changing the preference.
      await BiometricService.disableDeviceAuth();
    }

    if (mounted) {
      setState(() => _deviceAuthEnabled = value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final Map<String, dynamic> user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};

    final pendingCount = OfflineQueueService.pendingCountForUser(user);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          _ProfileSummaryCard(user: user),
          const SizedBox(height: 20),
          const _SettingsSectionHeader(title: 'Security'),
          _SettingsGroupCard(
            children: [
              if (_canDeviceAuth)
                _SettingsTile(
                  icon: Icons.security,
                  title: 'Offline sign-in',
                  subtitle:
                      'Use your phone PIN, pattern, password or biometrics '
                      'to unlock a saved AgentPro session without internet.',
                  trailing: Switch(
                    value: _deviceAuthEnabled,
                    onChanged: _toggleDeviceAuth,
                    activeThumbColor: AppTheme.primaryColor,
                  ),
                ),
              if (_canDeviceAuth) const _SettingsDivider(),
              _SettingsTile(
                icon: Icons.lock_reset,
                title: 'Change Password',
                subtitle: 'Update your account password securely',
                onTap: () => showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                  builder: (_) => const _ChangePasswordSheet(),
                ),
              ),
              const _SettingsDivider(),
              _SettingsTile(
                icon: Icons.sync,
                title: 'Offline Sync',
                subtitle: pendingCount > 0
                    ? '$pendingCount transaction${pendingCount == 1 ? '' : 's'} pending sync'
                    : 'All synced',
                onTap: () => context.push('/sync'),
              ),
              if (user['personal_subscription_plan'] == null) ...[
                const _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.person_add_outlined,
                  title: 'Add Personal Account',
                  subtitle: 'Use Agent Pro Ghana for your own transactions too',
                  onTap: () =>
                      context.push('/settings/add-personal-capability'),
                ),
              ],
              if (user['company_id'] != null &&
                  user['personal_subscription_plan'] != null) ...[
                const _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.sim_card_outlined,
                  title: 'SIM Purpose',
                  subtitle:
                      'Assign Agent, Subscriber, EVD or Merchant roles to each SIM',
                  onTap: () => context.push('/settings/sim-purpose'),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          const _SettingsSectionHeader(title: 'Quick Actions'),
          _SettingsGroupCard(
            children: [
              if (user['company_id'] != null) ...[
                _SettingsTile(
                  icon: Icons.grid_view_rounded,
                  title: 'Agent Quick Actions',
                  subtitle: 'Customize Agent SIM dashboard shortcuts',
                  onTap: () => context.push('/agent-quick-actions'),
                ),
                const _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.confirmation_number_outlined,
                  title: 'EVD Quick Actions',
                  subtitle: 'Customize EVD SIM dashboard shortcuts',
                  onTap: () => context.push('/evd-quick-actions'),
                ),
                const _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.point_of_sale_outlined,
                  title: 'Merchant Quick Actions',
                  subtitle: 'Customize Merchant SIM dashboard shortcuts',
                  onTap: () => context.push('/merchant-quick-actions'),
                ),
              ],
              if (user['company_id'] != null &&
                  user['personal_subscription_plan'] != null)
                const _SettingsDivider(),
              if (user['personal_subscription_plan'] != null)
                _SettingsTile(
                  icon: Icons.person_outline_rounded,
                  title: 'Subscriber Quick Actions',
                  subtitle: 'Customize your Subscriber dashboard shortcuts',
                  onTap: () => context.push('/personal-quick-actions'),
                ),
            ],
          ),
          const SizedBox(height: 20),
          const _SettingsSectionHeader(title: 'About'),
          _SettingsGroupCard(
            children: [
              _SettingsTile(
                icon: Icons.info_outline,
                title: 'Version',
                subtitle: _appVersion.isEmpty ? '—' : _appVersion,
              ),
              const _SettingsDivider(),
              _SettingsTile(
                icon: Icons.support_agent,
                title: 'Contact Support',
                subtitle: 'Help, guides and contact options',
                onTap: () => context.push(
                  widget.isPersonal
                      ? '/support?mode=personal'
                      : '/support?mode=business',
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const _SettingsSectionHeader(title: 'Session'),
          _SettingsGroupCard(
            children: [
              _SettingsTile(
                icon: Icons.logout,
                iconColor: AppTheme.errorColor,
                title: 'Sign Out',
                titleColor: AppTheme.errorColor,
                subtitle: 'End the current AgentPro session on this device',
                onTap: () => showDialog(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('Sign Out'),
                    content: const Text('Are you sure you want to sign out?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancel'),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.errorColor,
                        ),
                        onPressed: () {
                          Navigator.pop(context);
                          context.read<AuthBloc>().add(AuthLogoutEvent());
                        },
                        child: const Text('Sign Out'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsSectionHeader extends StatelessWidget {
  final String title;

  const _SettingsSectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, right: 2, bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          color: context.appSecondaryText,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _SettingsGroupCard extends StatelessWidget {
  final List<Widget> children;

  const _SettingsGroupCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: context.appSecondaryText.withValues(alpha: 0.10),
        ),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingsDivider extends StatelessWidget {
  const _SettingsDivider();

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: context.appSecondaryText.withValues(alpha: 0.10),
    );
  }
}

class _ProfileSummaryCard extends StatelessWidget {
  final Map<String, dynamic> user;

  const _ProfileSummaryCard({required this.user});

  @override
  Widget build(BuildContext context) {
    final firstName = (user['first_name'] as String?)?.trim() ?? '';
    final lastName = (user['last_name'] as String?)?.trim() ?? '';
    final fullName = '$firstName $lastName'.trim();
    final email = (user['email'] as String?)?.trim() ?? '';
    final role =
        (user['role'] ?? '').toString().replaceAll('_', ' ').toUpperCase();

    final fallbackInitial = fullName.isNotEmpty
        ? fullName[0].toUpperCase()
        : (email.isNotEmpty ? email[0].toUpperCase() : 'U');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: context.appSecondaryText.withValues(alpha: 0.10),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppTheme.primaryColor,
            child: Text(
              fallbackInitial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 20,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  fullName.isEmpty ? 'User' : fullName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  email.isEmpty ? '—' : email,
                  style: TextStyle(
                    color: context.appSecondaryText,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        role.isEmpty ? 'ACCOUNT' : role,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (user['company_id'] != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: context.appTileColor(const Color(0xFFEAF5F2)),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(
                          'Business Mode',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ),
                    if (user['personal_subscription_plan'] != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: context.appTileColor(const Color(0xFFFFF6E5)),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: const Text(
                          'Subscriber Ready',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color? iconColor;
  final Color? titleColor;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.iconColor,
    this.titleColor,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final tile = ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: context.appTileColor(const Color(0xFFEAF5F2)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: iconColor ?? AppTheme.primaryColor),
      ),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w600, color: titleColor),
      ),
      subtitle: subtitle == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                subtitle!,
                style: TextStyle(color: context.appSecondaryText, height: 1.35),
              ),
            ),
      trailing: trailing ??
          (onTap != null ? const Icon(Icons.chevron_right_rounded) : null),
    );

    if (onTap == null) {
      return tile;
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: IgnorePointer(ignoring: trailing is Switch, child: tile),
    );
  }
}

class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet();

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _loading = false;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      // The backend verifies the current password, updates the hash,
      // and revokes all refresh sessions. End this local session
      // immediately as well so the user re-authenticates cleanly.
      await ApiClient.instance.patch(
        '/users/me/password',
        data: {
          'current_password': _currentCtrl.text,
          'new_password': _newCtrl.text,
        },
      );
      if (mounted) {
        final authBloc = context.read<AuthBloc>();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Password changed. Please sign in again.'),
          ),
        );

        Navigator.pop(context);
        authBloc.add(AuthLogoutEvent());
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to change password.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Change Password',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            _PasswordField(
              controller: _currentCtrl,
              label: 'Current Password',
              obscure: _obscureCurrent,
              onToggle: () =>
                  setState(() => _obscureCurrent = !_obscureCurrent),
              validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            _PasswordField(
              controller: _newCtrl,
              label: 'New Password',
              obscure: _obscureNew,
              onToggle: () => setState(() => _obscureNew = !_obscureNew),
              validator: (v) {
                if (v == null || v.length < 8) return 'Min 8 characters';
                if (!v.contains(RegExp(r'[A-Z]'))) {
                  return 'Include an uppercase letter';
                }
                if (!v.contains(RegExp(r'[0-9]'))) return 'Include a number';
                if (v == _currentCtrl.text) {
                  return 'New password must differ from current';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            _PasswordField(
              controller: _confirmCtrl,
              label: 'Confirm New Password',
              obscure: _obscureConfirm,
              onToggle: () =>
                  setState(() => _obscureConfirm = !_obscureConfirm),
              validator: (v) =>
                  v != _newCtrl.text ? 'Passwords do not match' : null,
            ),
            const SizedBox(height: 20),
            AppButton(
              label: 'Change Password',
              onPressed: _submit,
              isLoading: _loading,
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }
}

class _PasswordField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool obscure;
  final VoidCallback onToggle;
  final String? Function(String?)? validator;

  const _PasswordField({
    required this.controller,
    required this.label,
    required this.obscure,
    required this.onToggle,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          icon: Icon(
            obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          ),
          onPressed: onToggle,
        ),
      ),
    );
  }
}
