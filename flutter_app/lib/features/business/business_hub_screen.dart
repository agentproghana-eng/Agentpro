import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class BusinessHubScreen extends StatelessWidget {
  const BusinessHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Business Hub')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HubCard(
            icon: Icons.storefront_outlined,
            title: 'Browse Marketplace',
            subtitle: 'Find products and services from businesses',
            onTap: () => context.push('/marketplace'),
          ),

          _HubCard(
            icon: Icons.inventory_2_outlined,
            title: 'My Ads',
            subtitle: 'Manage your advertisements and track status',
            onTap: () => context.push('/marketplace/mine'),
          ),

          _HubCard(
            icon: Icons.add_business_outlined,
            title: 'Post Advertisement',
            subtitle: 'Promote your products or services',
            onTap: () => context.push('/marketplace/post'),
          ),

          _HubCard(
            icon: Icons.analytics_outlined,
            title: 'Business Performance',
            subtitle: 'Track views, ratings and customer activity',
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Business analytics coming next')),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _HubCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _HubCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Icon(icon, size: 32),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
