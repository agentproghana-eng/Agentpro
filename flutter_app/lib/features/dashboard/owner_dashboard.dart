import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/more_tile.dart';
import '../community/community_feed_screen.dart';
import '../marketplace/marketplace_screen.dart';
import 'home_tab.dart';

class OwnerDashboard extends StatefulWidget {
  const OwnerDashboard({super.key});

  @override
  State<OwnerDashboard> createState() =>
      _OwnerDashboardState();
}

class _OwnerDashboardState
    extends State<OwnerDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    final authState =
        context.watch<AuthBloc>().state;

    final user =
        authState is AuthAuthenticated
            ? authState.user
            : <String, dynamic>{};

    final isAuditor =
        user['role'] == 'auditor';

    final pages = <Widget>[
      HomeTab(user: user),
      if (!isAuditor)
        const CommunityFeedScreen(),
      const MarketplaceScreen(),
      const _OwnerMoreTab(),
    ];

    final destinations =
        <NavigationDestination>[
      const NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home),
        label: 'Home',
      ),
      if (!isAuditor)
        const NavigationDestination(
          icon: Icon(Icons.people_outline),
          selectedIcon: Icon(Icons.people),
          label: 'Community',
        ),
      const NavigationDestination(
        icon: Icon(Icons.storefront_outlined),
        selectedIcon: Icon(Icons.storefront),
        label: 'Business Hub',
      ),
      const NavigationDestination(
        icon: Icon(Icons.more_horiz),
        label: 'More',
      ),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (index) {
          setState(() => _navIndex = index);
        },
        destinations: destinations,
      ),
    );
  }
}

class _OwnerMoreTab extends StatelessWidget {
  const _OwnerMoreTab();

  @override
  Widget build(BuildContext context) {
    final authState =
        context.watch<AuthBloc>().state;

    final user =
        authState is AuthAuthenticated
            ? authState.user
            : <String, dynamic>{};

    return Scaffold(
      appBar: AppBar(
        title: const Text('More'),
      ),
      body: ListView(
        children: [
          const MoreGroupLabel(
            'Money & Operations',
          ),
          MoreTile(
            Icons.dashboard_customize_outlined,
            'Agent Hub',
            () => context.push('/agents-hub'),
            subtitle:
                'Transactions, reports, float and shift reconciliation',
          ),
          const MoreGroupLabel(
            'Tools & Automation',
          ),
          MoreTile(
            Icons.wifi_tethering,
            'USSD Automation',
            () => context.push('/ussd-settings'),
            subtitle:
                'Create and manage company USSD automations',
          ),
          const MoreGroupLabel('Business'),
          MoreTile(
            Icons.people_outlined,
            'Staff Management',
            () => context.push('/users'),
            subtitle:
                'Manage staff, permissions and access',
          ),
          MoreTile(
            Icons.store_outlined,
            'Branches',
            () => context.push('/branches'),
            subtitle:
                'Manage your business locations',
          ),
          const MoreGroupLabel('Account'),
          if (user['personal_subscription_plan'] !=
              null)
            MoreTile(
              Icons.swap_horiz_rounded,
              'Switch to Personal Mode',
              () => context.go('/personal-home'),
              subtitle:
                  'Open your Personal AgentPro workspace',
            ),
          MoreTile(
            Icons.card_membership_outlined,
            'Subscription',
            () => context.push('/subscription'),
            subtitle:
                'Manage your AgentPro business plan',
          ),
          MoreTile(
            Icons.settings_outlined,
            'Settings',
            () => context.push(
              '/settings?mode=business',
            ),
            subtitle:
                'Manage preferences, security and app configuration',
          ),
          const MoreGroupLabel(
            'Help & Support',
          ),
          MoreTile(
            Icons.support_agent_outlined,
            'Help & Support',
            () => context.push(
              '/support?mode=business',
            ),
            subtitle:
                'Guides, assistance and support options',
          ),
          const MoreGroupLabel('Session'),
          MoreTile(
            Icons.lock_outline,
            'End Session',
            () async {
              final confirmed =
                  await confirmEndSession(context);

              if (!context.mounted ||
                  !confirmed) {
                return;
              }

              context
                  .read<AuthBloc>()
                  .add(AuthLockEvent());
            },
            subtitle:
                'Lock this session without fully signing out',
          ),
          MoreTile(
            Icons.logout,
            'Sign Out',
            () async {
              final confirmed =
                  await confirmSignOut(context);

              if (!context.mounted ||
                  !confirmed) {
                return;
              }

              context
                  .read<AuthBloc>()
                  .add(AuthLogoutEvent());
            },
            color: AppTheme.errorColor,
            subtitle:
                'Sign out fully and remove this local session',
          ),
        ],
      ),
    );
  }
}
