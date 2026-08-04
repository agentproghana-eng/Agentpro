import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import 'home_tab.dart';
import '../community/community_feed_screen.dart';
import '../business/business_hub_screen.dart';
import '../../shared/widgets/more_tile.dart';

class AgentDashboard extends StatefulWidget {
  const AgentDashboard({super.key});
  @override
  State<AgentDashboard> createState() => _AgentDashboardState();
}

class _AgentDashboardState extends State<AgentDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    final user = context.read<AuthBloc>().state is AuthAuthenticated
        ? (context.read<AuthBloc>().state as AuthAuthenticated).user
        : <String, dynamic>{};

    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: [
          HomeTab(user: user),
          const CommunityFeedScreen(),
          const BusinessHubScreen(),
          const _MoreTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (i) => setState(() => _navIndex = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Community',
          ),
          NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront),
            label: 'Business Hub',
          ),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}

// ── More Tab ──────────────────────────────────────────────────

class _MoreTab extends StatelessWidget {
  const _MoreTab();

  @override
  Widget build(BuildContext context) {
    // _MoreTab is a separate StatelessWidget from _AgentDashboardState,
    // and is const-constructed, so 'user' can't be passed through the
    // constructor (const constructors can't take runtime values) - it
    // needs its own lookup here instead.
    final user = context.read<AuthBloc>().state is AuthAuthenticated
        ? (context.read<AuthBloc>().state as AuthAuthenticated).user
        : <String, dynamic>{};

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const MoreGroupLabel('MoMo'),
          MoreTile(
            Icons.receipt_long_outlined,
            'My Transactions',
            () => context.push('/transactions/history'),
          ),
          MoreTile(
            Icons.account_balance_wallet_outlined,
            'My Float Balance',
            () => context.push('/my-balance'),
          ),
          MoreTile(
            Icons.bar_chart_outlined,
            'My Reports',
            () => context.push('/reports'),
          ),
          MoreTile(
            Icons.wifi_tethering,
            'USSD Automation',
            () => context.push('/ussd-settings'),
          ),

          // Only shown to someone holding both Business and Personal
          // capability at once - a pure Agent has no other mode.
          if (user['personal_subscription_plan'] != null)
            MoreTile(
              Icons.person_outline,
              'Switch to Personal Mode',
              () => context.go('/personal-home'),
            ),

          const MoreGroupLabel('Help'),
          MoreTile(
            Icons.support_agent_outlined,
            'Help',
            () => context.push('/support'),
          ),
          MoreTile(
            Icons.settings_outlined,
            'Settings',
            () => context.push('/settings'),
          ),
          const Divider(),
          MoreTile(Icons.logout, 'Sign Out', () {
            context.read<AuthBloc>().add(AuthLogoutEvent());
          }, color: AppTheme.errorColor),
        ],
      ),
    );
  }
}
