import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';
import 'home_tab.dart';

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
            HomeTab(user: user),
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
