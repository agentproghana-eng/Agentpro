import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class ManagerDashboard extends StatefulWidget {
  const ManagerDashboard({super.key});
  @override
  State<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends State<ManagerDashboard> {
  int _navIndex = 0;
  Map<String, dynamic>? _summary;
  List<dynamic> _branches = [];
  List<dynamic> _floatAccounts = [];
  List<dynamic> _agents = [];
  List<dynamic> _recentTransactions = [];
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
        ApiClient.instance.get('/float/overview'),
        ApiClient.instance.get('/users?role=agent'),
        ApiClient.instance.get('/transactions?limit=10'),
      ]);
      if (mounted) {
        setState(() {
          _summary = results[0].data['data'];
          _branches = results[1].data['data'] ?? [];
          _floatAccounts = results[2].data['data']['accounts'] ?? [];
          _agents = results[3].data['data'] ?? [];
          _recentTransactions = _summary?['recent_transactions'] ?? [];
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
          _OverviewTab(
            summary: _summary,
            loading: _loading,
            user: user,
            branches: _branches,
            onRefresh: _loadAll,
          ),
          _AgentsTab(agents: _agents, loading: _loading),
          _FloatTab(accounts: _floatAccounts, loading: _loading),
          _ManagerMoreTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (i) => setState(() => _navIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Overview'),
          NavigationDestination(icon: Icon(Icons.people_outlined), selectedIcon: Icon(Icons.people), label: 'Agents'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Float'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}

// ── Overview Tab ──────────────────────────────────────────────

class _OverviewTab extends StatelessWidget {
  final Map<String, dynamic>? summary;
  final bool loading;
  final Map<String, dynamic> user;
  final List<dynamic> branches;
  final VoidCallback onRefresh;

  const _OverviewTab({this.summary, required this.loading, required this.user,
    required this.branches, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final today = summary?['today'];
    final month = summary?['this_month'];
    final recent = (summary?['recent_transactions'] as List?) ?? [];

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            backgroundColor: AppTheme.primaryColor,
            expandedHeight: 140,
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
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Manager Portal', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        Text('${user['first_name']} ${user['last_name']}',
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('${branches.length} branch${branches.length != 1 ? 'es' : ''}',
                          style: const TextStyle(color: Colors.white60, fontSize: 12)),
                      ]),
                    ),
                    IconButton(
                      icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                      onPressed: () => context.push('/notifications'),
                    ),
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
                // Stats grid
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12, mainAxisSpacing: 12,
                  childAspectRatio: 1.1,
                  children: [
                    InfoCard(title: 'Transactions Today', value: '${today?['transaction_count'] ?? 0}',
                      icon: Icons.swap_horiz, subtitle: 'All agents'),
                    InfoCard(title: 'Volume Today', value: 'GH₵ ${_f(today?['total_amount'])}',
                      icon: Icons.bar_chart, iconColor: AppTheme.secondaryColor),
                    InfoCard(title: 'Monthly Commission', value: 'GH₵ ${_f(month?['net_commission'])}',
                      icon: Icons.payments_outlined, iconColor: AppTheme.successColor),
                    InfoCard(title: 'Active Agents', value: '—',
                      icon: Icons.people_outline, iconColor: Colors.blue),
                  ],
                ),
                const SizedBox(height: 20),

                // Branches
                SectionHeader(title: 'MY BRANCHES', actionLabel: 'Manage',
                  onAction: () => context.push('/branches')),
                const SizedBox(height: 8),
                ...branches.take(3).map((b) => _BranchCard(branch: b)),
                if (branches.length > 3)
                  TextButton(
                    onPressed: () => context.push('/branches'),
                    child: Text('View all ${branches.length} branches'),
                  ),

                const SizedBox(height: 16),

                // Recent Transactions
                SectionHeader(title: 'RECENT TRANSACTIONS', actionLabel: 'See All',
                  onAction: () => context.push('/transactions')),
                const SizedBox(height: 8),
                if (recent.isEmpty)
                  const EmptyState(icon: Icons.receipt_long_outlined, title: 'No recent transactions')
                else
                  ...recent.take(5).map((tx) => _TxTile(tx: tx)),
              ],
              const SizedBox(height: 80),
            ])),
          ),
        ],
      ),
    );
  }

  String _f(dynamic v) => NumberFormat('#,##0.00').format(double.tryParse(v?.toString() ?? '0') ?? 0);
}

