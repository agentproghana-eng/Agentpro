import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import 'home_tab.dart';
import '../community/community_feed_screen.dart';
import '../marketplace/marketplace_screen.dart';

class OwnerDashboard extends StatefulWidget {
  const OwnerDashboard({super.key});
  @override
  State<OwnerDashboard> createState() => _OwnerDashboardState();
}

class _OwnerDashboardState extends State<OwnerDashboard> {
  int _navIndex = 0;
  Map<String, dynamic>? _summary;
  List<dynamic> _branches = [];
  List<dynamic> _commissions = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/reports/dashboard'),
        ApiClient.instance.get('/branches'),
        ApiClient.instance.get('/commissions/summary?group_by=day'),
      ]);
      if (mounted) {
        setState(() {
          _summary = results[0].data['data'];
          _branches = results[1].data['data'] ?? [];
          _commissions = results[2].data['data'] ?? [];
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

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
          _OwnerMoreTab(),
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

// ── Analytics Tab ─────────────────────────────────────────────

class _AnalyticsTab extends StatelessWidget {
  final Map<String, dynamic>? summary;
  final List<dynamic> commissions;
  final List<dynamic> branches;
  final bool loading;
  final Map<String, dynamic> user;
  final VoidCallback onRefresh;

  const _AnalyticsTab({this.summary, required this.commissions,
    required this.branches, required this.loading, required this.user,
    required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final today = summary?['today'];
    final month = summary?['this_month'];
    final floatByProvider = (summary?['float_by_provider'] as List?) ?? [];

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            backgroundColor: AppTheme.primaryColor,
            expandedHeight: 150,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                padding: const EdgeInsets.fromLTRB(20, 56, 20, 12),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppTheme.primaryColor, Color(0xFF004D43)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      width: 34, height: 34,
                      margin: const EdgeInsets.only(right: 10, bottom: 2),
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.15), borderRadius: BorderRadius.circular(9)),
                      child: Image.asset("assets/images/agentpro-logo.png", fit: BoxFit.contain),
                    ),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Business Dashboard', style: TextStyle(color: Colors.white70, fontSize: 12)),
                        Text('${user['company_name'] ?? 'My Business'}',
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('${branches.length} branch${branches.length != 1 ? 'es' : ''}',
                          style: const TextStyle(color: Colors.white60, fontSize: 12)),
                      ]),
                    ),
                    Row(children: [
                      IconButton(
                        icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                        onPressed: () => context.push('/notifications'),
                      ),
                      IconButton(
                        icon: const Icon(Icons.settings_outlined, color: Colors.white),
                        onPressed: () => context.push('/settings'),
                      ),
                    ]),
                  ],
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(delegate: SliverChildListDelegate([
              if (loading)
                const Center(child: CircularProgressIndicator())
              else ...[
                // KPI Cards
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12, mainAxisSpacing: 12,
                  childAspectRatio: 0.85,
                  children: [
                    InfoCard(
                      title: 'Today\'s Volume',
                      value: 'GH₵ ${_fmt(today?['total_amount'])}',
                      icon: Icons.trending_up,
                      subtitle: '${today?['transaction_count'] ?? 0} transactions',
                    ),
                    InfoCard(
                      title: 'Monthly Volume',
                      value: 'GH₵ ${_fmt(month?['total_amount'])}',
                      icon: Icons.bar_chart,
                      iconColor: AppTheme.secondaryColor,
                      subtitle: '${month?['transaction_count'] ?? 0} transactions',
                    ),
                    InfoCard(
                      title: 'Net Commission',
                      value: 'GH₵ ${_fmt(month?['net_commission'])}',
                      icon: Icons.payments_outlined,
                      iconColor: AppTheme.successColor,
                      subtitle: 'This month',
                    ),
                    InfoCard(
                      title: 'Branches',
                      value: '${branches.length}',
                      icon: Icons.store_outlined,
                      iconColor: Colors.blue,
                      subtitle: 'Active locations',
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Commission Chart
                if (commissions.isNotEmpty) ...[
                  const SectionHeader(title: 'DAILY COMMISSION (LAST 7 DAYS)'),
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: SizedBox(
                        height: 160,
                        child: BarChart(
                          BarChartData(
                            alignment: BarChartAlignment.spaceAround,
                            maxY: commissions.fold(0.0, (max, c) {
                              final v = double.tryParse(c['total_net']?.toString() ?? '0') ?? 0;
                              return v > max ? v : max;
                            }) * 1.2,
                            barGroups: commissions.take(7).toList().asMap().entries.map((e) {
                              final net = double.tryParse(e.value['total_net']?.toString() ?? '0') ?? 0;
                              return BarChartGroupData(x: e.key, barRods: [
                                BarChartRodData(toY: net, color: AppTheme.primaryColor, width: 18,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4))),
                              ]);
                            }).toList(),
                            titlesData: FlTitlesData(
                              show: true,
                              leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  getTitlesWidget: (v, meta) {
                                    final idx = v.toInt();
                                    if (idx >= commissions.length) return const Text('');
                                    final d = commissions[idx]['period'];
                                    if (d == null) return const Text('');
                                    try {
                                      return Text(
                                        DateFormat('dd/MM').format(DateTime.parse(d.toString())),
                                        style: const TextStyle(fontSize: 9),
                                      );
                                    } catch (_) { return const Text(''); }
                                  },
                                ),
                              ),
                            ),
                            gridData: const FlGridData(show: false),
                            borderData: FlBorderData(show: false),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Float by Provider
                if (floatByProvider.isNotEmpty) ...[
                  const SectionHeader(title: 'FLOAT BY PROVIDER'),
                  const SizedBox(height: 8),
                  ...floatByProvider.map((f) => Card(
                    margin: const EdgeInsets.only(bottom: 6),
                    child: ListTile(
                      leading: ProviderBadge(provider: f['provider'] ?? ''),
                      title: Text((f['provider'] ?? '').toString().toUpperCase()),
                      trailing: GhsAmount(
                        amount: double.tryParse(f['total']?.toString() ?? '0') ?? 0,
                        fontSize: 15,
                      ),
                    ),
                  )),
                  const SizedBox(height: 20),
                ],

                // Subscription Status
                SectionHeader(title: 'SUBSCRIPTION', actionLabel: 'Manage',
                  onAction: () => context.push('/subscription')),
                const SizedBox(height: 8),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.card_membership, color: AppTheme.primaryColor),
                    title: const Text('Business Plan', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text('GH₵10/month'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/subscription'),
                  ),
                ),
              ],
              const SizedBox(height: 80),
            ])),
          ),
        ],
      ),
    );
  }

  String _fmt(dynamic v) => NumberFormat('#,##0.00').format(
    double.tryParse(v?.toString() ?? '0') ?? 0);
}

