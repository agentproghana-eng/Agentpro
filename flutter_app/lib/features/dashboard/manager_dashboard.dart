import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import 'home_tab.dart';
import '../community/community_feed_screen.dart';
import '../marketplace/marketplace_screen.dart';
import '../../shared/widgets/more_tile.dart';

class ManagerDashboard extends StatefulWidget {
  const ManagerDashboard({super.key});
  @override
  State<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends State<ManagerDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    final user = (context.read<AuthBloc>().state as AuthAuthenticated).user;

    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: [
          HomeTab(user: user),
          const CommunityFeedScreen(),
          const MarketplaceScreen(),
          _ManagerMoreTab(),
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

class _ManagerMoreTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const MoreGroupLabel('Money & Operations'),
          MoreTile(
            Icons.receipt_long_outlined,
            'Transaction History',
            () => context.push('/transactions/history'),
            subtitle: 'Review transactions across your operations',
          ),
          MoreTile(
            Icons.account_balance_wallet_outlined,
            'Float Overview',
            () => context.push('/float-overview'),
            subtitle: 'Monitor float positions and availability',
          ),
          MoreTile(
            Icons.bar_chart_outlined,
            'Reports',
            () => context.push('/reports'),
            subtitle: 'View operational and transaction performance',
          ),
          MoreTile(
            Icons.fact_check_outlined,
            'Shift Reconciliation',
            () => context.push('/shifts/history'),
            subtitle: 'Review completed shifts and reconcile balances',
          ),
          const MoreGroupLabel('Tools & Automation'),
          MoreTile(
            Icons.wifi_tethering,
            'USSD Automation',
            () => context.push('/ussd-settings'),
            subtitle: 'Configure SIMs and automated transaction actions',
          ),
          const MoreGroupLabel('Business'),
          MoreTile(
            Icons.people_outlined,
            'Staff Management',
            () => context.push('/users'),
            subtitle: 'Manage staff access, roles and activity',
          ),
          MoreTile(
            Icons.store_outlined,
            'Branches',
            () => context.push('/branches'),
            subtitle: 'View and manage business locations',
          ),
          const MoreGroupLabel('Account'),
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
