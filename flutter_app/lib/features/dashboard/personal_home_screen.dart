// personal_home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';
import '../../shared/widgets/personal_ad_banner.dart';

/// Real Personal Home - provider-aware Quick Actions per spec. The
/// actual Personal transaction screens don't exist yet (a later build
/// step); each Quick Action tile is honest about that rather than
/// navigating to a route that doesn't exist - shows what it will do,
/// with a "coming soon" message instead of a broken navigation.
class PersonalHomeScreen extends StatefulWidget {
  const PersonalHomeScreen({super.key});
  @override
  State<PersonalHomeScreen> createState() => _PersonalHomeScreenState();
}

class _PersonalHomeScreenState extends State<PersonalHomeScreen> {
  String _provider = 'mtn';
  Map<String, SimCard?>? _simMap;

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
      appBar: AppBar(
        title: const Text('Agent Pro Ghana'),
        actions: [
          // Only shown to someone holding both Business and Personal
          // capability at once - a one-sided Personal user has no
          // other mode to switch to.
          if (hasBusinessRole)
            TextButton.icon(
              onPressed: () => context.go(_businessHomeRoute(user['role'])),
              icon: const Icon(Icons.swap_horiz, color: Colors.white, size: 18),
              label: const Text('Business Mode', style: TextStyle(color: Colors.white, fontSize: 12)),
            ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AuthBloc>().add(AuthLogoutEvent()),
          ),
        ],
      ),
      body: Column(children: [
        Expanded(child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Welcome, $firstName!', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),

          if (noSimsDetected)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.orange[50], borderRadius: BorderRadius.circular(10)),
              child: const Text('No SIM card detected. Insert a SIM to use transaction features.',
                style: TextStyle(fontSize: 12)),
            )
          else
            Row(children: visibleProviders.map((p) {
              final selected = _provider == p['value'];
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _provider = p['value']!),
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: selected ? AppTheme.primaryColor : context.appSurface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(p['label']!, textAlign: TextAlign.center,
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12,
                        color: selected ? Colors.white : context.appSecondaryText)),
                  ),
                ),
              );
            }).toList()),

          const SizedBox(height: 20),
          const SectionHeader(title: 'QUICK ACTIONS'),
          const SizedBox(height: 8),
          GridView.count(
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

          const SizedBox(height: 20),
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
          Card(child: ListTile(
            leading: const Icon(Icons.workspace_premium_outlined, color: AppTheme.primaryColor),
            title: const Text('My Subscription'),
            subtitle: const Text('Manage your Personal plan'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/personal-subscription'),
          )),
        ],
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
