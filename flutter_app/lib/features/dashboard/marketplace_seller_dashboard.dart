import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/more_tile.dart';
import '../business/business_hub_screen.dart';
import '../marketplace/marketplace_screen.dart';

class MarketplaceSellerDashboard
    extends StatefulWidget {
  const MarketplaceSellerDashboard({
    super.key,
  });

  @override
  State<MarketplaceSellerDashboard>
      createState() =>
          _MarketplaceSellerDashboardState();
}

class _MarketplaceSellerDashboardState
    extends State<
        MarketplaceSellerDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: const [
          MarketplaceScreen(),
          BusinessHubScreen(),
          _SellerMore(),
        ],
      ),
      bottomNavigationBar:
          NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected:
            (index) => setState(
          () => _navIndex = index,
        ),
        destinations: const [
          NavigationDestination(
            icon: Icon(
              Icons.storefront_outlined,
            ),
            selectedIcon:
                Icon(Icons.storefront),
            label: 'Marketplace',
          ),
          NavigationDestination(
            icon: Icon(
              Icons
                  .business_center_outlined,
            ),
            selectedIcon: Icon(
              Icons.business_center,
            ),
            label: 'Business Hub',
          ),
          NavigationDestination(
            icon:
                Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
    );
  }
}

class _SellerMore
    extends StatelessWidget {
  const _SellerMore();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:
          AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const MoreGroupLabel(
            'Marketplace',
          ),
          MoreTile(
            Icons.inventory_2_outlined,
            'My Ads',
            () => context.push(
              '/marketplace/mine',
            ),
            subtitle:
                'Manage your Marketplace listings',
          ),
          MoreTile(
            Icons.favorite_outline,
            'Saved Ads',
            () => context.push(
              '/marketplace/saved',
            ),
            subtitle:
                'View saved Marketplace listings',
          ),
          MoreTile(
            Icons
                .mark_chat_unread_outlined,
            'Customer Enquiries',
            () => context.push(
              '/marketplace/enquiries',
            ),
            subtitle:
                'Reply to buyers and customers',
          ),
          MoreTile(
            Icons.rate_review_outlined,
            'Customer Reviews',
            () => context.push(
              '/marketplace/reviews',
            ),
            subtitle:
                'View ratings and feedback',
          ),
          const MoreGroupLabel(
            'Account',
          ),
          MoreTile(
            Icons
                .notifications_outlined,
            'Notifications',
            () => context.push(
              '/notifications',
            ),
            subtitle:
                'Review AgentPro notifications',
          ),
          const MoreGroupLabel(
            'Help & Support',
          ),
          MoreTile(
            Icons.support_agent_outlined,
            'Help & Support',
            () => context.push(
              '/support',
            ),
            subtitle:
                'Get AgentPro assistance',
          ),
          const MoreGroupLabel(
            'Session',
          ),
          MoreTile(
            Icons.lock_outline,
            'End Session',
            () async {
              final confirmed =
                  await confirmEndSession(
                context,
              );

              if (!context.mounted ||
                  !confirmed) {
                return;
              }

              context
                  .read<AuthBloc>()
                  .add(
                    AuthLockEvent(),
                  );
            },
            subtitle:
                'Lock this session without fully signing out',
          ),
          MoreTile(
            Icons.logout,
            'Sign Out',
            () async {
              final confirmed =
                  await confirmSignOut(
                context,
              );

              if (!context.mounted ||
                  !confirmed) {
                return;
              }

              context
                  .read<AuthBloc>()
                  .add(
                    AuthLogoutEvent(),
                  );
            },
            color:
                AppTheme.errorColor,
          ),
        ],
      ),
    );
  }
}