// ── Branches Tab ──────────────────────────────────────────────

class _BranchesTab extends StatelessWidget {
  final List<dynamic> branches;
  final bool loading;
  const _BranchesTab({required this.branches, required this.loading});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Branches')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : branches.isEmpty
              ? EmptyState(
                  icon: Icons.store_outlined,
                  title: 'No branches yet',
                  subtitle: 'Add your first branch to get started',
                  actionLabel: 'Add Branch',
                  onAction: () => _showAddBranch(context),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(8),
                  itemCount: branches.length,
                  itemBuilder: (_, i) {
                    final b = branches[i] as Map<String, dynamic>;
                    final float = double.tryParse(b['total_float']?.toString() ?? '0') ?? 0;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ExpansionTile(
                        leading: CircleAvatar(
                          backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
                          child: const Icon(Icons.store, color: AppTheme.primaryColor),
                        ),
                        title: Text(b['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(b['location'] ?? '', style: const TextStyle(fontSize: 12)),
                        trailing: GhsAmount(amount: float, fontSize: 13),
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _Row('Agents', '${b['agent_count'] ?? 0}'),
                                _Row('Managers', '${b['manager_count'] ?? 0}'),
                                _Row('Status', (b['status'] ?? '').toUpperCase()),
                                const SizedBox(height: 8),
                                Row(children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () => context.push('/float'),
                                      icon: const Icon(Icons.account_balance_wallet, size: 16),
                                      label: const Text('Float'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () => context.push('/transactions/history'),
                                      icon: const Icon(Icons.receipt_long, size: 16),
                                      label: const Text('Transactions'),
                                    ),
                                  ),
                                ]),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddBranch(context),
        icon: const Icon(Icons.add),
        label: const Text('Add Branch'),
        backgroundColor: AppTheme.primaryColor,
      ),
    );
  }

  void _showAddBranch(BuildContext context) {
    final nameCtrl = TextEditingController();
    final locationCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    bool loading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Add New Branch', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Branch Name *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: locationCtrl, decoration: const InputDecoration(labelText: 'Location', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: phoneCtrl, keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
            const SizedBox(height: 20),
            AppButton(
              label: 'Create Branch',
              isLoading: loading,
              onPressed: () async {
                if (nameCtrl.text.isEmpty) return;
                setS(() => loading = true);
                try {
                  await ApiClient.instance.post('/branches', data: {
                    'name': nameCtrl.text.trim(),
                    'location': locationCtrl.text.trim(),
                    'phone': phoneCtrl.text.trim(),
                  });
                  if (ctx.mounted) {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Branch created ✅')));
                  }
                } catch (_) {
                  setS(() => loading = false);
                  if (ctx.mounted) ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to create branch'), backgroundColor: AppTheme.errorColor));
                }
              },
            ),
          ]),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label, value;
  const _Row(this.label, this.value);
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
      ]),
    );
  }
}

// ── Reports Tab ───────────────────────────────────────────────

class _OwnerReportsTab extends StatelessWidget {
  const _OwnerReportsTab();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: Center(
        child: AppButton(
          label: 'Open Reports',
          icon: Icons.bar_chart,
          onPressed: () => context.push('/reports'),
        ),
      ),
    );
  }
}


// ── More Tab ──────────────────────────────────────────────────

class _OwnerMoreTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          const _MoreGroupLabel('MoMo'),
          _T(Icons.receipt_long_outlined, 'Transactions', () => context.push('/transactions/history')),
          _T(Icons.account_balance_wallet_outlined, 'Float Balances', () => context.push('/my-balance')),
          _T(Icons.bar_chart_outlined, 'Reports', () => context.push('/reports')),
          _T(Icons.wifi_tethering, 'USSD Automation', () => context.push('/ussd-settings'), isNew: true),
          _T(Icons.build_circle_outlined, 'Custom USSD Flows', () => context.push('/ussd-flows'), isNew: true),

          const _MoreGroupLabel('Business'),
          _T(Icons.people_outlined, 'Staff Management', () => context.push('/users')),
          _T(Icons.store_outlined, 'Branches', () => context.push('/branches')),
          _T(Icons.card_membership_outlined, 'Subscription', () => context.push('/subscription')),

          const _MoreGroupLabel('Support'),
          _T(Icons.support_agent_outlined, 'Support', () => context.push('/support'), isNew: true),
          _T(Icons.settings_outlined, 'Settings', () => context.push('/settings')),
          const Divider(),
          _T(Icons.logout, 'Sign Out',
              () => context.read<AuthBloc>().add(AuthLogoutEvent()),
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

class _T extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool isNew;
  const _T(this.icon, this.label, this.onTap, {this.color, this.isNew = false});
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
