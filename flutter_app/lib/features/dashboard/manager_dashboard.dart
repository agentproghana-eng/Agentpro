import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import 'home_tab.dart';
import '../community/community_feed_screen.dart';
import '../marketplace/marketplace_screen.dart';

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
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Community'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Business Hub'),
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
          const _MoreGroupLabel('MoMo'),
          _Tile(Icons.receipt_long_outlined, 'Transactions', () => context.push('/transactions/history')),
          _Tile(Icons.account_balance_wallet_outlined, 'Float Overview', () => context.push('/float-overview')),
          _Tile(Icons.bar_chart_outlined, 'Reports', () => context.push('/reports')),
          _Tile(Icons.wifi_tethering, 'USSD Automation', () => context.push('/ussd-settings'), isNew: true),

          const _MoreGroupLabel('Business'),
          _Tile(Icons.people_outlined, 'Staff Management', () => context.push('/users')),
          _Tile(Icons.store_outlined, 'My Branches', () => context.push('/branches')),

          const _MoreGroupLabel('Support'),
          _Tile(Icons.support_agent_outlined, 'Support', () => context.push('/support'), isNew: true),
          _Tile(Icons.settings_outlined, 'Settings', () => context.push('/settings')),
          const Divider(),
          _Tile(Icons.logout, 'Sign Out', () => context.read<AuthBloc>().add(AuthLogoutEvent()),
            color: AppTheme.errorColor),
        ],
      ),
    );
  }
}

class _MoreGroupLabel extends StatelessWidget {
  final String label;
  const _MoreGroupLabel(this.label);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Text(label.toUpperCase(),
        style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold, letterSpacing: 1)),
  );
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool isNew;
  const _Tile(this.icon, this.label, this.onTap, {this.color, this.isNew = false});
  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: color ?? AppTheme.primaryColor),
    title: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(color: color)),
        if (isNew) Container(
          margin: const EdgeInsets.only(left: 6),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: AppTheme.secondaryColor, borderRadius: BorderRadius.circular(6)),
          child: const Text('NEW', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Colors.black)),
        ),
      ],
    ),
    trailing: const Icon(Icons.chevron_right, color: Colors.grey),
    onTap: onTap,
  );
}