class _BranchCard extends StatelessWidget {
  final Map<String, dynamic> branch;
  const _BranchCard({required this.branch});

  @override
  Widget build(BuildContext context) {
    final float = double.tryParse(branch['total_float']?.toString() ?? '0') ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
          child: const Icon(Icons.store, color: AppTheme.primaryColor),
        ),
        title: Text(branch['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${branch['agent_count'] ?? 0} agents · Float: GH₵ ${float.toStringAsFixed(2)}',
          style: const TextStyle(fontSize: 12)),
        trailing: StatusBadge(status: branch['status'] ?? 'active'),
        onTap: () => context.push('/branches'),
      ),
    );
  }
}

class _TxTile extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TxTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final amount = double.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: ProviderBadge(provider: tx['provider'] ?? ''),
        title: Text(
          (tx['transaction_type'] ?? '').toString().replaceAll('_', ' '),
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        subtitle: Text('${tx['agent_name'] ?? ''} · ${tx['branch_name'] ?? ''}',
          style: const TextStyle(fontSize: 11)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            GhsAmount(amount: amount, fontSize: 13),
            StatusBadge(status: tx['status'] ?? ''),
          ],
        ),
        onTap: () => context.push('/transactions/${tx['id']}'),
      ),
    );
  }
}

// ── Agents Tab ────────────────────────────────────────────────

class _AgentsTab extends StatelessWidget {
  final List<dynamic> agents;
  final bool loading;
  const _AgentsTab({required this.agents, required this.loading});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agents')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : agents.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No agents yet')
              : ListView.builder(
                  padding: const EdgeInsets.all(8),
                  itemCount: agents.length,
                  itemBuilder: (_, i) {
                    final a = agents[i] as Map<String, dynamic>;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
                          child: Text(
                            ((a['first_name'] as String?) ?? 'A')[0].toUpperCase(),
                            style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold),
                          ),
                        ),
                        title: Text('${a['first_name']} ${a['last_name']}',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(a['phone'] ?? a['email'] ?? '', style: const TextStyle(fontSize: 12)),
                        trailing: StatusBadge(status: a['status'] ?? 'active'),
                      ),
                    );
                  },
                ),
    );
  }
}

// ── Float Tab ─────────────────────────────────────────────────

class _FloatTab extends StatelessWidget {
  final List<dynamic> accounts;
  final bool loading;
  const _FloatTab({required this.accounts, required this.loading});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Float Overview')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : accounts.isEmpty
              ? const EmptyState(icon: Icons.account_balance_wallet_outlined, title: 'No float accounts')
              : ListView.builder(
                  padding: const EdgeInsets.all(8),
                  itemCount: accounts.length,
                  itemBuilder: (_, i) {
                    final acc = accounts[i] as Map<String, dynamic>;
                    final balance = double.tryParse(acc['current_balance']?.toString() ?? '0') ?? 0;
                    final threshold = double.tryParse(acc['low_balance_threshold']?.toString() ?? '500') ?? 500;
                    final isLow = balance <= threshold;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        leading: ProviderBadge(provider: acc['provider'] ?? ''),
                        title: Text(acc['branch_name'] ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(isLow ? '⚠️ Low float alert' : 'Normal',
                          style: TextStyle(color: isLow ? AppTheme.errorColor : AppTheme.successColor, fontSize: 12)),
                        trailing: GhsAmount(
                          amount: balance, fontSize: 15,
                          color: isLow ? AppTheme.errorColor : null,
                        ),
                      ),
                    );
                  },
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
          _Tile(Icons.bar_chart_outlined, 'Reports', () => context.push('/reports')),
          _Tile(Icons.smart_toy_outlined, 'AI Assistant', () => context.push('/ai')),
          _Tile(Icons.swap_horiz, 'Transactions', () => context.push('/transactions')),
          _Tile(Icons.storefront_outlined, 'Business Hub', () => context.push('/marketplace')),
          _Tile(Icons.settings_outlined, 'Settings', () => context.push('/settings')),
          const Divider(),
          _Tile(Icons.logout, 'Sign Out', () => context.read<AuthBloc>().add(AuthLogoutEvent()),
            color: AppTheme.errorColor),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  const _Tile(this.icon, this.label, this.onTap, {this.color});
  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: color ?? AppTheme.primaryColor),
    title: Text(label, style: TextStyle(color: color)),
    trailing: const Icon(Icons.chevron_right, color: Colors.grey),
    onTap: onTap,
  );
}
