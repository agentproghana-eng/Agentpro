import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';

class BusinessHubScreen extends StatefulWidget {
  const BusinessHubScreen({super.key});

  @override
  State<BusinessHubScreen> createState() => _BusinessHubScreenState();
}

class _BusinessHubScreenState extends State<BusinessHubScreen> {
  Map<String, dynamic> _performance = <String, dynamic>{};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPerformance();
  }

  Future<void> _loadPerformance() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final response = await ApiClient.instance.get('/marketplace/dashboard');
      final rawData = response.data['data'];

      if (!mounted) return;

      setState(() {
        _performance = rawData is Map
            ? Map<String, dynamic>.from(rawData)
            : <String, dynamic>{};
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Business performance could not be loaded.';
        _loading = false;
      });
    }
  }

  int _asInt(String key) {
    final value = _performance[key];

    if (value is int) return value;
    if (value is num) return value.toInt();

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  double _asDouble(String key) {
    final value = _performance[key];

    if (value is double) return value;
    if (value is num) return value.toDouble();

    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Hub'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _loadPerformance,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadPerformance,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Business Performance',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Track the reach and status of your advertisements.',
              style: TextStyle(
                color:
                    Theme.of(context).colorScheme.onSurface.withOpacity(0.65),
              ),
            ),
            const SizedBox(height: 14),
            _buildPerformanceSection(),
            const SizedBox(height: 24),
            const Text(
              'Business Tools',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
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
          ],
        ),
      ),
    );
  }

  Widget _buildPerformanceSection() {
    if (_loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(28),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_error != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Icon(Icons.analytics_outlined, size: 36),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              TextButton.icon(
                onPressed: _loadPerformance,
                icon: const Icon(Icons.refresh),
                label: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    final averageRating = _asDouble('average_rating');

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.45,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      children: [
        _PerformanceCard(
          icon: Icons.check_circle_outline,
          label: 'Active Ads',
          value: _asInt('active_ads').toString(),
        ),
        _PerformanceCard(
          icon: Icons.hourglass_top,
          label: 'Pending',
          value: _asInt('pending_ads').toString(),
        ),
        _PerformanceCard(
          icon: Icons.visibility_outlined,
          label: 'Total Views',
          value: _asInt('total_views').toString(),
        ),
        _PerformanceCard(
          icon: Icons.star_outline,
          label: 'Average Rating',
          value: averageRating > 0
              ? averageRating.toStringAsFixed(1)
              : 'No ratings',
        ),
        _PerformanceCard(
          icon: Icons.rate_review_outlined,
          label: 'Reviews',
          value: _asInt('review_count').toString(),
        ),
        _PerformanceCard(
          icon: Icons.event_busy_outlined,
          label: 'Expired Ads',
          value: _asInt('expired_ads').toString(),
        ),
      ],
    );
  }
}

class _PerformanceCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _PerformanceCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: colors.primary),
            const SizedBox(height: 6),
            Text(
              value,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: colors.onSurface.withOpacity(0.65),
              ),
            ),
          ],
        ),
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
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
