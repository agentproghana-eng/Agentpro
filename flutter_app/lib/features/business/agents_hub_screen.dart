import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';

class AgentsHubScreen extends StatefulWidget {
  const AgentsHubScreen({super.key});

  @override
  State<AgentsHubScreen> createState() =>
      _AgentsHubScreenState();
}

class _AgentsHubScreenState
    extends State<AgentsHubScreen> {
  Map<String, dynamic> _dashboard =
      <String, dynamic>{};

  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final response =
          await ApiClient.instance.get(
        '/reports/dashboard',
      );

      final raw = response.data['data'];

      if (!mounted) return;

      setState(() {
        _dashboard = raw is Map
            ? Map<String, dynamic>.from(raw)
            : <String, dynamic>{};

        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _error =
            'Agents Hub information could not be loaded.';
      });
    }
  }

  Map<String, dynamic> _map(
    String key,
  ) {
    final value = _dashboard[key];

    return value is Map
        ? Map<String, dynamic>.from(value)
        : <String, dynamic>{};
  }

  List<Map<String, dynamic>> _list(
    String key,
  ) {
    final value = _dashboard[key];

    if (value is! List) {
      return const [];
    }

    return value
        .whereType<Map>()
        .map(
          (item) =>
              Map<String, dynamic>.from(item),
        )
        .toList();
  }

  double _number(dynamic value) {
    if (value is num) {
      return value.toDouble();
    }

    return double.tryParse(
          value?.toString() ?? '',
        ) ??
        0;
  }

  String _money(dynamic value) {
    return 'GH₵${_number(value).toStringAsFixed(2)}';
  }

  String _title(dynamic value) {
    final text =
        value?.toString().trim() ?? '';

    if (text.isEmpty) {
      return 'Transaction';
    }

    return text
        .split('_')
        .where((part) => part.isNotEmpty)
        .map(
          (part) =>
              '${part[0].toUpperCase()}'
              '${part.substring(1)}',
        )
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final authState =
        context.watch<AuthBloc>().state;

    final user = authState
            is AuthAuthenticated
        ? authState.user
        : <String, dynamic>{};

    final role =
        user['role']?.toString();

    final canUseCommunity =
        role == 'business_owner' ||
            role == 'manager' ||
            role == 'agent';

    return Scaffold(
      appBar: AppBar(
        title:
            const Text('Agents Hub'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed:
                _loading ? null : _load,
            icon:
                const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics:
              const AlwaysScrollableScrollPhysics(),
          padding:
              const EdgeInsets.all(16),
          children: [
            Text(
              user['company_name']
                      ?.toString() ??
                  'AgentPro Business',
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(
                    fontWeight:
                        FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Mobile Money operations, performance, earnings and balances.',
            ),
            const SizedBox(height: 18),
            _content(),
            const SizedBox(height: 18),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(
                      Icons
                          .receipt_long_outlined,
                    ),
                    title: const Text(
                      'Transaction History',
                    ),
                    onTap: () =>
                        context.push(
                      '/transactions/history',
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(
                      Icons.bar_chart_outlined,
                    ),
                    title: const Text(
                      'Reports & Insights',
                    ),
                    onTap: () =>
                        context.push(
                      '/reports',
                    ),
                  ),
                  if (canUseCommunity) ...[
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(
                        Icons.people_outline,
                      ),
                      title: const Text(
                        'Agent Community',
                      ),
                      onTap: () =>
                          context.push(
                        '/community',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(30),
          child: Center(
            child:
                CircularProgressIndicator(),
          ),
        ),
      );
    }

    if (_error != null) {
      return Card(
        child: Padding(
          padding:
              const EdgeInsets.all(20),
          child: Column(
            children: [
              const Icon(
                Icons.analytics_outlined,
                size: 36,
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign:
                    TextAlign.center,
              ),
              TextButton.icon(
                onPressed: _load,
                icon:
                    const Icon(Icons.refresh),
                label:
                    const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    final today = _map('today');
    final month = _map('this_month');

    final volume =
        today['total_amount'] ??
            _dashboard['today_volume'];

    final earnings =
        today['gross_earnings'] ??
            _dashboard[
                'today_gross_earnings'];

    final rate =
        today['success_rate'] ??
            _dashboard[
                'today_success_rate'];

    final count =
        today['transaction_count'] ??
            _dashboard[
                'today_transactions'];

    final floats =
        _list('float_by_provider');

    final recent =
        _list('recent_transactions');

    return Column(
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics:
              const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            _Metric(
              label: "Today's Volume",
              value: _money(volume),
              icon: Icons.trending_up,
            ),
            _Metric(
              label: 'Gross Earnings',
              value: _money(earnings),
              icon:
                  Icons.payments_outlined,
            ),
            _Metric(
              label: 'Success Rate',
              value:
                  '${_number(rate).toStringAsFixed(1)}%',
              icon: Icons
                  .check_circle_outline,
            ),
            _Metric(
              label: 'This Month',
              value: _money(
                month['total_amount'],
              ),
              icon:
                  Icons.bar_chart,
            ),
          ],
        ),
        const SizedBox(height: 14),
        Card(
          child: ListTile(
            title: const Text(
              "Today's Transactions",
            ),
            trailing: Text(
              _number(count)
                  .round()
                  .toString(),
              style: const TextStyle(
                fontWeight:
                    FontWeight.bold,
              ),
            ),
          ),
        ),
        if (floats.isNotEmpty) ...[
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding:
                  const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Provider Balances',
                    style: TextStyle(
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  ...floats.map(
                    (item) => ListTile(
                      contentPadding:
                          EdgeInsets.zero,
                      title: Text(
                        _title(
                          item['provider'],
                        ),
                      ),
                      trailing: Text(
                        _money(
                          item['total'],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding:
                const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                const Text(
                  'Recent Transactions',
                  style: TextStyle(
                    fontWeight:
                        FontWeight.bold,
                  ),
                ),
                if (recent.isEmpty)
                  const Padding(
                    padding:
                        EdgeInsets.all(18),
                    child: Text(
                      'New Mobile Money activity will appear here.',
                    ),
                  )
                else
                  ...recent.map(
                    (item) => ListTile(
                      contentPadding:
                          EdgeInsets.zero,
                      title: Text(
                        _title(
                          item[
                              'transaction_type'],
                        ),
                      ),
                      subtitle: Text(
                        _title(
                          item['provider'],
                        ),
                      ),
                      trailing: Text(
                        _money(
                          item['amount'],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding:
            const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const Spacer(),
            Text(
              label,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall,
            ),
            const SizedBox(height: 3),
            Text(
              value,
              maxLines: 1,
              overflow:
                  TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight:
                    FontWeight.bold,
                fontSize: 17,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
