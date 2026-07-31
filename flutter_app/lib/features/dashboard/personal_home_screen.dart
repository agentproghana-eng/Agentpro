// personal_home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/widgets/personal_ad_banner.dart';
import '../../shared/widgets/personal_transaction_item.dart';

/// Real Personal Home - matches the same fixed-header/CustomScrollView
/// structure already shared by Owner/Manager/Agent's HomeTab (frozen
/// gradient header outside the scrollable area, provider tabs, quick
/// actions, recent transactions). Identity block content deliberately
/// differs from HomeTab's: Personal has no company or company role, so
/// those two lines show "Welcome" (white) / first name (gold) / plan
/// status (white70) instead of name/company/role. No AppBar, matching
/// HomeTab exactly - Sign Out and the mode switch live in the MORE
/// section below instead, same as Agent's own Sign Out does.
class PersonalHomeScreen extends StatefulWidget {
  const PersonalHomeScreen({super.key});
  @override
  State<PersonalHomeScreen> createState() => _PersonalHomeScreenState();
}

class _PersonalHomeScreenState extends State<PersonalHomeScreen> {
  String _provider = 'mtn';
  Map<String, SimCard?>? _simMap;
  List<dynamic> _recent = [];
  bool _loadingRecent = true;

  final _providers = const [
    {'value': 'mtn', 'label': 'MTN'},
    {'value': 'telecel', 'label': 'Telecel'},
    {'value': 'at_money', 'label': 'AT Money'},
  ];

  final _quickActions = const [
    {'icon': Icons.send_outlined, 'label': 'Send Money\n(Same Network)', 'type': 'send_money_same_network'},
    {'icon': Icons.compare_arrows, 'label': 'Send Money\n(Other Network)', 'type': 'send_money_cross_network'},
    {'icon': Icons.phone_android_outlined, 'label': 'Buy Airtime', 'type': 'buy_airtime'},
    {'icon': Icons.wifi_outlined, 'label': 'Buy Data', 'type': 'buy_data'},
    {'icon': Icons.card_giftcard_outlined, 'label': 'Mash Up', 'type': 'buy_mashup'},
    {'icon': Icons.account_balance_wallet_outlined, 'label': 'Check MoMo\nBalance', 'type': 'check_momo_balance'},
    {'icon': Icons.sim_card_outlined, 'label': 'Check Airtime\nBalance', 'type': 'check_airtime_balance'},
  ];

  @override
  void initState() {
    super.initState();
    _loadSimMap();
    _loadRecent();
  }

  // Same shape as the Agent HomeTab's _load() (limit=5, filtered by the
  // selected provider tab) - just pointed at /personal-transactions.
  Future<void> _loadRecent() async {
    setState(() => _loadingRecent = true);
    try {
      final res = await ApiClient.instance.get('/personal-transactions', queryParameters: {'limit': 5, 'provider': _provider});
      if (mounted) setState(() { _recent = res.data['data'] ?? []; _loadingRecent = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingRecent = false);
    }
  }

  // Mirrors the Agent Home tab's SIM-detection pattern exactly (retry
  // once if every provider comes back null, fall back to showing all
  // three tabs on any detection failure), plus one extra step: if this
  // user holds both Business and Personal capability and has tagged
  // their SIMs via Settings > SIM Purpose, exclude whichever SIM is
  // tagged 'agent' - that one is reserved for Business use, not shown
  // here. Falls back to showing every detected SIM as Personal-
  // available if no purposes have been saved yet.
  Future<void> _loadSimMap() async {
    try {
      var map = await SimCardService.getNetworkSimMap();
      if (map.values.every((v) => v == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));
        if (!mounted) return;
        map = await SimCardService.getNetworkSimMap();
      }

      Map<int, String> purposes = {};
      try {
        final res = await ApiClient.instance.get('/user-sim-purposes');
        final saved = (res.data['data'] as List?) ?? [];
        for (final p in saved) {
          purposes[p['sim_slot'] as int] = p['purpose'] as String;
        }
      } catch (_) {
        // No saved purposes yet, or fetch failed - every detected SIM
        // stays available for Personal use.
      }

      if (purposes.isNotEmpty) {
        map = Map.fromEntries(map.entries.map((e) {
          final sim = e.value;
          if (sim != null && purposes[sim.slot] == 'agent') {
            return MapEntry(e.key, null);
          }
          return e;
        }));
      }

      if (!mounted) return;
      setState(() {
        _simMap = map;
        if (map[_provider] == null) {
          final firstAvailable = map.entries.firstWhere((e) => e.value != null, orElse: () => map.entries.first).key;
          _provider = firstAvailable;
        }
      });
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null so
      // the UI falls back to showing all three tabs.
    }
  }

