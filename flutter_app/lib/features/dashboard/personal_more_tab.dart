// personal_more_tab.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/more_tile.dart';

/// The More tab of PersonalDashboard - everything that isn't Home,
/// Community, or Business Hub (those three are their own tabs).
/// Grouped to match Owner/Manager/Agent's own More tabs exactly (MoMo
/// / Account / Help sections via the shared MoreGroupLabel/MoreTile
/// widgets), rather than the flat, ungrouped card list this started
/// as. A plain StatelessWidget, not nested inside another widget's
/// build() - reads AuthBloc directly via context, avoiding the exact
/// "user undefined in a separate widget" bug already caught once in
/// Agent's own _MoreTab earlier this session.
class PersonalMoreTab extends StatelessWidget {
  const PersonalMoreTab({super.key});

  // Business role field ('agent'/'manager'/'business_owner'/'auditor')
  // mirrors AppRouter._homeForRole's own mapping exactly - duplicated
  // here rather than exposed from AppRouter, since it's a tiny switch
  // and not worth changing that method's visibility for.
  String _businessHomeRoute(String? role) {
    switch (role) {
      case 'agent':
        return '/agent';
      case 'manager':
        return '/manager';
      case 'business_owner':
        return '/owner';
      case 'auditor':
        return '/owner';
      default:
        return '/agent';
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};
    final hasBusinessRole = user['company_id'] != null;
    final isPaid = user['personal_subscription_plan'] == 'paid';

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const MoreGroupLabel('Money & Activity'),
          MoreTile(
            Icons.receipt_long_outlined,
            'Transaction History',
            () => context.push(
              isPaid
                  ? '/personal-transactions/history'
                  : '/personal-subscription',
            ),
            subtitle: isPaid
                ? 'View, search and review your personal transactions'
                : 'Upgrade to unlock your complete transaction history',
          ),
          MoreTile(
            Icons.bar_chart_outlined,
            'Reports',
            () => context.push('/personal-reports'),
            subtitle: 'Understand your personal transaction activity',
          ),
          const MoreGroupLabel('Tools & Automation'),
          if (isPaid)
            MoreTile(
              Icons.wifi_tethering,
              'USSD Automation',
              () => context.push('/personal-ussd-settings'),
              subtitle: 'Configure SIMs and personal transaction automation',
            ),
          if (isPaid)
            MoreTile(
              Icons.route_outlined,
              'Custom USSD Flows',
              () => context.push('/personal-ussd-flows'),
              subtitle: 'Create and manage your own USSD sequences',
            ),
          const MoreGroupLabel('Account'),
          MoreTile(
            Icons.workspace_premium_outlined,
            'My Subscription',
            () => context.push('/personal-subscription'),
            subtitle: 'View or manage your Personal AgentPro plan',
          ),
          if (hasBusinessRole)
            MoreTile(
              Icons.swap_horiz_rounded,
              'Switch to Business Mode',
              () => context.go(_businessHomeRoute(user['role'])),
              subtitle: 'Open your AgentPro business workspace',
            ),
          MoreTile(
            Icons.settings_outlined,
            'Settings',
            () => context.push('/settings?mode=personal'),
            subtitle: 'Manage preferences, security and app configuration',
          ),
          const MoreGroupLabel('Help & Support'),
          MoreTile(
            Icons.support_agent_outlined,
            'Help & Support',
            () => context.push('/support?mode=personal'),
            subtitle: 'Guides, assistance and support options',
          ),
          const Divider(),
          MoreTile(
            Icons.logout,
            'Sign Out',
            () => context.read<AuthBloc>().add(AuthLogoutEvent()),
            color: AppTheme.errorColor,
          ),
        ],
      ),
    );
  }
}
