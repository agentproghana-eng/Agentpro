import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/storage_service.dart';
import '../../core/services/biometric_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _biometricEnabled = false;
  bool _canBiometric = false;
  String _biometricLabel = 'Biometrics';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final availability = await BiometricService.checkAvailability();
    final enabled = await BiometricService.isBiometricEnabled();
    final label = await BiometricService.getBiometricLabel();
    if (mounted) {
      setState(() {
        _canBiometric = availability == BiometricAvailability.available;
        _biometricEnabled = enabled;
        _biometricLabel = label;
      });
    }
  }

  Future<void> _toggleBiometric(bool value) async {
    if (value) {
      final success = await BiometricService.enableBiometric();
      if (!success) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not verify your biometrics. Please try again.')),
          );
        }
        return;
      }
    } else {
      await BiometricService.disableBiometric();
      // Revoking any lingering refresh token this device may have
      // relied on for silent biometric re-entry - disabling
      // biometric means this device should no longer have
      // standing access.
      try {
        final refreshToken = await StorageService.getRefreshToken();
        if (refreshToken != null) {
          await ApiClient.instance.post("/auth/logout", data: {"refresh_token": refreshToken});
        }
      } catch (_) {}
    }
    if (mounted) setState(() => _biometricEnabled = value);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.read<AuthBloc>().state is AuthAuthenticated
        ? (context.read<AuthBloc>().state as AuthAuthenticated).user : {};

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        // Profile section
        ListTile(
          leading: CircleAvatar(
            backgroundColor: AppTheme.primaryColor,
            child: Text(((user['first_name'] as String?) ?? 'U')[0].toUpperCase(),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
          title: Text('${user['first_name'] ?? ''} ${user['last_name'] ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text(user['email'] ?? ''),
          trailing: Chip(
            label: Text((user['role'] ?? '').toString().replaceAll('_', ' ').toUpperCase(),
              style: const TextStyle(fontSize: 10)),
            backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
          ),
        ),
        const Divider(),

        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text('SECURITY', style: TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold, letterSpacing: 1)),
        ),

        if (_canBiometric)
          SwitchListTile(
            secondary: const Icon(Icons.fingerprint, color: AppTheme.primaryColor),
            title: Text('$_biometricLabel Login'),
            subtitle: Text('Use $_biometricLabel to unlock the app\n(Never used for your Mobile Money PIN)'),
            value: _biometricEnabled,
            onChanged: _toggleBiometric,
            activeColor: AppTheme.primaryColor,
          ),

        ListTile(
          leading: const Icon(Icons.lock_reset, color: AppTheme.primaryColor),
          title: const Text('Change Password'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            builder: (_) => const _ChangePasswordSheet(),
          ),
        ),

        const Divider(),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text('ABOUT', style: TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold, letterSpacing: 1)),
        ),
        const ListTile(leading: Icon(Icons.info_outline), title: Text('Version'), trailing: Text('2.0.0')),
        ListTile(
          leading: const Icon(Icons.support_agent),
          title: const Text('Contact Support'),
          subtitle: const Text('support@agentproghana.com'),
          onTap: () async {
            // launchUrl() returns false (not a thrown exception) when no
            // email app is available to handle the intent — a realistic
            // case on budget Android devices. Must check the return value,
            // not just catch exceptions, or this silently does nothing.
            final uri = Uri(
              scheme: 'mailto',
              path: 'support@agentproghana.com',
              queryParameters: {'subject': 'Agent Pro Ghana Support'},
            );
            bool launched = false;
            try {
              launched = await launchUrl(uri);
            } catch (_) {
              launched = false;
            }
            if (!launched && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Please email us at support@agentproghana.com')),
              );
            }
          },
        ),

        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: AppTheme.errorColor),
          title: const Text('Sign Out', style: TextStyle(color: AppTheme.errorColor)),
          onTap: () => showDialog(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Sign Out'),
              content: const Text('Are you sure you want to sign out?'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorColor),
                  onPressed: () { Navigator.pop(context); context.read<AuthBloc>().add(AuthLogoutEvent()); },
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

// ── Change Password Sheet ──────────────────────────────────────

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
      // The password change is implemented as a self-reset via the API:
      // verify current password by re-authenticating, then update.
      // Using PATCH /auth/me/password (to be added) — for now uses the
      // existing forgot-password email flow as a fallback.
      await ApiClient.instance.patch('/users/me/password', data: {
        'current_password': _currentCtrl.text,
        'new_password': _newCtrl.text,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Password changed successfully.')));
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
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
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
              onToggle: () => setState(() => _obscureCurrent = !_obscureCurrent),
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
                if (!v.contains(RegExp(r'[A-Z]'))) return 'Include an uppercase letter';
                if (!v.contains(RegExp(r'[0-9]'))) return 'Include a number';
                if (v == _currentCtrl.text) return 'New password must differ from current';
                return null;
              },
            ),
            const SizedBox(height: 12),
            _PasswordField(
              controller: _confirmCtrl,
              label: 'Confirm New Password',
              obscure: _obscureConfirm,
              onToggle: () => setState(() => _obscureConfirm = !_obscureConfirm),
              validator: (v) => v != _newCtrl.text ? 'Passwords do not match' : null,
            ),
            const SizedBox(height: 20),
            AppButton(label: 'Change Password', onPressed: _submit, isLoading: _loading),
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
          icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: onToggle,
        ),
      ),
    );
  }
}
