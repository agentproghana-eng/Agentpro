import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_cache.dart';
import '../../../core/api/api_client.dart';
import '../../../core/services/dashboard_refresh_service.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/dashboard_empty_state.dart';
import '../../../shared/widgets/dashboard_skeleton.dart';
import 'dashboard_provider_selector.dart';
import 'dashboard_recent_transaction_item.dart';

class DashboardRecentTransactionsController {
  Future<void> Function({required bool forceRefresh})? _refresh;

  Future<void> refresh({bool forceRefresh = true}) {
    final callback = _refresh;

    if (callback == null) {
      return Future<void>.value();
    }

    return callback(forceRefresh: forceRefresh);
  }

  void _attach(
    Future<void> Function({required bool forceRefresh}) callback,
  ) {
    _refresh = callback;
  }

  void _detach() {
    _refresh = null;
  }
}

class DashboardRecentTransactionsSection extends StatefulWidget {
  const DashboardRecentTransactionsSection({
    super.key,
    required this.provider,
    required this.controller,
  });

  final String provider;
  final DashboardRecentTransactionsController controller;

  @override
  State<DashboardRecentTransactionsSection> createState() =>
      _DashboardRecentTransactionsSectionState();
}

class _DashboardRecentTransactionsSectionState
    extends State<DashboardRecentTransactionsSection> {
  List<dynamic> _recent = const [];
  bool _loading = true;
  bool _highlightNewest = false;

  StreamSubscription<DashboardRefreshEvent>? _refreshSubscription;

  String? _pendingHighlightProvider;

  @override
  void initState() {
    super.initState();

    widget.controller._attach(_refreshFromController);

    _refreshSubscription = DashboardRefreshService.events.listen(
      _handleDashboardRefresh,
    );

    unawaited(_load());
  }

  @override
  void didUpdateWidget(
    covariant DashboardRecentTransactionsSection oldWidget,
  ) {
    super.didUpdateWidget(oldWidget);

    if (!identical(oldWidget.controller, widget.controller)) {
      oldWidget.controller._detach();
      widget.controller._attach(_refreshFromController);
    }

    if (oldWidget.provider != widget.provider) {
      final shouldHighlight = _pendingHighlightProvider == widget.provider;

      if (shouldHighlight) {
        _pendingHighlightProvider = null;
      }

      unawaited(
        _load(
          highlightNewest: shouldHighlight,
        ),
      );
    }
  }

  @override
  void dispose() {
    widget.controller._detach();
    _refreshSubscription?.cancel();
    super.dispose();
  }

  Future<void> _refreshFromController({
    required bool forceRefresh,
  }) {
    return _load(forceRefresh: forceRefresh);
  }

  void _handleDashboardRefresh(DashboardRefreshEvent event) {
    if (event.isPersonal) {
      return;
    }

    if (event.provider != widget.provider) {
      _pendingHighlightProvider = event.provider;
      return;
    }

    unawaited(
      _load(
        forceRefresh: true,
        highlightNewest: true,
      ),
    );
  }

  Future<void> _load({
    bool forceRefresh = false,
    bool highlightNewest = false,
  }) async {
    final provider = widget.provider;
    final cacheKey = 'dashboard:recent-transactions:$provider';

    final cached = ApiCache.get<List<dynamic>>(cacheKey);

    if (cached != null && mounted && provider == widget.provider) {
      setState(() {
        _recent = List<dynamic>.from(cached);
        _loading = false;
      });
    } else if (mounted && provider == widget.provider) {
      setState(() => _loading = true);
    }

    try {
      final recent = await ApiCache.getOrLoad<List<dynamic>>(
        key: cacheKey,
        ttl: const Duration(seconds: 45),
        forceRefresh: forceRefresh,
        loader: () async {
          final response = await ApiClient.instance.get(
            '/transactions',
            queryParameters: {
              'limit': 5,
              'provider': provider,
            },
          );

          final raw = response.data['data'];

          return raw is List ? List<dynamic>.from(raw) : <dynamic>[];
        },
      );

      if (!mounted || provider != widget.provider) {
        return;
      }

      setState(() {
        _recent = recent;
        _loading = false;
      });

      if (highlightNewest && recent.isNotEmpty) {
        await _highlightFirstTransaction();
      }
    } catch (_) {
      if (!mounted || provider != widget.provider) {
        return;
      }

      setState(() => _loading = false);
    }
  }

  Future<void> _highlightFirstTransaction() async {
    if (!mounted || _recent.isEmpty) {
      return;
    }

    setState(() => _highlightNewest = true);

    await Future<void>.delayed(
      const Duration(milliseconds: 1400),
    );

    if (mounted) {
      setState(() => _highlightNewest = false);
    }
  }

  Widget _animateNewest({
    required Widget child,
    required bool isNewest,
  }) {
    if (!isNewest) {
      return child;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      transform: Matrix4.translationValues(
        0,
        _highlightNewest ? 0 : 4,
        0,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: _highlightNewest
              ? AppTheme.primaryColor.withValues(alpha: 0.42)
              : Colors.transparent,
        ),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SliverMainAxisGroup(
      slivers: [
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
                TextButton(
                  onPressed: () => context.push('/transactions/history'),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(48, 44),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                    ),
                  ),
                  child: const Text(
                    'See All',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_loading)
          const SliverToBoxAdapter(
            child: RecentTransactionsSkeleton(),
          )
        else if (_recent.isEmpty)
          SliverToBoxAdapter(
            child: DashboardEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No recent transactions',
              message: 'Transactions completed on '
                  '${dashboardProviderLabel(widget.provider)} '
                  'will appear here.',
              actionLabel: 'Refresh Activity',
              actionIcon: Icons.refresh_rounded,
              onAction: () => _load(forceRefresh: true),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final transaction = _recent[index];

                  if (transaction is! Map) {
                    return const SizedBox.shrink();
                  }

                  return DashboardListEntrance(
                    index: index,
                    child: _animateNewest(
                      isNewest: index == 0,
                      child: DashboardRecentTransactionItem(
                        transaction: Map<String, dynamic>.from(transaction),
                      ),
                    ),
                  );
                },
                childCount: _recent.length,
              ),
            ),
          ),
      ],
    );
  }
}
