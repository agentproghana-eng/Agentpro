import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/dashboard_refresh_service.dart';
import '../../core/services/app_cache_service.dart';
import '../../core/router/app_router.dart';
import '../ussd_settings/quick_action_preference.dart';
import '../../shared/widgets/offline_status_banner.dart';
import 'widgets/dashboard_quick_actions_section.dart';
import 'widgets/dashboard_header.dart';
import 'widgets/dashboard_owner_glance.dart';
import 'widgets/dashboard_shift_card.dart';
import 'widgets/dashboard_provider_selector.dart';
import 'widgets/dashboard_recent_transactions_section.dart';

class HomeTab extends StatefulWidget {
  final Map<String, dynamic> user;
  const HomeTab({super.key, required this.user});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> with RouteAware {
  String _provider = 'mtn';
  Map<String, SimCard?>? _simMap;
  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  Set<String> _disabledTypes = {};
  Map<int, String> _simPurposes = {};
  Map<String, List<QuickActionPreference>> _agentQuickActions = {};
  Map<String, List<QuickActionPreference>> _personalQuickActions = {};
  StreamSubscription<DashboardRefreshEvent>? _dashboardRefreshSubscription;
  final DashboardRecentTransactionsController _recentTransactionsController =
      DashboardRecentTransactionsController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    routeObserver.subscribe(this, ModalRoute.of(context) as PageRoute);
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    _dashboardRefreshSubscription?.cancel();
    super.dispose();
  }

  // Fires when a screen pushed on top of this one (e.g. Settings >
  // SIM Purpose) gets popped, so a saved purpose change is reflected
  // immediately instead of requiring an app restart to take effect.
  @override
  void didPopNext() {
    _loadSimPurposes();
    _loadQuickActions();
    _loadSimMap();
  }

  @override
  void initState() {
    super.initState();

    _dashboardRefreshSubscription = DashboardRefreshService.events.listen(
      _handleDashboardRefresh,
    );

    // Secondary dashboard data loads in the background so the main
    // dashboard appears as quickly as possible.
    unawaited(_loadSimMap());
    unawaited(_loadFeatureFlags());
    unawaited(_loadSimPurposes());
    unawaited(_loadQuickActions());
  }

  void _handleDashboardRefresh(
    DashboardRefreshEvent event,
  ) {
    if (event.isPersonal || !mounted) {
      return;
    }

    if (_provider != event.provider) {
      setState(() => _provider = event.provider);
    }
  }

