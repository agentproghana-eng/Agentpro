import 'dart:async';
// personal_home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_bloc.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/dashboard_refresh_service.dart';
import '../../core/router/app_router.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/personal_ad_banner.dart';
import '../../shared/widgets/personal_transaction_item.dart';
import '../ussd_settings/quick_action_catalog.dart';
import '../ussd_settings/quick_action_preference.dart';
import '../../shared/widgets/offline_status_banner.dart';
import '../../shared/widgets/dashboard_skeleton.dart';
import '../../shared/widgets/dashboard_empty_state.dart';

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

class _PersonalHomeScreenState extends State<PersonalHomeScreen>
    with RouteAware {
  String _provider = 'mtn';
  Map<String, SimCard?>? _simMap;
  Map<String, List<SimCard>> _personalSimsByProvider = const {};
  int? _selectedSimSlot;
  List<dynamic> _recent = [];
  bool _loadingRecent = true;
  Map<String, List<QuickActionPreference>> _personalQuickActions = {};
  QuickActionCatalog? _quickActionCatalog;
  StreamSubscription<DashboardRefreshEvent>? _dashboardRefreshSubscription;
  bool _highlightNewestTransaction = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    routeObserver.subscribe(this, ModalRoute.of(context) as PageRoute);
  }

  @override
  void initState() {
    super.initState();

    _dashboardRefreshSubscription = DashboardRefreshService.events.listen(
      _handleDashboardRefresh,
    );

    unawaited(_refreshPersonalContext());
  }

  @override
  void didPopNext() {
    unawaited(_refreshPersonalContext());
  }

  Future<void> _refreshPersonalContext() async {
    await Future.wait([
      _loadSimMap(),
      _loadQuickActions(),
    ]);

    if (!mounted) return;

    await _loadRecent();
  }

  Future<void> _handleDashboardRefresh(DashboardRefreshEvent event) async {
    if (!event.isPersonal || !mounted) return;

    final providerSims =
        _personalSimsByProvider[event.provider] ?? const <SimCard>[];

    if (_simMap != null && providerSims.isEmpty) {
      return;
    }

    SimCard? eventSim;

    if (event.simSlot != null) {
      for (final sim in providerSims) {
        if (sim.slot == event.simSlot) {
          eventSim = sim;
          break;
        }
      }
    }

    final providerChanged = _provider != event.provider;
    final exactSimChanged =
        eventSim != null && _selectedSimSlot != eventSim.slot;

    if (providerChanged || exactSimChanged) {
      setState(() {
        _provider = event.provider;

        if (eventSim != null) {
          _selectedSimSlot = eventSim.slot;
        } else if (providerChanged && providerSims.isNotEmpty) {
          _selectedSimSlot = providerSims.first.slot;
        }
      });
    }

    await _loadRecent();

    if (!mounted || _recent.isEmpty) return;

    setState(() => _highlightNewestTransaction = true);

    await Future.delayed(const Duration(milliseconds: 1400));

    if (mounted) {
      setState(() => _highlightNewestTransaction = false);
    }
  }

  Widget _animateNewestTransaction({
    required Widget child,
    required bool isNewest,
  }) {
    if (!isNewest) return child;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      transform: Matrix4.translationValues(
        0,
        _highlightNewestTransaction ? 0 : 4,
        0,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: _highlightNewestTransaction
              ? AppTheme.primaryColor.withValues(alpha: 0.42)
              : Colors.transparent,
        ),
      ),
      child: child,
    );
  }

  // Same shape as the Agent HomeTab's _load() (limit=5, filtered by the
  // selected provider tab) - just pointed at /personal-transactions.
  Future<void> _loadQuickActions() async {
    QuickActionCatalog? catalog;

    try {
      catalog = await QuickActionCatalog.load(
        mode: 'personal',
      );

      if (mounted) {
        setState(() {
          _quickActionCatalog = catalog;

          // Once SIM detection has completed, the physical
          // Personal-assigned SIM is the provider source of truth.
          // The catalog only decides which actions that provider has.
          if (_simMap == null &&
              catalog!.providers.isNotEmpty &&
              !catalog.providers.contains(_provider)) {
            _provider = catalog.providers.first;
          }
        });
      }
    } catch (_) {
      // Existing saved actions remain usable with generic fallbacks.
    }

    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');

      final data =
          response.data['data'] as Map<String, dynamic>? ?? <String, dynamic>{};

      final personal = data['personal'];

      if (!mounted || personal is! Map) return;

      final parsed = <String, List<QuickActionPreference>>{};

      for (final entry in personal.entries) {
        final provider = entry.key.toString().trim();
        final value = entry.value;

        if (provider.isEmpty || value is! List) {
          continue;
        }

        final items = <QuickActionPreference>[];

        for (var index = 0; index < value.length; index++) {
          try {
            final preference = QuickActionPreference.fromDynamic(
              value[index],
              fallbackPosition: index,
            );

            if (preference.actionKey.trim().isEmpty) {
              continue;
            }

            items.add(preference);
          } catch (_) {
            // Ignore malformed individual records.
          }
        }

        items.sort(
          (a, b) => a.position.compareTo(b.position),
        );

        parsed[provider] = items
            .take(9)
            .toList()
            .asMap()
            .entries
            .map(
              (entry) => entry.value.copyWith(
                position: entry.key,
              ),
            )
            .toList();
      }

      if (mounted) {
        setState(() {
          _personalQuickActions = parsed;

          final providers = <String>{
            ...?_quickActionCatalog?.providers,
            ..._personalQuickActions.keys,
          };

          if (_simMap == null &&
              providers.isNotEmpty &&
              providers.contains(_provider) == false) {
            _provider = providers.first;
          }
        });
      }
    } catch (_) {
      // Catalog defaults remain available when preferences cannot load.
    }
  }

  QuickActionCatalogDefinition? _quickActionDefinition(
    String type,
  ) {
    return _quickActionCatalog?.definitionFor(
      _provider,
      type,
    );
  }

  List<QuickActionPreference> get _visibleQuickActions {
    final saved = _personalQuickActions[_provider];

    if (saved == null) {
      final definitions = _quickActionCatalog?.definitionsFor(_provider) ??
          const <QuickActionCatalogDefinition>[];

      return definitions
          .take(9)
          .toList()
          .asMap()
          .entries
          .map(
            (entry) => QuickActionPreference(
              actionKey: entry.value.type,
              position: entry.key,
            ),
          )
          .toList();
    }

    return saved.where((item) => item.isVisible).take(9).toList();
  }

  List<QuickActionPreference> get _homeQuickActions =>
      normalizePersonalQuickActionPreferences(
        preferences: _visibleQuickActions,
      );

  String _providerLabel(String provider) {
    return quickActionProviderLabel(provider);
  }

  List<SimCard> get _selectedProviderSims =>
      _personalSimsByProvider[_provider] ?? const <SimCard>[];

  SimCard? get _selectedSim {
    final sims = _selectedProviderSims;

    if (sims.isEmpty) return null;

    final selectedSlot = _selectedSimSlot;

    if (selectedSlot != null) {
      for (final sim in sims) {
        if (sim.slot == selectedSlot) {
          return sim;
        }
      }
    }

    return sims.first;
  }

  void _selectProvider(String provider) {
    final sims = _personalSimsByProvider[provider] ?? const <SimCard>[];

    setState(() {
      _provider = provider;
      _selectedSimSlot = sims.isEmpty ? null : sims.first.slot;
    });

    unawaited(_loadRecent());
  }

  void _selectPhysicalSim(SimCard sim) {
    if (_provider == sim.network && _selectedSimSlot == sim.slot) {
      return;
    }

    setState(() {
      _provider = sim.network;
      _selectedSimSlot = sim.slot;
    });

    unawaited(_loadRecent());
  }

  Future<void> _loadRecent() async {
    final requestedProvider = _provider;
    final requestedSim = _selectedSim;
    final requestedSimSlot = requestedSim?.slot;

    if (_simMap != null && requestedSim == null) {
      if (mounted) {
        setState(() {
          _recent = [];
          _loadingRecent = false;
        });
      }
      return;
    }

    if (mounted) {
      setState(() => _loadingRecent = true);
    }

    try {
      final res = await ApiClient.instance.get(
        '/personal-transactions',
        queryParameters: {
          'limit': 5,
          'provider': requestedProvider,
          if (requestedSim != null) 'sim_slot': requestedSim.slot,
          if (requestedSim != null && requestedSim.iccid.isNotEmpty)
            'sim_iccid': requestedSim.iccid,
        },
      );

      // A user can switch between two physical SIMs on the same provider
      // while this request is in flight. Provider alone is therefore not
      // enough to decide whether this response still belongs on screen.
      if (mounted &&
          requestedProvider == _provider &&
          requestedSimSlot == _selectedSim?.slot) {
        setState(() {
          _recent = res.data['data'] ?? [];
          _loadingRecent = false;
        });
      }
    } catch (_) {
      if (mounted &&
          requestedProvider == _provider &&
          requestedSimSlot == _selectedSim?.slot) {
        setState(() => _loadingRecent = false);
      }
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
      var detected = await SimCardService.getSimCards();

      if (detected.isEmpty) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) return;

        detected = await SimCardService.getSimCards();
      }

      final purposes = <int, String>{};

      try {
        final res = await ApiClient.instance.get('/user-sim-purposes');
        final saved = (res.data['data'] as List?) ?? const [];

        for (final value in saved) {
          if (value is! Map) continue;

          final slot = value['sim_slot'];
          final purpose = value['purpose'];

          if (slot is int && purpose is String) {
            purposes[slot] = purpose;
          }
        }
      } catch (_) {
        // No saved purposes yet, or purpose lookup failed. In that case
        // every detected supported SIM remains Personal-available.
      }

      final personalSims = detected
          .where(
            (sim) => sim.isMoMoSupported && purposes[sim.slot] != 'agent',
          )
          .toList()
        ..sort((a, b) => a.slot.compareTo(b.slot));

      final byProvider = <String, List<SimCard>>{};
      final map = <String, SimCard?>{
        'mtn': null,
        'telecel': null,
        'at_money': null,
      };

      for (final sim in personalSims) {
        byProvider.putIfAbsent(sim.network, () => <SimCard>[]).add(sim);

        if (map.containsKey(sim.network) && map[sim.network] == null) {
          map[sim.network] = sim;
        }
      }

      SimCard? selectedSim;

      final previousSlot = _selectedSimSlot;

      if (previousSlot != null) {
        for (final sim in personalSims) {
          if (sim.slot == previousSlot) {
            selectedSim = sim;
            break;
          }
        }
      }

      if (selectedSim == null) {
        final currentProviderSims = byProvider[_provider] ?? const <SimCard>[];

        if (currentProviderSims.isNotEmpty) {
          selectedSim = currentProviderSims.first;
        } else if (personalSims.isNotEmpty) {
          selectedSim = personalSims.first;
        }
      }

      if (!mounted) return;

      setState(() {
        _simMap = map;
        _personalSimsByProvider = byProvider;
        _selectedSimSlot = selectedSim?.slot;

        if (selectedSim != null) {
          _provider = selectedSim.network;
        }
      });
    } catch (_) {
      // Permission denied or SIM detection failure: retain the existing
      // catalog fallback instead of inventing physical SIM identities.
    }
  }

  void _startTransaction(String type) {
    final sim = _selectedSim;

    if (_simMap != null && sim == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'No Personal ${_providerLabel(_provider)} SIM is assigned.',
          ),
        ),
      );
      return;
    }

    final query = <String, String>{
      'type': type,
      'provider': _provider,
      if (sim != null) 'sim_slot': sim.slot.toString(),
      if (sim != null && sim.iccid.isNotEmpty) 'sim_iccid': sim.iccid,
      if (sim != null) 'sim_subscription_id': sim.subscriptionId.toString(),
    };
    final uri = Uri(path: '/personal-transactions/new', queryParameters: query);
    context.push(uri.toString());
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    _dashboardRefreshSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final user =
        authState is AuthAuthenticated ? authState.user : <String, dynamic>{};
    final firstName = user['first_name'] ?? '';
    final isPaid = user['personal_subscription_plan'] == 'paid';

    final simMap = _simMap;
    final catalogProviders = _quickActionCatalog?.providers ?? const <String>[];

    final providerCandidates = <String>{
      ...catalogProviders,
      ..._personalQuickActions.keys,
    }.toList();

    // Once SIM detection succeeds, Personal Home is driven by the
    // physical SIMs that remain after Agent-purpose filtering.
    // A provider does not need to have a catalog entry just to appear.
    final personalSimProviders = simMap == null
        ? const <String>[]
        : simMap.entries
            .where((entry) => entry.value != null)
            .map((entry) => entry.key)
            .toList();

    final noSimsDetected = simMap != null && personalSimProviders.isEmpty;

    final visibleProviders =
        simMap == null ? providerCandidates : personalSimProviders;

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
                          width: 32,
                          height: 32,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          isAntiAlias: true,
                        ),
                        const SizedBox(width: 9),
                        const Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: 'Agent',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  height: 1,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.65,
                                ),
                              ),
                              TextSpan(
                                text: 'Pro',
                                style: TextStyle(
                                  color: AppTheme.secondaryColor,
                                  fontSize: 20,
                                  height: 1,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.65,
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
              onRefresh: _refreshPersonalContext,
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
                                'No Personal SIM is assigned. '
                                'Use Settings > SIM Purpose to assign one.',
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
                                    color: Colors.black.withValues(alpha: 0.06),
                                    blurRadius: 3,
                                  ),
                                ],
                              ),
                              child: Row(
                                children: visibleProviders.map((p) {
                                  final selected = _provider == p;
                                  final color = AppTheme.providerColor(
                                    p,
                                  );
                                  return Expanded(
                                    child: GestureDetector(
                                      onTap: () => _selectProvider(p),
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
                                                    color: color.withValues(
                                                      alpha: 0.20,
                                                    ),
                                                    blurRadius: 7,
                                                    offset: const Offset(0, 2),
                                                  ),
                                                ]
                                              : null,
                                        ),
                                        child: Text(
                                          _providerLabel(p),
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
                                            color: selected
                                                ? (p == 'mtn'
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
                  if (_selectedProviderSims.length > 1)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: context.appSurface,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 3,
                              ),
                            ],
                          ),
                          child: Row(
                            children: _selectedProviderSims.map((sim) {
                              final selected = _selectedSimSlot == sim.slot;
                              final providerColor =
                                  AppTheme.providerColor(_provider);

                              return Expanded(
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(horizontal: 3),
                                  child: Semantics(
                                    selected: selected,
                                    button: true,
                                    label:
                                        '${_providerLabel(_provider)} SIM ${sim.slot + 1}',
                                    child: OutlinedButton.icon(
                                      onPressed: () => _selectPhysicalSim(sim),
                                      icon: Icon(
                                        selected
                                            ? Icons.check_circle_rounded
                                            : Icons.sim_card_outlined,
                                        size: 17,
                                      ),
                                      label: Text(
                                        'SIM ${sim.slot + 1}',
                                        maxLines: 1,
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: selected
                                            ? (_provider == 'mtn'
                                                ? Colors.black
                                                : providerColor)
                                            : Theme.of(context)
                                                .colorScheme
                                                .onSurfaceVariant,
                                        backgroundColor: selected
                                            ? providerColor.withValues(
                                                alpha: 0.12,
                                              )
                                            : Colors.transparent,
                                        side: BorderSide(
                                          color: selected
                                              ? providerColor
                                              : Theme.of(context)
                                                  .dividerColor
                                                  .withValues(alpha: 0.45),
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 10,
                                          horizontal: 8,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                        ),
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
                  SliverToBoxAdapter(
                    child: noSimsDetected
                        ? const DashboardEmptyState(
                            icon: Icons.sim_card_outlined,
                            title: 'No Personal SIM assigned',
                            message: 'Assign a detected SIM to Personal in '
                                'Settings > SIM Purpose.',
                          )
                        : _homeQuickActions.isEmpty
                            ? DashboardEmptyState(
                                icon: Icons.grid_view_rounded,
                                title: 'No quick actions available',
                                message: 'No personal transaction actions are '
                                    'currently available for '
                                    '${_providerLabel(_provider)}.',
                                actionLabel: 'Customize Quick Actions',
                                actionIcon: Icons.tune_rounded,
                                onAction: () =>
                                    context.push('/personal-quick-actions'),
                              )
                            : Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 14, 16, 4),
                                child: GridView.count(
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  crossAxisCount: 3,
                                  crossAxisSpacing: 10,
                                  mainAxisSpacing: 10,
                                  childAspectRatio: 0.85,
                                  children: _homeQuickActions.map(
                                    (preference) {
                                      final definition = _quickActionDefinition(
                                        preference.actionKey,
                                      );

                                      final icon = quickActionIconFromKey(
                                            preference.iconKey,
                                          ) ??
                                          definition?.icon ??
                                          quickActionCatalogIcon(
                                            preference.actionKey,
                                          );

                                      final label = preference.resolvedLabel(
                                        definition?.displayLabel ??
                                            quickActionTransactionLabel(
                                              preference.actionKey,
                                            ),
                                      );

                                      return _QuickActionTile(
                                        icon: icon,
                                        iconColor: preference.resolvedIconColor(
                                          AppTheme.primaryColor,
                                        ),
                                        label: label,
                                        onTap: () => _startTransaction(
                                          preference.actionKey,
                                        ),
                                      );
                                    },
                                  ).toList(),
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
                      child: RecentTransactionsSkeleton(),
                    )
                  else if (_recent.isEmpty)
                    SliverToBoxAdapter(
                      child: DashboardEmptyState(
                        icon: Icons.account_balance_wallet_outlined,
                        title: 'No personal transactions yet',
                        message: 'Buy airtime, data, or send money and your '
                            'recent activity will appear here.',
                        actionLabel: 'Refresh Activity',
                        actionIcon: Icons.refresh_rounded,
                        onAction: _loadRecent,
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => DashboardListEntrance(
                            index: i,
                            child: _animateNewestTransaction(
                              isNewest: i == 0,
                              child: PersonalTransactionItem(
                                tx: _recent[i] as Map<String, dynamic>,
                              ),
                            ),
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

class _QuickActionTile extends StatefulWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final VoidCallback onTap;

  const _QuickActionTile({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.onTap,
  });

  @override
  State<_QuickActionTile> createState() => _QuickActionTileState();
}

class _QuickActionTileState extends State<_QuickActionTile> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value || !mounted) return;
    setState(() => _pressed = value);
  }

  void _activate() {
    HapticFeedback.selectionClick();
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: _activate,
        child: AnimatedScale(
          scale: _pressed ? 0.965 : 1,
          duration: const Duration(milliseconds: 110),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 110),
            curve: Curves.easeOutCubic,
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _pressed
                    ? AppTheme.primaryColor.withValues(alpha: 0.24)
                    : context.appSecondaryText.withValues(alpha: 0.07),
              ),
              boxShadow: [
                BoxShadow(
                  color:
                      Colors.black.withValues(alpha: _pressed ? 0.025 : 0.055),
                  blurRadius: _pressed ? 4 : 9,
                  offset: Offset(0, _pressed ? 1 : 3),
                ),
              ],
            ),
            padding: const EdgeInsets.all(10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  scale: _pressed ? 0.94 : 1,
                  duration: const Duration(milliseconds: 110),
                  curve: Curves.easeOutCubic,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: widget.iconColor.withValues(
                        alpha: context.isDarkMode ? 0.20 : 0.10,
                      ),
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Icon(
                      widget.icon,
                      color: widget.iconColor,
                      size: 23,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
