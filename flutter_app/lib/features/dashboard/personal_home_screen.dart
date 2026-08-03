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
import '../ussd_settings/quick_action_customization_screen.dart';
import '../../shared/widgets/offline_status_banner.dart';

/// The Home tab of PersonalDashboard - matches the same fixed-header/
/// CustomScrollView structure already shared by Owner/Manager/Agent's
/// HomeTab (frozen gradient header outside the scrollable area,
/// provider tabs, quick actions, recent transactions). Identity block
/// content deliberately differs from HomeTab's: Personal has no
/// company or company role, so those two lines show "Welcome" (white)
/// / first name (gold) / plan status (white70) instead of name/
/// company/role. No AppBar, matching HomeTab exactly. Community,
/// Business Hub, and everything else (Reports, USSD settings,
/// Subscription, Switch to Business Mode, Sign Out) live in
/// PersonalDashboard's other tabs, not here - this file is Home only.
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
  Map<String, List<String>> _personalQuickActions = {};

  final _providers = const [
    {'value': 'mtn', 'label': 'MTN'},
    {'value': 'telecel', 'label': 'Telecel'},
    {'value': 'at_money', 'label': 'AT Money'},
  ];

  @override
  void initState() {
    super.initState();
    _loadSimMap();
    _loadRecent();
    _loadQuickActions();
  }

  // Same shape as the Agent HomeTab's _load() (limit=5, filtered by the
  // selected provider tab) - just pointed at /personal-transactions.
  Future<void> _loadQuickActions() async {
    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');

      final data =
          response.data['data'] as Map<String, dynamic>? ?? <String, dynamic>{};

      final personal = data['personal'];

      if (!mounted || personal is! Map) return;

      final parsed = <String, List<String>>{};

      for (final provider in ['mtn', 'telecel', 'at_money']) {
        final value = personal[provider];

        if (value is List) {
          parsed[provider] = value.whereType<String>().take(9).toList();
        }
      }

      setState(() => _personalQuickActions = parsed);
    } catch (_) {
      // Continue using defaults.
    }
  }

  List<QuickActionDefinition> get _visibleQuickActions {
    final saved = _personalQuickActions[_provider];

    final types = saved != null
        ? saved
        : List<String>.from(
            kPersonalQuickActionDefaults[_provider] ?? const <String>[],
          );

    final result = <QuickActionDefinition>[];

    for (final type in types.take(9)) {
      for (final definition in kPersonalQuickActionDefinitions) {
        if (definition.type == type) {
          result.add(definition);
          break;
        }
      }
    }

    return result;
  }

  Future<void> _loadRecent() async {
    setState(() => _loadingRecent = true);
    try {
      final res = await ApiClient.instance.get(
        '/personal-transactions',
        queryParameters: {'limit': 5, 'provider': _provider},
      );
      if (mounted)
        setState(() {
          _recent = res.data['data'] ?? [];
          _loadingRecent = false;
        });
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
        map = Map.fromEntries(
          map.entries.map((e) {
            final sim = e.value;
            if (sim != null && purposes[sim.slot] == 'agent') {
              return MapEntry(e.key, null);
            }
            return e;
          }),
        );
      }

      if (!mounted) return;
      setState(() {
        _simMap = map;
        if (map[_provider] == null) {
          final firstAvailable = map.entries
              .firstWhere(
                (e) => e.value != null,
                orElse: () => map.entries.first,
              )
              .key;
          _provider = firstAvailable;
        }
      });
    } catch (_) {
      // Permission denied or detection failed - leave _simMap null so
      // the UI falls back to showing all three tabs.
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
    final user = authState is AuthAuthenticated
        ? authState.user
        : <String, dynamic>{};
    final firstName = user['first_name'] ?? '';
    final isPaid = user['personal_subscription_plan'] == 'paid';

    final noSimsDetected =
        _simMap != null && _simMap!.values.every((v) => v == null);
    final visibleProviders = _simMap == null
        ? _providers
        : _providers.where((p) => _simMap![p['value']] != null).toList();

    return Scaffold(
      body: Column(
        children: [
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
                gradient: LinearGradient(
                  colors: [AppTheme.primaryColor, Color(0xFF004D43)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Image.asset(
                          'assets/images/agentpro-icon.png',
                          height: 26,
                        ),
                        const SizedBox(width: 8),
                        const Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: 'Agent',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              TextSpan(
                                text: 'Pro',
                                style: TextStyle(
                                  color: AppTheme.secondaryColor,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Welcome',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    firstName,
                    style: const TextStyle(
                      color: AppTheme.secondaryColor,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    isPaid ? 'PAID' : 'FREE',
                    style: const TextStyle(
                      color: Colors.white60,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => Future.wait([
                _loadSimMap(),
                _loadRecent(),
                _loadQuickActions(),
              ]),
              child: CustomScrollView(
                slivers: [
                  const SliverToBoxAdapter(child: OfflineStatusBanner()),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: noSimsDetected
                          ? Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: context.isDarkMode
                                    ? const Color(0xFF3D2E1A)
                                    : Colors.orange[50],
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                'No SIM card detected. Insert a SIM to use transaction features.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: context.isDarkMode
                                      ? Colors.orange[200]
                                      : Colors.orange[900],
                                ),
                              ),
                            )
                          : Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: context.appSurface,
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.06),
                                    blurRadius: 3,
                                  ),
                                ],
                              ),
                              child: Row(
                                children: visibleProviders.map((p) {
                                  final selected = _provider == p['value'];
                                  final color = AppTheme.providerColor(
                                    p['value']!,
                                  );
                                  return Expanded(
                                    child: GestureDetector(
                                      onTap: () {
                                        setState(() {
                                          _provider = p['value']!;
                                        });
                                        _loadRecent();
                                      },
                                      child: AnimatedContainer(
                                        duration: const Duration(
                                          milliseconds: 220,
                                        ),
                                        curve: Curves.easeOutCubic,
                                        margin: const EdgeInsets.symmetric(
                                          horizontal: 2,
                                          vertical: 2,
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 10,
                                        ),
                                        decoration: BoxDecoration(
                                          color: selected
                                              ? color
                                              : Colors.transparent,
                                          borderRadius: BorderRadius.circular(
                                            11,
                                          ),
                                          boxShadow: selected
                                              ? [
                                                  BoxShadow(
                                                    color: color.withOpacity(
                                                      0.20,
                                                    ),
                                                    blurRadius: 7,
                                                    offset: const Offset(0, 2),
                                                  ),
                                                ]
                                              : null,
                                        ),
                                        child: Text(
                                          p['label']!,
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
                                            color: selected
                                                ? (p['value'] == 'mtn'
                                                      ? Colors.black
                                                      : Colors.white)
                                                : context.appSecondaryText,
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
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
                        children: _visibleQuickActions
                            .map(
                              (action) => _QuickActionTile(
                                icon: action.icon,
                                label: action.label,
                                onTap: () => _startTransaction(action.type),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 7),
                    sliver: SliverToBoxAdapter(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Recent Transactions',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          // Full history is Paid-only per spec - Free users see
                          // the same last-5 preview here, but "See All" nudges
                          // toward upgrading instead of opening a screen they'd
                          // just get a 403 from.
                          GestureDetector(
                            onTap: () => context.push(
                              isPaid
                                  ? '/personal-transactions/history'
                                  : '/personal-subscription',
                            ),
                            child: Row(
                              children: [
                                if (!isPaid)
                                  const Padding(
                                    padding: EdgeInsets.only(right: 3),
                                    child: Icon(
                                      Icons.lock_outline,
                                      size: 12,
                                      color: AppTheme.primaryColor,
                                    ),
                                  ),
                                const Text(
                                  'See All',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.primaryColor,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_loadingRecent)
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(30),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    )
                  else if (_recent.isEmpty)
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(child: Text('No transactions yet')),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => PersonalTransactionItem(
                            tx: _recent[i] as Map<String, dynamic>,
                          ),
                          childCount: _recent.length,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          // Free-tier-only per spec - pinned below the scrollable content
          // rather than inside it, so it never scrolls away.
          if (!isPaid) const PersonalAdBanner(),
        ],
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.appSecondaryText.withOpacity(0.07)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.055),
              blurRadius: 9,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        padding: const EdgeInsets.all(10),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(
                  context.isDarkMode ? 0.20 : 0.10,
                ),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: AppTheme.primaryColor, size: 23),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}
