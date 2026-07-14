import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class AgentDashboard extends StatefulWidget {
  const AgentDashboard({super.key});
  @override
  State<AgentDashboard> createState() => _AgentDashboardState();
}

class _AgentDashboardState extends State<AgentDashboard> {
  int _navIndex = 0;
  Map<String, dynamic>? _summary;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    try {
      final res = await ApiClient.instance.get('/reports/dashboard');
      if (mounted) setState(() { _summary = res.data['data']; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.read<AuthBloc>().state is AuthAuthenticated
        ? (context.read<AuthBloc>().state as AuthAuthenticated).user
        : <String, dynamic>{};

    return Scaffold(
      backgroundColor: Colors.grey[50],
      body: IndexedStack(
        index: _navIndex,
        children: [
          _HomeTab(summary: _summary, loading: _loading, user: user, onRefresh: _loadSummary),
          const _TransactionsTab(),
          const _FloatTab(),
          const _MoreTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (i) => setState(() => _navIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.swap_horiz_outlined), selectedIcon: Icon(Icons.swap_horiz), label: 'Transactions'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Float'),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}

// ── Home Tab ──────────────────────────────────────────────────

class _HomeTab extends StatelessWidget {
  final Map<String, dynamic>? summary;
  final bool loading;
  final Map<String, dynamic> user;
  final VoidCallback onRefresh;

  const _HomeTab({this.summary, required this.loading, required this.user, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final greeting = now.hour < 12 ? 'Good morning' : now.hour < 17 ? 'Good afternoon' : 'Good evening';
    final today = summary?['today'];
    final month = summary?['this_month'];
    final recent = (summary?['recent_transactions'] as List?) ?? [];

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: CustomScrollView(
        slivers: [
          // App Bar
          SliverAppBar(
            expandedHeight: 160,
            pinned: true,
            backgroundColor: AppTheme.primaryColor,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppTheme.primaryColor, Color(0xFF004D43)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 34, height: 34,
                          margin: const EdgeInsets.only(right: 10),
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.15), borderRadius: BorderRadius.circular(9)),
                          child: Image.asset("assets/images/agentpro-logo.png", fit: BoxFit.contain),
                        ),
                        CircleAvatar(
                          backgroundColor: Colors.white.withOpacity(0.2),
                          child: Text(
                            ((user['first_name'] as String?) ?? 'A')[0].toUpperCase(),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('$greeting,', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                              Text(
                                '${user['first_name'] ?? ''} ${user['last_name'] ?? ''}',
                                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                          onPressed: () => context.push('/notifications'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            actions: const [],
          ),

          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([

                // Quick Actions
                const SectionHeader(title: 'QUICK ACTIONS'),
                const SizedBox(height: 12),
                _QuickActions(),

                const SizedBox(height: 20),

                // Today's Stats
                const SectionHeader(title: "TODAY'S SUMMARY"),
                const SizedBox(height: 12),
                if (loading)
                  const Center(child: CircularProgressIndicator())
                else
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.1,
                    children: [
                      InfoCard(
                        title: 'Transactions',
                        value: '${today?['transaction_count'] ?? 0}',
                        icon: Icons.swap_horiz,
                        subtitle: 'Today',
                      ),
                      InfoCard(
                        title: 'Volume',
                        value: 'GH₵ ${_fmt(today?['total_amount'])}',
                        icon: Icons.bar_chart,
                        iconColor: AppTheme.secondaryColor,
                        subtitle: 'Today',
                      ),
                      InfoCard(
                        title: 'Commission',
                        value: 'GH₵ ${_fmt(month?['net_commission'])}',
                        icon: Icons.payments_outlined,
                        iconColor: AppTheme.successColor,
                        subtitle: 'This month',
                      ),
                      InfoCard(
                        title: 'Success Rate',
                        value: today?['transaction_count'] == 0
                            ? '—'
                            : '${(((today?['success_count'] ?? 0) / (today?['transaction_count'] ?? 1)) * 100).toStringAsFixed(0)}%',
                        icon: Icons.check_circle_outline,
                        iconColor: AppTheme.successColor,
                        subtitle: 'Today',
                      ),
                    ],
                  ),

                const SizedBox(height: 20),

                // Recent Transactions
                SectionHeader(
                  title: 'RECENT TRANSACTIONS',
                  actionLabel: 'See All',
                  onAction: () => context.push('/transactions'),
                ),
                const SizedBox(height: 8),
                if (recent.isEmpty)
                  const EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No transactions yet',
                    subtitle: 'Your recent transactions will appear here',
                  )
                else
                  ...recent.map((tx) => _TransactionTile(tx: tx)),

                const SizedBox(height: 80),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(dynamic v) => NumberFormat('#,##0.00').format(double.tryParse(v?.toString() ?? '0') ?? 0);
}

// ── Quick Actions Grid ────────────────────────────────────────

class _QuickActions extends StatelessWidget {
  final actions = const [
    {'label': 'Cash In', 'icon': Icons.add_circle_outline, 'type': 'cash_in', 'color': 0xFF006B5E},
    {'label': 'Cash Out', 'icon': Icons.remove_circle_outline, 'type': 'cash_out', 'color': 0xFFE65100},
    {'label': 'Send Money', 'icon': Icons.send_outlined, 'type': 'send_money', 'color': 0xFF1565C0},
    {'label': 'Merchant Pay', 'icon': Icons.store_outlined, 'type': 'merchant_payment', 'color': 0xFF6A1B9A},
    {'label': 'Bill Pay', 'icon': Icons.receipt_outlined, 'type': 'bill_payment', 'color': 0xFF00838F},
    {'label': 'Airtime', 'icon': Icons.phone_android_outlined, 'type': 'airtime', 'color': 0xFF558B2F},
    {'label': 'Data Bundle', 'icon': Icons.wifi_outlined, 'type': 'data_bundle', 'color': 0xFFAD1457},
    {'label': 'Balance', 'icon': Icons.account_balance_outlined, 'type': 'balance_enquiry', 'color': 0xFF4527A0},
  ];

  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      childAspectRatio: 0.85,
      children: actions.map((a) {
        final color = Color(a['color'] as int);
        return InkWell(
          onTap: () => context.push('/transactions?type=${a['type']}'),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[200]!),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
                  child: Icon(a['icon'] as IconData, color: color, size: 22),
                ),
                const SizedBox(height: 6),
                Text(a['label'] as String,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Transaction Tile ──────────────────────────────────────────

class _TransactionTile extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final provider = tx['provider'] ?? '';
    final type = (tx['transaction_type'] ?? '').toString().replaceAll('_', ' ');
    final amount = double.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
    final date = tx['created_at'] != null
        ? DateFormat('dd MMM, HH:mm').format(DateTime.parse(tx['created_at']))
        : '';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: AppTheme.providerColor(provider).withOpacity(0.15),
          child: Icon(Icons.swap_horiz, color: AppTheme.providerColor(provider)),
        ),
        title: Row(
          children: [
            Text(type, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(width: 8),
            ProviderBadge(provider: provider),
          ],
        ),
        subtitle: Text(tx['customer_phone'] ?? '', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            GhsAmount(amount: amount, fontSize: 14),
            const SizedBox(height: 2),
            StatusBadge(status: tx['status'] ?? ''),
          ],
        ),
        onTap: () => context.push('/transactions/${tx['id']}'),
      ),
    );
  }
}

// ── Transactions Tab ──────────────────────────────────────────

class _TransactionsTab extends StatelessWidget {
  const _TransactionsTab();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transactions')),
      body: const Center(child: Text('Transaction list — tap a Quick Action to start')),
      floatingActionButton: null,
    );
  }
}

// ── Float Tab ─────────────────────────────────────────────────

class _FloatTab extends StatelessWidget {
  const _FloatTab();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Float')),
      body: const Center(child: Text('Loading float...')),
    );
  }
}

// ── More Tab ──────────────────────────────────────────────────

class _MoreTab extends StatelessWidget {
  const _MoreTab();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          _MoreTile(Icons.bar_chart_outlined, 'Reports', () => context.push('/reports')),
          _MoreTile(Icons.smart_toy_outlined, 'AI Assistant', () => context.push('/ai')),
          _MoreTile(Icons.storefront_outlined, 'Business Hub', () => context.push('/marketplace')),
          _MoreTile(Icons.card_membership_outlined, 'Subscription', () => context.push('/subscription')),
          _MoreTile(Icons.settings_outlined, 'Settings', () => context.push('/settings')),
          const Divider(),
          _MoreTile(Icons.logout, 'Sign Out', () {
            context.read<AuthBloc>().add(AuthLogoutEvent());
          }, color: AppTheme.errorColor),
        ],
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  const _MoreTile(this.icon, this.label, this.onTap, {this.color});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color ?? AppTheme.primaryColor),
      title: Text(label, style: TextStyle(color: color)),
      trailing: const Icon(Icons.chevron_right, color: Colors.grey),
      onTap: onTap,
    );
  }
}