  Future<void> _loadQuickActions() async {
    const cacheKey = 'dashboard_quick_actions';

    Map<String, List<QuickActionPreference>> parseProfile(dynamic raw) {
      final result = <String, List<QuickActionPreference>>{};

      if (raw is! Map) return result;

      for (final provider in ['mtn', 'telecel', 'at_money']) {
        final value = raw[provider];

        if (value is! List) continue;

        final items = <QuickActionPreference>[];

        for (var index = 0; index < value.length; index++) {
          try {
            final preference = QuickActionPreference.fromDynamic(
              value[index],
              fallbackPosition: index,
            );

            if (preference.actionKey.trim().isEmpty) continue;

            items.add(preference);
          } catch (_) {
            // Ignore malformed saved Quick Action records.
          }
        }

        items.sort((a, b) => a.position.compareTo(b.position));

        result[provider] = items
            .take(9)
            .toList()
            .asMap()
            .entries
            .map(
              (entry) => entry.value.copyWith(position: entry.key),
            )
            .toList();
      }

      return result;
    }

    Map<String, dynamic> serializeProfile(
      Map<String, List<QuickActionPreference>> profile,
    ) {
      return {
        for (final entry in profile.entries)
          entry.key: entry.value.map((item) => item.toJson()).toList(),
      };
    }

    final cached = AppCacheService.get(cacheKey);

    if (cached is Map && mounted) {
      final agent = parseProfile(cached['agent']);
      final personal = parseProfile(cached['personal']);

      if (agent.isNotEmpty || personal.isNotEmpty) {
        setState(() {
          _agentQuickActions = agent;
          _personalQuickActions = personal;
        });
      }
    }

    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');

      final data =
          response.data['data'] as Map<String, dynamic>? ?? <String, dynamic>{};

      final agent = parseProfile(data['agent']);
      final personal = parseProfile(data['personal']);

      AppCacheService.set(cacheKey, {
        'agent': serializeProfile(agent),
        'personal': serializeProfile(personal),
      });

      if (!mounted) return;

      setState(() {
        _agentQuickActions = agent;
        _personalQuickActions = personal;
      });
    } catch (_) {
      // Keep cached/default values when request fails.
    }
  }

  // Fetches the admin-controlled kill-switch list once per screen load.
  // Fails silently (leaves _disabledTypes empty) on any error - a
  // feature-flag fetch failure should never block the home screen or
  // make tiles look disabled when they're actually fine; the same
  // check is enforced server-side regardless as the real safety net.
  // Lets Home dynamically switch its Quick Actions to Personal's own
  // set when the currently-selected provider's SIM has been tagged
  // 'personal' in Settings > SIM Purpose - someone holding both
  // capabilities can use their personal SIM's actions right from
  // Agent Home, without navigating away to the separate Personal
  // dashboard. Fails silently, same as feature flags - a pure Agent
  // account (no purposes ever saved) simply never triggers this.
  Future<void> _loadSimPurposes() async {
    const cacheKey = 'dashboard_sim_purposes';

    final cached = AppCacheService.get(cacheKey);

    if (cached is Map && mounted) {
      setState(() {
        _simPurposes = Map<int, String>.from(cached);
      });
    }

    try {
      final res = await ApiClient.instance.get('/user-sim-purposes');

      final saved = (res.data['data'] as List?) ?? [];
      final map = <int, String>{};

      for (final p in saved) {
        map[p['sim_slot'] as int] = p['purpose'] as String;
      }

      AppCacheService.set(cacheKey, map);

      if (mounted) {
        setState(() => _simPurposes = map);
      }
    } catch (_) {
      // Keep cached values if refresh fails.
    }
  }

  Future<void> _loadFeatureFlags() async {
    const cacheKey = 'dashboard_feature_flags';

    final cached = AppCacheService.get(cacheKey);

    if (cached is List && mounted) {
      setState(() {
        _disabledTypes = cached.map((e) => e.toString()).toSet();
      });
    }

    try {
      final res = await ApiClient.instance.get('/users/me/feature-flags');

      final list =
          (res.data['data']['disabled_transaction_types'] as List?) ?? [];

      final disabled = list.map((e) => e.toString()).toList();

      AppCacheService.set(cacheKey, disabled);

      if (mounted) {
        setState(() {
          _disabledTypes = disabled.toSet();
        });
      }
    } catch (_) {
      // Keep cached values. Server remains the source of truth.
    }
  }

  Future<void> _loadSimMap() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
      });
    }

    try {
      var map = await SimCardService.getNetworkSimMap();

      // Android telephony can briefly report no subscriptions directly
      // after launch or a permission change. Retry once before treating
      // the empty result as final.
      if (map.values.every((sim) => sim == null)) {
        await Future.delayed(const Duration(milliseconds: 1200));

        if (!mounted) return;

        map = await SimCardService.getNetworkSimMap();
      }

      if (!mounted) return;

      final availableProviders = map.entries
          .where((entry) => entry.value != null)
          .map((entry) => entry.key)
          .toList();

      setState(() {
        _simMap = map;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        if (availableProviders.isNotEmpty &&
            !availableProviders.contains(_provider)) {
          _provider = availableProviders.first;
        }
      });
    } on SimPermissionException {
      if (!mounted) return;

      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (!mounted) return;

      // Never invent providers when SIM detection fails.
      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
        _simDetectionComplete = true;
        _simPermissionDenied = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DashboardHeader(
          user: widget.user,
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _recentTransactionsController.refresh(
              forceRefresh: true,
            ),
            child: CustomScrollView(
              slivers: [
                const SliverToBoxAdapter(child: OfflineStatusBanner()),
                if (widget.user['role'] == 'business_owner')
                  const SliverToBoxAdapter(
                    child: DashboardOwnerGlance(),
                  ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: DashboardProviderSelector(
                      selectedProvider: _provider,
                      simMap: _simMap,
                      detectionComplete: _simDetectionComplete,
                      permissionDenied: _simPermissionDenied,
                      onProviderChanged: (provider) {
                        if (_provider == provider) return;

                        setState(() => _provider = provider);
                      },
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: DashboardShiftCard()),
                SliverToBoxAdapter(
                  child: DashboardQuickActionsSection(
                    provider: _provider,
                    simMap: _simMap,
                    disabledTypes: _disabledTypes,
                    simPurposes: _simPurposes,
                    agentQuickActions: _agentQuickActions,
                    personalQuickActions: _personalQuickActions,
                  ),
                ),
                DashboardRecentTransactionsSection(
                  provider: _provider,
                  controller: _recentTransactionsController,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
