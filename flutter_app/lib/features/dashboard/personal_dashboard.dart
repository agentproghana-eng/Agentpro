// personal_dashboard.dart
import 'package:flutter/material.dart';
import 'personal_home_screen.dart';
import 'personal_more_tab.dart';
import '../personal_community/personal_community_feed_screen.dart';
import '../business/business_hub_screen.dart';

/// Personal's equivalent of AgentDashboard/OwnerDashboard - same
/// IndexedStack + bottom NavigationBar shell (Home/Community/Business
/// Hub/More), just with Personal's own tab content. Business Hub
/// reuses the exact same BusinessHubScreen Agent/Owner use - it's
/// already a shared marketplace, not Agent-specific.
class PersonalDashboard extends StatefulWidget {
  const PersonalDashboard({super.key});

  @override
  State<PersonalDashboard> createState() => _PersonalDashboardState();
}

class _PersonalDashboardState extends State<PersonalDashboard> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _navIndex,
        children: const [
          PersonalHomeScreen(),
          PersonalCommunityFeedScreen(),
          BusinessHubScreen(),
          PersonalMoreTab(),
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
