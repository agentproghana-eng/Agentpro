import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/api_client.dart';
import '../../core/services/biometric_service.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../ussd_flows/ussd_flow_editor_screen.dart';
import '../ussd_flows/ussd_flow_list_screen.dart';

class UssdSettingsScreen extends StatefulWidget {
  final List<String>? transactionTypes;
  final bool isPersonal;

  const UssdSettingsScreen({
    super.key,
    this.transactionTypes,
    this.isPersonal = false,
  });

  @override
  State<UssdSettingsScreen> createState() => _UssdSettingsScreenState();
}

class _UssdSettingsScreenState extends State<UssdSettingsScreen> {
  bool _loadingTelecelCredentialStatus = false;
  bool _savingTelecelCredential = false;

  bool _agentOperatorConfigured = false;
  bool _agentShortcodeConfigured = false;
  bool _merchantOperatorConfigured = false;
  bool _merchantShortcodeConfigured = false;

  @override
  void initState() {
    super.initState();
    _loadTelecelCredentialStatus();
  }



  Future<void> _loadTelecelCredentialStatus() async {
    if (widget.isPersonal) return;

    if (mounted) {
      setState(() {
        _loadingTelecelCredentialStatus = true;
      });
    }

    try {
      final response = await ApiClient.instance.get(
        '/users/me/telecel-credentials/status',
      );

      final raw = response.data;
      final data = raw is Map<String, dynamic>
          ? raw['data']
          : null;

      if (!mounted || data is! Map<String, dynamic>) {
        return;
      }

      setState(() {
        _agentOperatorConfigured =
            data['telecel_agent_operator_id_configured'] == true;
        _agentShortcodeConfigured =
            data['telecel_agent_organisation_shortcode_configured'] == true;
        _merchantOperatorConfigured =
            data['telecel_merchant_operator_id_configured'] == true;
        _merchantShortcodeConfigured =
            data['telecel_merchant_organisation_shortcode_configured'] == true;
      });
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not load protected Telecel credential status.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _loadingTelecelCredentialStatus = false;
        });
      }
    }
  }

  Future<bool> _authenticateCredentialChange() async {
    final result =
        await BiometricService.authenticateSensitiveAction();

    if (!mounted) return false;

    switch (result) {
      case BiometricResult.success:
        return true;

      case BiometricResult.cancelled:
        return false;

      case BiometricResult.notAvailable:
      case BiometricResult.notEnrolled:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Set up a phone screen lock, fingerprint, '
              'or face unlock before changing protected credentials.',
            ),
          ),
        );
        return false;

      case BiometricResult.lockedOut:
      case BiometricResult.permanentlyLockedOut:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Phone authentication is locked. '
              'Unlock your phone and try again.',
            ),
          ),
        );
        return false;

      case BiometricResult.error:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Phone authentication could not be completed.',
            ),
          ),
        );
        return false;
    }
  }

  Future<void> _editProtectedTelecelCredential({
    required String simRole,
    required String credentialType,
    required String title,
  }) async {
    if (_savingTelecelCredential) return;

    final authenticated =
        await _authenticateCredentialChange();

    if (!authenticated || !mounted) return;

    // Create plaintext state only after successful phone authentication.
    final controller = TextEditingController();

    final value = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            obscureText: true,
            enableSuggestions: false,
            autocorrect: false,
            maxLength: 32,
            decoration: InputDecoration(
              labelText: title,
              hintText: 'Enter protected value',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final normalized =
                    controller.text.trim();

                if (normalized.isEmpty) return;

                Navigator.of(dialogContext).pop(
                  normalized,
                );
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    // Do not retain plaintext in screen state.
    controller.clear();
    controller.dispose();

    if (value == null || value.isEmpty || !mounted) {
      return;
    }

    setState(() {
      _savingTelecelCredential = true;
    });

    try {
      final field =
          credentialType == 'operator_id'
              ? 'telecel_operator_id'
              : 'telecel_organisation_shortcode';

      await ApiClient.instance.patch(
        '/users/me/settings',
        data: {
          'telecel_sim_role': simRole,
          field: value,
        },
      );

      if (!mounted) return;

      await _loadTelecelCredentialStatus();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$title saved securely.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not save protected Telecel credential.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingTelecelCredential = false;
        });
      }
    }
  }

  Widget _protectedCredentialRow({
    required String simRole,
    required String credentialType,
    required String label,
    required bool configured,
  }) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        configured
            ? '••••••••  Configured'
            : 'Not configured',
      ),
      trailing: TextButton(
        onPressed: _savingTelecelCredential
            ? null
            : () => _editProtectedTelecelCredential(
                  simRole: simRole,
                  credentialType: credentialType,
                  title:
                      '${simRole == 'agent' ? 'Agent' : 'Merchant'} $label',
                ),
        child: Text(
          configured ? 'Change' : 'Set',
        ),
      ),
    );
  }

  Widget _telecelProtectedCredentialsCard(
    BuildContext context,
  ) {
    return _sectionCard(
      context: context,
      icon: Icons.shield_outlined,
      title: 'Telecel protected credentials',
      description:
          'Operator IDs and Organisation Shortcodes stay masked '
          'after saving. Phone authentication is required before '
          'setting or replacing them.',
      child: _loadingTelecelCredentialStatus
          ? const Padding(
              padding: EdgeInsets.all(18),
              child: Center(
                child: CircularProgressIndicator(),
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'AGENT',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                _protectedCredentialRow(
                  simRole: 'agent',
                  credentialType: 'operator_id',
                  label: 'Operator ID',
                  configured: _agentOperatorConfigured,
                ),
                _protectedCredentialRow(
                  simRole: 'agent',
                  credentialType: 'organisation_shortcode',
                  label: 'Organisation Shortcode',
                  configured: _agentShortcodeConfigured,
                ),
                const Divider(),
                const SizedBox(height: 6),
                const Text(
                  'MERCHANT',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                _protectedCredentialRow(
                  simRole: 'merchant',
                  credentialType: 'operator_id',
                  label: 'Operator ID',
                  configured: _merchantOperatorConfigured,
                ),
                _protectedCredentialRow(
                  simRole: 'merchant',
                  credentialType: 'organisation_shortcode',
                  label: 'Organisation Shortcode',
                  configured: _merchantShortcodeConfigured,
                ),
              ],
            ),
    );
  }

  Future<void> _createAutomation() async {
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => UssdFlowEditorScreen(
          apiBasePath:
              widget.isPersonal ? '/personal-ussd-flows' : '/ussd-flows',
        ),
      ),
    );
  }

  Future<void> _manageAutomations() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => UssdFlowListScreen(isPersonal: widget.isPersonal),
      ),
    );
  }

  Widget _sectionCard({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String description,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.14),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: AppTheme.primaryColor, size: 21),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            description,
            style: TextStyle(
              fontSize: 11.5,
              height: 1.35,
              color: context.appSecondaryText,
            ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _createAutomationCard(BuildContext context) {
    return _sectionCard(
      context: context,
      icon: Icons.auto_fix_high_outlined,
      title: 'Create USSD Automation',
      description: 'Use Direct USSD String for a complete one-dial code, or '
          'Interactive Flow for provider menus that must be handled '
          'step by step. MoMo PIN entry always remains on the '
          "network's own screen.",
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _createAutomation,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Create Automation'),
        ),
      ),
    );
  }

  Widget _manageAutomationsCard(BuildContext context) {
    return _sectionCard(
      context: context,
      icon: Icons.route_outlined,
      title: 'My Automations',
      description: 'View all Direct and Interactive automations, including '
          'their active state and the provider flows organized '
          'under each transaction.',
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: _manageAutomations,
          icon: const Icon(Icons.list_alt_rounded),
          label: const Text('Manage Automations'),
        ),
      ),
    );
  }

  Widget _managedByOwnerCard(BuildContext context) {
    return _sectionCard(
      context: context,
      icon: Icons.admin_panel_settings_outlined,
      title: 'Company Automations',
      description:
          'Company USSD automations are managed by the business owner. '
          'Your active company flows remain available when you perform '
          'transactions.',
      child: Row(
        children: [
          Icon(
            Icons.lock_outline_rounded,
            size: 17,
            color: context.appSecondaryText,
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              'No legacy dial-pattern override is required.',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.appSecondaryText,
              ),
            ),
          ),
        ],
      ),
    );
  }


  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;

    final user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};

    final role = user['role']?.toString().trim().toLowerCase() ?? '';

    final canManageAutomations =
        widget.isPersonal || role == 'business_owner' || role == 'superuser';

    return Scaffold(
      appBar: AppBar(title: const Text('USSD Automation')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.security_rounded,
                  size: 20,
                  color: AppTheme.primaryColor,
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    'AgentPro now uses one automation model: '
                    'Direct USSD String or Interactive Flow. '
                    'The old custom dial-pattern override has been removed '
                    'from the app.',
                    style: TextStyle(
                      fontSize: 11.5,
                      height: 1.35,
                      color: context.appSecondaryText,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (canManageAutomations) ...[
            _createAutomationCard(context),
            const SizedBox(height: 12),
            _manageAutomationsCard(context),
          ] else
            _managedByOwnerCard(context),
          if (!widget.isPersonal) ...[
            const SizedBox(height: 12),
            _telecelProtectedCredentialsCard(context),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
