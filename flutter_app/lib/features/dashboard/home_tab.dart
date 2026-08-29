import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/services/sim_card_service.dart';
import '../../core/services/sim_role_assignment_service.dart';
import '../../core/services/dashboard_refresh_service.dart';
import '../../core/services/app_cache_service.dart';
import '../../core/services/storage_service.dart';
import '../../core/router/app_router.dart';
import '../ussd_settings/quick_action_preference.dart';
import '../ussd_settings/quick_action_catalog.dart';
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
  Map<String, List<SimCard>> _providerSims = {};
  Map<String, int> _selectedSimSlots = {};
  bool _simDetectionComplete = false;
  bool _simPermissionDenied = false;
  Set<String> _disabledTypes = {};
  Map<int, String> _simPurposes = {};
  Map<String, List<QuickActionPreference>> _agentQuickActions = {};
  Map<String, List<QuickActionPreference>> _personalQuickActions = {};
  Map<String, List<QuickActionPreference>> _evdQuickActions = {};
  Map<String, List<QuickActionPreference>> _merchantQuickActions = {};
  QuickActionCatalog? _agentQuickActionCatalog;
  QuickActionCatalog? _personalQuickActionCatalog;

  bool _simPurposesResolved = false;
  bool _agentQuickActionCatalogResolved = false;
  bool _personalQuickActionCatalogResolved = false;

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

  // Returning to Home must not rediscover physical SIMs or refetch
  // Quick Actions. Hardware identity remains warm for UI purposes while
  // SIM purpose and Quick Actions are rehydrated from their local caches.
  // The final transaction boundary performs its own fresh Android SIM check.
  @override
  void didPopNext() {
    unawaited(_loadSimPurposes());
    unawaited(
      _loadQuickActions(
        allowNetwork: false,
      ),
    );
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

  Future<void> _loadQuickActions({
    bool allowNetwork = true,
  }) async {
    const cacheKey = 'dashboard_quick_actions';

    Map<String, List<QuickActionPreference>> parseProfile(dynamic raw) {
      final result = <String, List<QuickActionPreference>>{};

      if (raw is! Map) return result;

      for (final entry in raw.entries) {
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

            if (preference.actionKey.trim().isEmpty) continue;

            items.add(preference);
          } catch (_) {}
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

    final memoryCached = AppCacheService.get(cacheKey);

    if (memoryCached is Map && mounted) {
      final agent = parseProfile(memoryCached['agent']);
      final subscriber = parseProfile(
        memoryCached['subscriber'] ?? memoryCached['personal'],
      );
      final evd = parseProfile(memoryCached['evd']);
      final merchant = parseProfile(memoryCached['merchant']);

      if (agent.isNotEmpty ||
          subscriber.isNotEmpty ||
          evd.isNotEmpty ||
          merchant.isNotEmpty) {
        setState(() {
          _agentQuickActions = agent;
          _personalQuickActions = subscriber;
          _evdQuickActions = evd;
          _merchantQuickActions = merchant;
        });
      }
    }

    final durable =
        await StorageService.getOfflineDashboardSnapshot(widget.user);

    if (durable != null && mounted) {
      final quickActions = durable['quick_actions'];

      if (quickActions is Map) {
        final agent = parseProfile(quickActions['agent']);
        final subscriber = parseProfile(
          quickActions['subscriber'] ?? quickActions['personal'],
        );
        final evd = parseProfile(quickActions['evd']);
        final merchant = parseProfile(quickActions['merchant']);

        setState(() {
          _agentQuickActions = agent;
          _personalQuickActions = subscriber;
          _evdQuickActions = evd;
          _merchantQuickActions = merchant;
        });
      }

      final businessCatalog = durable['business_catalog'];

      if (businessCatalog is Map) {
        try {
          _agentQuickActionCatalog = QuickActionCatalog.fromCacheJson(
            Map<String, dynamic>.from(businessCatalog),
            fallbackMode: 'business',
          );
        } catch (_) {}
      }

      final personalCatalog = durable['personal_catalog'];

      if (personalCatalog is Map) {
        try {
          _personalQuickActionCatalog = QuickActionCatalog.fromCacheJson(
            Map<String, dynamic>.from(personalCatalog),
            fallbackMode: 'personal',
          );
        } catch (_) {}
      }

      setState(() {});
    }

    // Navigation returns are cache-only. The dashboard already has a
    // durable snapshot and must not refetch Quick Actions simply because
    // another page was popped. Initial loading still uses the network.
    if (!allowNetwork) {
      if (mounted) {
        setState(() {
          _agentQuickActionCatalogResolved =
              _agentQuickActionCatalog != null;
          _personalQuickActionCatalogResolved =
              _personalQuickActionCatalog != null;
        });
      }

      return;
    }

    try {
      final response = await ApiClient.instance.get('/users/me/quick-actions');

      final data =
          response.data['data'] as Map<String, dynamic>? ?? <String, dynamic>{};

      final agent = parseProfile(data['agent']);
      final subscriber = parseProfile(
        data['subscriber'] ?? data['personal'],
      );
      final evd = parseProfile(data['evd']);
      final merchant = parseProfile(data['merchant']);

      final serialized = {
        'agent': serializeProfile(agent),
        'subscriber': serializeProfile(subscriber),
        'evd': serializeProfile(evd),
        'merchant': serializeProfile(merchant),
      };

      AppCacheService.set(cacheKey, serialized);

      if (mounted) {
        setState(() {
          _agentQuickActions = agent;
          _personalQuickActions = subscriber;
          _evdQuickActions = evd;
          _merchantQuickActions = merchant;
        });
      }

      await StorageService.mergeOfflineDashboardSnapshot(
        widget.user,
        {
          'quick_actions': serialized,
        },
      );
    } catch (_) {}

    Future<void> loadCatalog({
      required String mode,
      required bool personal,
    }) async {
      QuickActionCatalog? freshCatalog;

      try {
        freshCatalog = await QuickActionCatalog.load(mode: mode);
      } catch (_) {}

      if (!mounted) return;

      setState(() {
        if (personal) {
          if (freshCatalog != null) {
            _personalQuickActionCatalog = freshCatalog;
          }

          _personalQuickActionCatalogResolved = true;
        } else {
          if (freshCatalog != null) {
            _agentQuickActionCatalog = freshCatalog;
          }

          _agentQuickActionCatalogResolved = true;
        }
      });

      if (freshCatalog != null) {
        await StorageService.mergeOfflineDashboardSnapshot(
          widget.user,
          {
            personal ? 'personal_catalog' : 'business_catalog':
                freshCatalog.toCacheJson(),
          },
        );
      }
    }

    await Future.wait([
      loadCatalog(mode: 'business', personal: false),
      loadCatalog(mode: 'personal', personal: true),
    ]);
  }

  Future<void> _refreshSimPurposesFromServer(
    List<SimCard> sims,
  ) async {
    try {
      final refreshedRoles =
          await SimRoleAssignmentService.rolesForSims(
        sims,
        refreshFromServer: true,
      );

      if (!mounted) return;

      setState(() {
        _simPurposes = refreshedRoles;
        _simPurposesResolved = true;
      });
    } catch (_) {
      // A failed background refresh must never erase a previously
      // identity-bound local role. Offline Home stays usable.
    }
  }

  Future<void> _loadSimPurposes() async {
    try {
      final sims = await SimCardService.getSimCards();

      // Render trusted identity-bound local roles immediately.
      // SimRoleAssignmentService never uses the retired slot-only cache,
      // so a replacement SIM cannot inherit another SIM's role.
      final cachedRoles =
          await SimRoleAssignmentService.rolesForSims(
        sims,
        refreshFromServer: false,
      );

      if (!mounted) return;

      setState(() {
        _simPurposes = cachedRoles;
        _simPurposesResolved = true;
      });

      // Network reconciliation is best-effort and never blocks Home.
      unawaited(
        _refreshSimPurposesFromServer(
          sims,
        ),
      );
    } catch (_) {
      if (!mounted) return;

      // Keep any already-rendered trusted role instead of converting a
      // transient Android/network problem into "no role".
      setState(() {
        _simPurposesResolved = true;
      });
    }
  }

  Future<void> _loadFeatureFlags() async {
    const cacheKey = 'dashboard_feature_flags';

    final memoryCached = AppCacheService.get(cacheKey);

    if (memoryCached is List && mounted) {
      setState(() {
        _disabledTypes = memoryCached.map((e) => e.toString()).toSet();
      });
    }

    final durable =
        await StorageService.getOfflineDashboardSnapshot(widget.user);

    final durableFlags = durable?['disabled_transaction_types'];

    if (durableFlags is List && mounted) {
      setState(() {
        _disabledTypes = durableFlags.map((e) => e.toString()).toSet();
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

      await StorageService.mergeOfflineDashboardSnapshot(
        widget.user,
        {
          'disabled_transaction_types': disabled,
        },
      );
    } catch (_) {}
  }

  Future<void> _loadSimMap() async {
    if (mounted) {
      setState(() {
        _simDetectionComplete = false;
        _simPermissionDenied = false;
      });
    }

    Map<String, List<SimCard>> groupSims(
      List<SimCard> sims,
    ) {
      final groups = <String, List<SimCard>>{
        'mtn': <SimCard>[],
        'telecel': <SimCard>[],
        'at_money': <SimCard>[],
      };

      for (final sim in sims) {
        final bucket = groups[sim.network];

        if (bucket == null) {
          continue;
        }

        bucket.add(sim);
      }

      for (final items in groups.values) {
        items.sort(
          (a, b) => a.slot.compareTo(b.slot),
        );
      }

      return groups;
    }

    try {
      var sims = await SimCardService.getSimCards();
      var groups = groupSims(sims);

      if (groups.values.every((items) => items.isEmpty)) {
        await Future.delayed(
          const Duration(milliseconds: 1200),
        );

        if (mounted == false) {
          return;
        }

        sims = await SimCardService.getSimCards();
        groups = groupSims(sims);
      }

      if (mounted == false) {
        return;
      }

      SimCard? firstFor(String provider) {
        final items = groups[provider];

        if (items == null || items.isEmpty) {
          return null;
        }

        return items.first;
      }

      final map = <String, SimCard?>{
        'mtn': firstFor('mtn'),
        'telecel': firstFor('telecel'),
        'at_money': firstFor('at_money'),
      };

      final availableProviders = groups.entries
          .where((entry) => entry.value.isNotEmpty)
          .map((entry) => entry.key)
          .toList();

      final selectedSlots = Map<String, int>.from(
        _selectedSimSlots,
      );

      for (final entry in groups.entries) {
        final current = selectedSlots[entry.key];

        final currentExists = current == null
            ? false
            : entry.value.any(
                (sim) => sim.slot == current,
              );

        if (currentExists == false && entry.value.isNotEmpty) {
          selectedSlots[entry.key] = entry.value.first.slot;
        }

        if (entry.value.isEmpty) {
          selectedSlots.remove(entry.key);
        }
      }

      setState(() {
        _simMap = map;
        _providerSims = groups;
        _selectedSimSlots = selectedSlots;
        _simDetectionComplete = true;
        _simPermissionDenied = false;

        if (availableProviders.isNotEmpty &&
            availableProviders.contains(_provider) == false) {
          _provider = availableProviders.first;
        }
      });
    } on SimPermissionException {
      if (mounted == false) {
        return;
      }

      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
        _providerSims = {
          'mtn': <SimCard>[],
          'telecel': <SimCard>[],
          'at_money': <SimCard>[],
        };
        _selectedSimSlots = {};
        _simDetectionComplete = true;
        _simPermissionDenied = true;
      });
    } catch (_) {
      if (mounted == false) {
        return;
      }

      setState(() {
        _simMap = const {
          'mtn': null,
          'telecel': null,
          'at_money': null,
        };
        _providerSims = {
          'mtn': <SimCard>[],
          'telecel': <SimCard>[],
          'at_money': <SimCard>[],
        };
        _selectedSimSlots = {};
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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
                const SliverToBoxAdapter(child: DashboardShiftCard()),
                SliverToBoxAdapter(
                  child: DashboardQuickActionsSection(
                    provider: _provider,
                    simMap: _simMap,
                    providerSims: _providerSims,
                    selectedSimSlot: _selectedSimSlots[_provider],
                    onSimSlotChanged: (slot) {
                      setState(() {
                        _selectedSimSlots[_provider] = slot;
                      });
                    },
                    disabledTypes: _disabledTypes,
                    simPurposes: _simPurposes,
                    agentQuickActions: _agentQuickActions,
                    subscriberQuickActions: _personalQuickActions,
                    evdQuickActions: _evdQuickActions,
                    merchantQuickActions: _merchantQuickActions,
                    agentCatalog: _agentQuickActionCatalog,
                    subscriberCatalog: _personalQuickActionCatalog,
                    simDetectionComplete: _simDetectionComplete,
                    simPurposesResolved: _simPurposesResolved,
                    agentCatalogResolved: _agentQuickActionCatalogResolved,
                    subscriberCatalogResolved:
                        _personalQuickActionCatalogResolved,
                    onReloadQuickActions: () {
                      unawaited(_loadQuickActions());
                    },
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
