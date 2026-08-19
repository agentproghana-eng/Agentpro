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

  const SettingsScreen({
    super.key,
    this.isPersonal = false,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _deviceAuthEnabled = false;
  bool _canDeviceAuth = false;
  String _deviceAuthLabel = 'Biometrics';
  String _appVersion = '';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final availability = await BiometricService.checkDeviceAuthAvailability();
    final enabled = await BiometricService.isDeviceAuthEnabled();
    final label = await BiometricService.getDeviceAuthLabel();
    final packageInfo = await PackageInfo.fromPlatform();

    if (mounted) {
      setState(() {
        _canDeviceAuth = availability == BiometricAvailability.available;
        _deviceAuthEnabled = enabled;
        _deviceAuthLabel = label;
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

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
          ),
        );

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

  // Idempotent on the backend (safe even if already added), and only
  // ever reachable from a tile that's already hidden once this
  // succeeds - AuthUpdateUserEvent merges the two returned fields into
  // the cached user without a full re-login, same mechanism already
  // used for self-service settings changes elsewhere in the app.
  Future<void> _addPersonalCapability(BuildContext context) async {
    try {
      final res =
          await ApiClient.instance.post('/auth/add-personal-capability');
      final data = res.data['data'];
      if (context.mounted) {
        context.read<AuthBloc>().add(AuthUpdateUserEvent({
              'personal_subscription_plan': data['personal_subscription_plan'],
              'personal_subscription_expires_at':
                  data['personal_subscription_expires_at'],
            }));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Personal account added! Find it under Switch to Personal Mode.')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to add Personal account'),
            backgroundColor: AppTheme.errorColor));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final Map<String, dynamic> user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        // Profile section
        ListTile(
          leading: CircleAvatar(
            backgroundColor: AppTheme.primaryColor,
            child: Text(
                ((user['first_name'] as String?) ?? 'U')[0].toUpperCase(),
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.bold)),
          ),
          title: Text('${user['first_name'] ?? ''} ${user['last_name'] ?? ''}',
              style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text(user['email'] ?? ''),
          trailing: Chip(
            label: Text(
                (user['role'] ?? '')
                    .toString()
                    .replaceAll('_', ' ')
                    .toUpperCase(),
                style: const TextStyle(fontSize: 10)),
            backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.1),
          ),
        ),
        const Divider(),

        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text('SECURITY',
              style: TextStyle(
                  fontSize: 11,
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1)),
        ),

        if (_canDeviceAuth)
          SwitchListTile(
            secondary: const Icon(
              Icons.security,
              color: AppTheme.primaryColor,
            ),
            title: const Text('Offline sign-in'),
            subtitle: Text(
              'Use $_deviceAuthLabel to unlock a saved AgentPro session '
              'without internet. Available by default after a successful '
              'online sign-in.',
            ),
            value: _deviceAuthEnabled,
            onChanged: _toggleDeviceAuth,
            activeThumbColor: AppTheme.primaryColor,
          ),

        ListTile(
          leading: const Icon(Icons.lock_reset, color: AppTheme.primaryColor),
          title: const Text('Change Password'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            builder: (_) => const _ChangePasswordSheet(),
          ),
        ),

        ListTile(
          leading: const Icon(Icons.sync, color: AppTheme.primaryColor),
          title: const Text('Offline Sync'),
          subtitle: Text(
            OfflineQueueService.pendingCountForUser(user) > 0
                ? '${OfflineQueueService.pendingCountForUser(user)} pending'
                : 'All synced',
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/sync'),
        ),

        // The missing piece that made the Mode Switcher/SIM Purpose
        // tiles below invisible for every existing Business account:
        // there was no way to actually add Personal capability in the
        // first place. Idempotent on the backend, but only shown here
        // when not already present, to avoid a pointless duplicate tap.
        if (user['personal_subscription_plan'] == null)
          ListTile(
            leading: const Icon(Icons.person_add_outlined,
                color: AppTheme.primaryColor),
            title: const Text('Add Personal Account'),
            subtitle:
                const Text('Use Agent Pro Ghana for your own transactions too'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _addPersonalCapability(context),
          ),

        // Only relevant for someone holding both Business and Personal
        // capability at once - a one-sided user has nothing to
        // distinguish between SIMs for.
        if (user['company_id'] != null &&
            user['personal_subscription_plan'] != null)
          ListTile(
            leading: const Icon(Icons.sim_card_outlined,
                color: AppTheme.primaryColor),
            title: const Text('SIM Purpose'),
            subtitle: const Text('Which SIM is for Business vs Personal use'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/sim-purpose'),
          ),

        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text(
            'QUICK ACTIONS',
            style: TextStyle(
              fontSize: 11,
              color: context.appSecondaryText,
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
            ),
          ),
        ),

        if (user['company_id'] != null)
          ListTile(
            leading: const Icon(
              Icons.grid_view_rounded,
              color: AppTheme.primaryColor,
            ),
            title: const Text('Agent Quick Actions'),
            subtitle: const Text(
              'Choose, reorder, rename and change dashboard icons',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/agent-quick-actions'),
          ),

        if (user['personal_subscription_plan'] != null)
          ListTile(
            leading: const Icon(
              Icons.person_outline_rounded,
              color: AppTheme.primaryColor,
            ),
            title: const Text('Personal Quick Actions'),
            subtitle: const Text(
              'Customize your Personal dashboard shortcuts',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/personal-quick-actions'),
          ),

        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text('ABOUT',
              style: TextStyle(
                  fontSize: 11,
                  color: context.appSecondaryText,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1)),
        ),
        ListTile(
          leading: const Icon(Icons.info_outline),
          title: const Text('Version'),
          trailing: Text(
            _appVersion.isEmpty ? '—' : _appVersion,
          ),
        ),
        ListTile(
          leading: const Icon(Icons.support_agent),
          title: const Text('Contact Support'),
          subtitle: const Text('Help, guides and contact options'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(
            widget.isPersonal
                ? '/support?mode=personal'
                : '/support?mode=business',
          ),
        ),

        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: AppTheme.errorColor),
          title: const Text('Sign Out',
              style: TextStyle(color: AppTheme.errorColor)),
          onTap: () => showDialog(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Sign Out'),
              content: const Text('Are you sure you want to sign out?'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel')),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.errorColor),
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
      ]),
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
      await ApiClient.instance.patch('/users/me/password', data: {
        'current_password': _currentCtrl.text,
        'new_password': _newCtrl.text,
      });
      if (mounted) {
        final authBloc = context.read<AuthBloc>();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Password changed. Please sign in again.',
            ),
          ),
        );

        Navigator.pop(context);
        authBloc.add(AuthLogoutEvent());
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? 'Failed to change password.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(msg), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Change Password',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
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
                isLoading: _loading),
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
          icon: Icon(obscure
              ? Icons.visibility_outlined
              : Icons.visibility_off_outlined),
          onPressed: onToggle,
        ),
      ),
    );
  }
}