  // Business role field ('agent'/'manager'/'business_owner'/'auditor')
  // mirrors AppRouter._homeForRole's own mapping exactly - duplicated
  // here rather than exposed from AppRouter, since it's a tiny switch
  // and not worth changing that method's visibility for.
  String _businessHomeRoute(String? role) {
    switch (role) {
      case 'agent': return '/agent';
      case 'manager': return '/manager';
      case 'business_owner': return '/owner';
      case 'auditor': return '/owner';
      default: return '/agent';
    }
  }

  void _startTransaction(String type) {
    final sim = _simMap?[_provider];
    final query = <String, String>{
      'type': type,
      'provider': _provider,
      if (sim != null) 'sim_slot': sim.slot.toString(),
      if (sim != null) 'sim_iccid': sim.iccid,
    };
    final uri = Uri(path: '/personal-transactions/new', queryParameters: query);
    context.push(uri.toString());
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final user = authState is AuthAuthenticated ? authState.user : <String, dynamic>{};
    final firstName = user['first_name'] ?? '';
    final hasBusinessRole = user['company_id'] != null;
    final isPaid = user['personal_subscription_plan'] == 'paid';

    final noSimsDetected = _simMap != null && _simMap!.values.every((v) => v == null);
    final visibleProviders = _simMap == null
        ? _providers
        : _providers.where((p) => _simMap![p['value']] != null).toList();

    return Scaffold(
      body: Column(children: [
        // Fixed header - deliberately OUTSIDE the CustomScrollView
        // below, matching HomeTab's own approach exactly, for the same
        // reason: living outside the scrollable area is what keeps it
        // genuinely frozen rather than just pinned-but-collapsing.
        SafeArea(
          bottom: false,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [AppTheme.primaryColor, Color(0xFF004D43)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('assets/images/agentpro-icon.png', height: 26),
                    const SizedBox(width: 8),
                    const Text.rich(TextSpan(children: [
                      TextSpan(text: 'Agent', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
                      TextSpan(text: 'Pro', style: TextStyle(color: AppTheme.secondaryColor, fontSize: 17, fontWeight: FontWeight.w800)),
                    ])),
                  ],
                ),
              ),
              const SizedBox(height: 2),
              const Text('Welcome', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
              Text(firstName, style: const TextStyle(color: AppTheme.secondaryColor, fontSize: 12.5, fontWeight: FontWeight.w600)),
              Text(isPaid ? 'PAID' : 'FREE', style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
            ]),
          ),
        ),
        Expanded(child: RefreshIndicator(
          onRefresh: () => Future.wait([_loadSimMap(), _loadRecent()]),
          child: CustomScrollView(slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: noSimsDetected
                    ? Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: context.isDarkMode ? const Color(0xFF3D2E1A) : Colors.orange[50], borderRadius: BorderRadius.circular(10)),
                        child: Text('No SIM card detected. Insert a SIM to use transaction features.',
                          style: TextStyle(fontSize: 12, color: context.isDarkMode ? Colors.orange[200] : Colors.orange[900])),
                      )
                    : Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 3)]),
                        child: Row(children: visibleProviders.map((p) {
                          final selected = _provider == p['value'];
                          return Expanded(
                            child: GestureDetector(
                              onTap: () {
                                setState(() { _provider = p['value']!; });
                                _loadRecent();
                              },
                              child: Container(
                                margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                                padding: const EdgeInsets.symmetric(vertical: 9),
                                decoration: BoxDecoration(
                                  color: selected ? AppTheme.primaryColor : Colors.transparent,
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: Text(p['label']!, textAlign: TextAlign.center,
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12,
                                    color: selected ? Colors.white : context.appSecondaryText)),
                              ),
                            ),
                          );
                        }).toList()),
                      ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
              sliver: SliverToBoxAdapter(
                child: GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 3,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 0.85,
                  children: _quickActions.map((a) => _QuickActionTile(
                    icon: a['icon'] as IconData,
                    label: a['label'] as String,
                    onTap: () => _startTransaction(a['type'] as String),
                  )).toList(),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              sliver: SliverToBoxAdapter(
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Recent Transactions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  // Full history is Paid-only per spec - Free users see
                  // the same last-5 preview here, but "See All" nudges
                  // toward upgrading instead of opening a screen they'd
                  // just get a 403 from.
                  GestureDetector(
                    onTap: () => context.push(isPaid ? '/personal-transactions/history' : '/personal-subscription'),
                    child: Row(children: [
                      if (!isPaid) const Padding(padding: EdgeInsets.only(right: 3), child: Icon(Icons.lock_outline, size: 12, color: AppTheme.primaryColor)),
                      const Text('See All', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
                    ]),
                  ),
                ]),
              ),
            ),
            if (_loadingRecent)
              const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator())))
            else if (_recent.isEmpty)
              const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(20), child: Center(child: Text('No transactions yet'))))
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                sliver: SliverList(delegate: SliverChildBuilderDelegate(
                  (context, i) => PersonalTransactionItem(tx: _recent[i] as Map<String, dynamic>),
                  childCount: _recent.length,
                )),
              ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              sliver: SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const SectionHeader(title: 'MORE'),
                  const SizedBox(height: 8),
                  Card(child: ListTile(
                    leading: const Icon(Icons.people_outline, color: AppTheme.primaryColor),
                    title: const Text('Personal Community'),
                    subtitle: const Text('Connect with other Personal users'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/personal-community'),
                  )),
                  Card(child: ListTile(
                    leading: const Icon(Icons.storefront_outlined, color: AppTheme.primaryColor),
                    title: const Text('Business Hub'),
                    subtitle: const Text('Browse or post in the marketplace'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/marketplace'),
                  )),
                  Card(child: ListTile(
                    leading: const Icon(Icons.bar_chart_outlined, color: AppTheme.primaryColor),
                    title: const Text('My Reports'),
                    subtitle: const Text('Download your transaction history'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/personal-reports'),
                  )),
                  if (isPaid)
                    Card(child: ListTile(
                      leading: const Icon(Icons.wifi_tethering, color: AppTheme.primaryColor),
                      title: const Text('USSD Automation'),
                      subtitle: const Text('Auto-dial your transactions'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/personal-ussd-settings'),
                    )),
                  if (isPaid)
                    Card(child: ListTile(
                      leading: const Icon(Icons.route_outlined, color: AppTheme.primaryColor),
                      title: const Text('Custom USSD Flows'),
                      subtitle: const Text('Build your own transaction flows'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/personal-ussd-flows'),
                    )),
                  Card(child: ListTile(
                    leading: const Icon(Icons.workspace_premium_outlined, color: AppTheme.primaryColor),
                    title: const Text('My Subscription'),
                    subtitle: const Text('Manage your Personal plan'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/personal-subscription'),
                  )),
                  // Only shown to someone holding both Business and
                  // Personal capability at once - a one-sided Personal
                  // user has no other mode to switch to.
                  if (hasBusinessRole)
                    Card(child: ListTile(
                      leading: const Icon(Icons.swap_horiz, color: AppTheme.primaryColor),
                      title: const Text('Switch to Business Mode'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go(_businessHomeRoute(user['role'])),
                    )),
                  Card(child: ListTile(
                    leading: const Icon(Icons.logout, color: AppTheme.primaryColor),
                    title: const Text('Sign Out'),
                    onTap: () => context.read<AuthBloc>().add(AuthLogoutEvent()),
                  )),
                ]),
              ),
            ),
          ]),
        )),
        // Free-tier-only per spec - pinned below the scrollable content
        // rather than inside it, so it never scrolls away.
        if (!isPaid) const PersonalAdBanner(),
      ]),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickActionTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 3)],
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: AppTheme.primaryColor, size: 26),
            const SizedBox(height: 6),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

