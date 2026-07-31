// personal_more_tab.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';

/// The More tab of PersonalDashboard - everything that isn't Home,
/// Community, or Business Hub (those three are their own tabs).
/// Mirrors what used to live in PersonalHomeScreen's MORE section
/// before the bottom-nav restructuring, minus the two tiles that
/// became tabs. A plain StatelessWidget, not nested inside another
/// widget's build() - reads AuthBloc directly via context, avoiding
/// the exact "user undefined in a separate widget" bug already caught
/// once in Agent's own _MoreTab earlier this session.
class PersonalMoreTab extends StatelessWidget {
  const PersonalMoreTab({super.key});

  // Business role field ('agent'/'manager'/'business_owner'/'auditor')
  // mirrors AppRouter._homeForRole's own mapping exactly - duplicated
  // here rather than exposed from AppRouter, since it's a tiny switch
  // and not worth changing that method's visibility for.
  String _businessHomeRoute(String? role) {
    switch (role) {
      case 'agent': return '/agent';
      case 'manager': return '/manager';
      case 'business_owner': return '/owner';
      case 'auditor': return '/owner';
      default: return '/agent';
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final user = authState is AuthAuthenticated ? authState.user : <String, dynamic>{};
    final hasBusinessRole = user['company_id'] != null;
    final isPaid = user['personal_subscription_plan'] == 'paid';

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Fully reused from the Agent side as-is - both routes are
          // completely generic (no role gating, no agent-specific
          // content) and the tiles inside SettingsScreen that DO need
          // to differ by account type (Add Personal Account, SIM
          // Purpose) already condition correctly on company_id/
          // personal_subscription_plan, so they behave right for a
          // Personal-only user with zero changes needed there.
          Card(child: ListTile(
            leading: const Icon(Icons.settings_outlined, color: AppTheme.primaryColor),
            title: const Text('Settings'),
            subtitle: const Text('Security, sync, and account options'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings'),
          )),
          Card(child: ListTile(
            leading: const Icon(Icons.support_agent_outlined, color: AppTheme.primaryColor),
            title: const Text('Support'),
            subtitle: const Text('Get help or contact us'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/support'),
          )),
          Card(child: ListTile(
            leading: const Icon(Icons.bar_chart_outlined, color: AppTheme.primaryColor),
            title: const Text('My Reports'),
            subtitle: const Text('Download your transaction history'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/personal-reports'),
          )),
          if (isPaid)
            Card(child: ListTile(
              leading: const Icon(Icons.wifi_tethering, color: AppTheme.primaryColor),
              title: const Text('USSD Automation'),
              subtitle: const Text('Auto-dial your transactions'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/personal-ussd-settings'),
            )),
          if (isPaid)
            Card(child: ListTile(
              leading: const Icon(Icons.route_outlined, color: AppTheme.primaryColor),
              title: const Text('Custom USSD Flows'),
              subtitle: const Text('Build your own transaction flows'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/personal-ussd-flows'),
            )),
          Card(child: ListTile(
            leading: const Icon(Icons.workspace_premium_outlined, color: AppTheme.primaryColor),
            title: const Text('My Subscription'),
            subtitle: const Text('Manage your Personal plan'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/personal-subscription'),
          )),
          // Only shown to someone holding both Business and Personal
          // capability at once - a one-sided Personal user has no
          // other mode to switch to.
          if (hasBusinessRole)
            Card(child: ListTile(
              leading: const Icon(Icons.swap_horiz, color: AppTheme.primaryColor),
              title: const Text('Switch to Business Mode'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go(_businessHomeRoute(user['role'])),
            )),
          Card(child: ListTile(
            leading: const Icon(Icons.logout, color: AppTheme.primaryColor),
            title: const Text('Sign Out'),
            onTap: () => context.read<AuthBloc>().add(AuthLogoutEvent()),
          )),
        ],
      ),
    );
  }
}
