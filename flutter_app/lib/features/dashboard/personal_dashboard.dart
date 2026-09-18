import 'package:flutter/material.dart';

import '../marketplace/marketplace_screen.dart';
import '../personal_community/personal_community_feed_screen.dart';
import 'personal_home_screen.dart';
import 'personal_more_tab.dart';

/// Personal uses the same four-destination information architecture:
/// Home, Community, Business Hub (Marketplace), and More.
class PersonalDashboard extends StatefulWidget {
  const PersonalDashboard({super.key});

  @override
  State<PersonalDashboard> createState() =>
      _PersonalDashboardState();
}

class _PersonalDashboardState
    extends State<PersonalDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: const [
          PersonalHomeScreen(),
          PersonalCommunityFeedScreen(),
          MarketplaceScreen(),
          PersonalMoreTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (index) {
          setState(() => _navIndex = index);
        },
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
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
    );
  }
}
