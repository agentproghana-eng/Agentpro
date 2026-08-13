import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/auth/auth_bloc.dart';
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
  Timer? _autoSyncTimer;

  bool _offline = false;
  bool _syncing = false;
  int _pendingCount = 0;

  bool get _visible => _offline || _pendingCount > 0;

  OfflineQueueIdentity? get _identity {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated
        ? OfflineQueueService.identityFromUser(state.user)
        : null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _refresh();

    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      final wasOffline = _offline;

      _applyConnectivity(results);
      _refreshQueueCount();

      // Give the connection a moment to stabilize before uploading
      // anything that was completed while offline.
      if (wasOffline && !_offline && _pendingCount > 0) {
        _scheduleAutoSync();
      }
    });

    // The queue can change after returning from a transaction without
    // connectivity changing. Reading Hive locally is inexpensive.
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => _refreshQueueCount(autoSyncIfIncreased: true),
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

    // Covers cold startup and returning to AgentPro after the phone
    // regained connectivity while the app was in the background.
    if (!_offline && _pendingCount > 0) {
      _scheduleAutoSync();
    }
  }

  void _applyConnectivity(List<ConnectivityResult> results) {
    final offline = results.isEmpty ||
        results.every((result) => result == ConnectivityResult.none);

    if (!mounted || offline == _offline) return;

    setState(() => _offline = offline);
  }

  void _refreshQueueCount({bool autoSyncIfIncreased = false}) {
    final previousCount = _pendingCount;
    final identity = _identity;
    final count =
        identity == null ? 0 : OfflineQueueService.pendingCount(identity);

    if (!mounted) return;

    if (count != previousCount) {
      setState(() => _pendingCount = count);
    }

    // A transaction may enter the queue even while Android still reports
    // connectivity (for example, a temporary API timeout). Retry it once
    // after a short stabilization delay. If that retry fails, the unchanged
    // queue count prevents this polling loop from repeatedly hammering
    // the backend.
    if (autoSyncIfIncreased &&
        !_offline &&
        count > previousCount &&
        count > 0) {
      _scheduleAutoSync();
    }
  }

  void _scheduleAutoSync({
    Duration delay = const Duration(seconds: 3),
  }) {
    if (_offline || _syncing || _pendingCount == 0) return;

    _autoSyncTimer?.cancel();

    _autoSyncTimer = Timer(delay, () {
      if (!mounted || _offline || _syncing || _pendingCount == 0) {
        return;
      }

      _syncNow(automatic: true);
    });
  }

  Future<void> _syncNow({bool automatic = false}) async {
    if (_offline || _syncing || _pendingCount == 0) return;

    final identity = _identity;
    if (identity == null) return;

    setState(() => _syncing = true);

    try {
      final result = await OfflineQueueService.syncNow(identity);
      final succeeded = result['succeeded'] ?? 0;
      final failed = result['failed'] ?? 0;

      _refreshQueueCount();

      if (!mounted) return;

      final message = failed == 0
          ? automatic
              ? '$succeeded offline transaction'
                  '${succeeded == 1 ? '' : 's'} synchronized automatically'
              : '$succeeded queued transaction'
                  '${succeeded == 1 ? '' : 's'} synced'
          : '$succeeded synced, $failed still pending';

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor:
              failed == 0 ? AppTheme.successColor : AppTheme.warningColor,
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

    final statusColor =
        _offline ? AppTheme.warningColor : AppTheme.primaryColor;

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
          color:
              statusColor.withValues(alpha: context.isDarkMode ? 0.14 : 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: statusColor.withValues(alpha: 0.34)),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.14),
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
                onPressed: _syncing ? null : () => _syncNow(),
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
    _autoSyncTimer?.cancel();
    super.dispose();
  }
}
