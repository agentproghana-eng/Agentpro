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
        children: [
          const MoreGroupLabel('MoMo'),
          MoreTile(Icons.receipt_long_outlined, 'Transaction History', () => context.push(isPaid ? '/personal-transactions/history' : '/personal-subscription')),
          MoreTile(Icons.bar_chart_outlined, 'My Reports', () => context.push('/personal-reports')),
          if (isPaid)
            MoreTile(Icons.wifi_tethering, 'USSD Automation', () => context.push('/personal-ussd-settings')),
          if (isPaid)
            MoreTile(Icons.route_outlined, 'Custom USSD Flows', () => context.push('/personal-ussd-flows')),

          const MoreGroupLabel('Account'),
          MoreTile(Icons.workspace_premium_outlined, 'My Subscription', () => context.push('/personal-subscription')),
          // Only shown to someone holding both Business and Personal
          // capability at once - a one-sided Personal user has no
          // other mode to switch to.
          if (hasBusinessRole)
            MoreTile(Icons.swap_horiz, 'Switch to Business Mode', () => context.go(_businessHomeRoute(user['role']))),

          const MoreGroupLabel('Help'),
          MoreTile(Icons.support_agent_outlined, 'Help', () => context.push('/support')),
          MoreTile(Icons.settings_outlined, 'Settings', () => context.push('/settings')),
          const Divider(),
          MoreTile(Icons.logout, 'Sign Out', () => context.read<AuthBloc>().add(AuthLogoutEvent()),
              color: AppTheme.errorColor),
        ],
      ),
    );
  }
}
