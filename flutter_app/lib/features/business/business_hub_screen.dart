import 'package:fl_chart/fl_chart.dart';
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
        title: const Text('Business Tools'),
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
            if (!_loading && _error == null) ...[
              const SizedBox(height: 16),
              _buildViewsChart(),
            ],
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
              icon: Icons.favorite_outline,
              title: 'Saved Ads',
              subtitle: 'View advertisements you have saved',
              onTap: () => context.push('/marketplace/saved'),
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
              icon: Icons.rate_review_outlined,
              title: 'Customer Reviews',
              subtitle: 'Read ratings and feedback from your customers',
              onTap: () => context.push('/marketplace/reviews'),
            ),
            _HubCard(
              icon: Icons.mark_chat_unread_outlined,
              title: 'Customer Enquiries',
              subtitle: 'Reply to customers interested in your advertisements',
              onTap: () => context.push('/marketplace/enquiries'),
            ),
          ],
        ),
      ),
    );
  }

  List<Map<String, dynamic>> get _viewTrend {
    final rawTrend = _performance['view_trend'];
    if (rawTrend is! List) return const [];

    return rawTrend
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Widget _buildViewsChart() {
    final trend = _viewTrend;
    final visibleTrend =
        trend.length > 7 ? trend.sublist(trend.length - 7) : trend;

    final spots = <FlSpot>[];
    var highestValue = 0.0;

    for (var index = 0; index < visibleTrend.length; index++) {
      final rawViews = visibleTrend[index]['views'];
      final views = rawViews is num
          ? rawViews.toDouble()
          : double.tryParse(rawViews?.toString() ?? '') ?? 0;

      if (views > highestValue) highestValue = views;
      spots.add(FlSpot(index.toDouble(), views));
    }

    final maxY = highestValue < 4 ? 4.0 : highestValue + 1;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Views — Last 7 Days',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Daily views recorded since analytics tracking began.',
              style: TextStyle(
                fontSize: 11,
                color:
                    Theme.of(context).colorScheme.onSurface.withOpacity(0.65),
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              height: 190,
              child: visibleTrend.isEmpty
                  ? const Center(child: Text('No view data yet'))
                  : LineChart(
                      LineChartData(
                        minX: 0,
                        maxX: (visibleTrend.length - 1).toDouble(),
                        minY: 0,
                        maxY: maxY,
                        borderData: FlBorderData(show: false),
                        gridData: const FlGridData(
                          drawVerticalLine: false,
                        ),
                        lineTouchData: LineTouchData(
                          touchTooltipData: LineTouchTooltipData(
                            getTooltipItems: (touchedSpots) {
                              return touchedSpots.map((spot) {
                                final index = spot.x.round();
                                final date =
                                    visibleTrend[index]['date']?.toString();
                                final parsedDate = date == null
                                    ? null
                                    : DateTime.tryParse(date);
                                final label = parsedDate == null
                                    ? date ?? ''
                                    : '${parsedDate.day}/${parsedDate.month}';

                                return LineTooltipItem(
                                  '${spot.y.toInt()} view'
                                  '${spot.y.toInt() == 1 ? '' : 's'}\n'
                                  '$label',
                                  const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                );
                              }).toList();
                            },
                          ),
                        ),
                        titlesData: FlTitlesData(
                          topTitles: const AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          rightTitles: const AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 30,
                              interval: maxY <= 4 ? 1 : null,
                              getTitlesWidget: (value, meta) {
                                if (value != value.roundToDouble()) {
                                  return const SizedBox.shrink();
                                }
                                return Text(
                                  value.toInt().toString(),
                                  style: const TextStyle(fontSize: 10),
                                );
                              },
                            ),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 28,
                              interval: 1,
                              getTitlesWidget: (value, meta) {
                                final index = value.round();
                                if (index < 0 || index >= visibleTrend.length) {
                                  return const SizedBox.shrink();
                                }

                                final date = DateTime.tryParse(
                                  visibleTrend[index]['date']?.toString() ?? '',
                                );
                                if (date == null) {
                                  return const SizedBox.shrink();
                                }

                                return Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    '${date.day}/${date.month}',
                                    style: const TextStyle(fontSize: 9),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        lineBarsData: [
                          LineChartBarData(
                            spots: spots,
                            isCurved: true,
                            barWidth: 3,
                            dotData: const FlDotData(show: true),
                            belowBarData: BarAreaData(show: true),
                          ),
                        ],
                      ),
                    ),
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
