import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/api_client.dart';
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
  final _operatorIdCtrl = TextEditingController();

  bool _savingOperatorId = false;

  @override
  void initState() {
    super.initState();
    _loadOperatorId();
  }

  @override
  void dispose() {
    _operatorIdCtrl.dispose();
    super.dispose();
  }

  void _loadOperatorId() {
    final state = context.read<AuthBloc>().state;

    if (state is! AuthAuthenticated) {
      return;
    }

    _operatorIdCtrl.text = state.user['telecel_operator_id']?.toString() ?? '';
  }

  Future<void> _saveOperatorId() async {
    final value = _operatorIdCtrl.text.trim();

    if (value.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a Telecel Operator ID')),
      );
      return;
    }

    setState(() => _savingOperatorId = true);

    try {
      await ApiClient.instance.patch(
        '/users/me/settings',
        data: {'telecel_operator_id': value},
      );

      if (!mounted) {
        return;
      }

      context.read<AuthBloc>().add(
            AuthUpdateUserEvent({'telecel_operator_id': value}),
          );

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Telecel Operator ID saved')),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to save Telecel Operator ID'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _savingOperatorId = false);
      }
    }
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

  Widget _telecelOperatorCard(BuildContext context) {
    return _sectionCard(
      context: context,
      icon: Icons.sim_card_outlined,
      title: 'Telecel Operator ID',
      description:
          'Used when a Telecel Agent transaction requires your assigned '
          'operator identifier. This is separate from USSD flow design.',
      child: Column(
        children: [
          TextField(
            controller: _operatorIdCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Operator ID',
              hintText: 'e.g. 8284',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _savingOperatorId ? null : _saveOperatorId,
              child: _savingOperatorId
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save Operator ID'),
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
            _telecelOperatorCard(context),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
