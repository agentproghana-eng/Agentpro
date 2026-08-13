import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/auth/auth_bloc.dart';
import '../../core/services/offline_queue_service.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class SyncQueueScreen extends StatefulWidget {
  const SyncQueueScreen({super.key});

  @override
  State<SyncQueueScreen> createState() => _SyncQueueScreenState();
}

class _SyncQueueScreenState extends State<SyncQueueScreen> {
  bool _syncing = false;
  String? _lastResultMessage;

  OfflineQueueIdentity? get _identity {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated
        ? OfflineQueueService.identityFromUser(state.user)
        : null;
  }

  int get _pendingCount {
    final identity = _identity;
    return identity == null ? 0 : OfflineQueueService.pendingCount(identity);
  }

  List<Map<String, dynamic>> get _pendingTransactions {
    final identity = _identity;
    return identity == null
        ? const <Map<String, dynamic>>[]
        : OfflineQueueService.getPendingTransactions(identity);
  }

  Future<void> _handleSyncNow() async {
    final identity = _identity;
    if (identity == null) return;

    setState(() {
      _syncing = true;
      _lastResultMessage = null;
    });

    final result = await OfflineQueueService.syncNow(identity);
    final succeeded = result['succeeded'] ?? 0;
    final failed = result['failed'] ?? 0;

    if (!mounted) return;
    setState(() {
      _syncing = false;
      if (succeeded == 0 && failed == 0) {
        _lastResultMessage = 'Nothing to sync.';
      } else if (failed == 0) {
        _lastResultMessage =
            'Synced $succeeded transaction${succeeded == 1 ? '' : 's'}.';
      } else {
        _lastResultMessage =
            'Synced $succeeded. $failed still pending — will retry when connection improves.';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final pending = _pendingCount;
    return Scaffold(
      appBar: AppBar(title: const Text('Offline Sync')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              pending == 0
                  ? 'All transactions are synced.'
                  : '$pending transaction${pending == 1 ? '' : 's'} waiting to sync.',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'These were completed offline and are stored safely on this device. '
              'They will not be lost if you close the app.',
              style: TextStyle(color: context.appSecondaryText),
            ),
            const SizedBox(height: 20),
            if (pending > 0) ...[
              Expanded(
                child: ListView.separated(
                  itemCount: _pendingTransactions.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final transaction = _pendingTransactions[index];
                    final requestFields = transaction['request_fields'] is Map
                        ? Map<String, dynamic>.from(
                            transaction['request_fields'] as Map,
                          )
                        : <String, dynamic>{};

                    final type = requestFields['transaction_type']
                            ?.toString()
                            .replaceAll('_', ' ') ??
                        'Transaction';

                    final simLabel = OfflineQueueService.simLabel(transaction);

                    final retryCount =
                        (transaction['retry_count'] as num?)?.toInt() ?? 0;

                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: context.appSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.appDivider),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.sim_card_outlined,
                            color: AppTheme.primaryColor,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  type,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  simLabel,
                                  style: TextStyle(
                                    color: context.appSecondaryText,
                                    fontSize: 12,
                                  ),
                                ),
                                if (retryCount > 0) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    'Sync attempts: $retryCount',
                                    style: TextStyle(
                                      color: context.appSecondaryText,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const Icon(Icons.cloud_upload_outlined),
                        ],
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
            ] else
              const Spacer(),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: (_syncing || pending == 0) ? null : _handleSyncNow,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _syncing
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text(pending == 0 ? 'Nothing to Sync' : 'Sync Now'),
              ),
            ),
            if (_lastResultMessage != null) ...[
              const SizedBox(height: 16),
              Text(_lastResultMessage!,
                  style: const TextStyle(fontWeight: FontWeight.w500)),
            ],
          ],
        ),
      ),
    );
  }
}
