import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../../core/services/offline_queue_service.dart';
import '../theme/app_theme.dart';
import '../theme/app_colors.dart';

class OfflineStatusBanner extends StatefulWidget {
  const OfflineStatusBanner({super.key});

  @override
  State<OfflineStatusBanner> createState() => _OfflineStatusBannerState();
}

class _OfflineStatusBannerState extends State<OfflineStatusBanner>
    with WidgetsBindingObserver {
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _refreshTimer;

  bool _offline = false;
  bool _syncing = false;
  int _pendingCount = 0;

  bool get _visible => _offline || _pendingCount > 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _refresh();

    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      _applyConnectivity(results);

      if (!_offline && _pendingCount > 0) {
        _refresh();
      }
    });

    // The queue can change after returning from a transaction without
    // connectivity changing. Reading Hive locally is inexpensive.
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => _refreshQueueCount(),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    final results = await Connectivity().checkConnectivity();

    if (!mounted) return;

    _applyConnectivity(results);
    _refreshQueueCount();
  }

  void _applyConnectivity(List<ConnectivityResult> results) {
    final offline =
        results.isEmpty ||
        results.every((result) => result == ConnectivityResult.none);

    if (!mounted || offline == _offline) return;

    setState(() => _offline = offline);
  }

  void _refreshQueueCount() {
    final count = OfflineQueueService.pendingCount;

    if (!mounted || count == _pendingCount) return;

    setState(() => _pendingCount = count);
  }

  Future<void> _syncNow() async {
    if (_offline || _syncing || _pendingCount == 0) return;

    setState(() => _syncing = true);

    try {
      final result = await OfflineQueueService.syncNow();
      final succeeded = result['succeeded'] ?? 0;
      final failed = result['failed'] ?? 0;

      _refreshQueueCount();

      if (!mounted) return;

      final message = failed == 0
          ? '$succeeded queued transaction'
                '${succeeded == 1 ? '' : 's'} synced'
          : '$succeeded synced, $failed still pending';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: failed == 0
              ? AppTheme.successColor
              : AppTheme.warningColor,
        ),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Sync failed. Your queued transactions are still safe.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();

    final statusColor = _offline
        ? AppTheme.warningColor
        : AppTheme.primaryColor;

    final title = _offline ? 'You are offline' : 'Transactions waiting to sync';

    final message = _offline
        ? _pendingCount == 0
              ? 'Transactions with cached automation can still be processed.'
              : '$_pendingCount transaction'
                    '${_pendingCount == 1 ? '' : 's'} saved safely '
                    'on this device.'
        : '$_pendingCount queued transaction'
              '${_pendingCount == 1 ? '' : 's'} can now be uploaded.';

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: Container(
        key: ValueKey('$_offline-$_pendingCount-$_syncing'),
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: statusColor.withOpacity(context.isDarkMode ? 0.14 : 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: statusColor.withOpacity(0.34)),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _offline
                    ? Icons.cloud_off_outlined
                    : Icons.cloud_upload_outlined,
                color: statusColor,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    message,
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            if (!_offline && _pendingCount > 0) ...[
              const SizedBox(width: 8),
              TextButton(
                onPressed: _syncing ? null : _syncNow,
                child: _syncing
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Sync Now'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _subscription?.cancel();
    _refreshTimer?.cancel();
    super.dispose();
  }
}
