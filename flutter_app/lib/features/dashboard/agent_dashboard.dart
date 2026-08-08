import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import 'home_tab.dart';
import '../community/community_feed_screen.dart';
import '../marketplace/marketplace_screen.dart';
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
    final authState = context.watch<AuthBloc>().state;
    final user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};

    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: [
          HomeTab(user: user),
          const CommunityFeedScreen(),
          const MarketplaceScreen(),
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
    final authState = context.watch<AuthBloc>().state;
    final user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const MoreGroupLabel('Money & Operations'),
          MoreTile(
            Icons.receipt_long_outlined,
            'Transaction History',
            () => context.push('/transactions/history'),
            subtitle: 'View, search and review your transactions',
          ),
          MoreTile(
            Icons.account_balance_wallet_outlined,
            'Float Balance',
            () => context.push('/my-balance'),
            subtitle: 'Monitor your available e-float and cash',
          ),
          MoreTile(
            Icons.bar_chart_outlined,
            'Reports',
            () => context.push('/reports'),
            subtitle: 'Review your performance and transaction summaries',
          ),
          const MoreGroupLabel('Tools & Automation'),
          MoreTile(
            Icons.wifi_tethering,
            'USSD Automation',
            () => context.push('/ussd-settings'),
            subtitle: 'Configure SIMs and automated transaction actions',
          ),
          const MoreGroupLabel('Account'),
          if (user['personal_subscription_plan'] != null)
            MoreTile(
              Icons.swap_horiz_rounded,
              'Switch to Personal Mode',
              () => context.go('/personal-home'),
              subtitle: 'Open your Personal AgentPro workspace',
            ),
          MoreTile(
            Icons.settings_outlined,
            'Settings',
            () => context.push('/settings'),
            subtitle: 'Manage preferences, security and app configuration',
          ),
          const MoreGroupLabel('Help & Support'),
          MoreTile(
            Icons.support_agent_outlined,
            'Help & Support',
            () => context.push('/support'),
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
