import 'package:flutter/material.dart';
import '../../core/services/offline_queue_service.dart';
import '../../shared/theme/app_theme.dart';

class SyncQueueScreen extends StatefulWidget {
  const SyncQueueScreen({super.key});

  @override
  State<SyncQueueScreen> createState() => _SyncQueueScreenState();
}

class _SyncQueueScreenState extends State<SyncQueueScreen> {
  bool _syncing = false;
  String? _lastResultMessage;

  int get _pendingCount => OfflineQueueService.pendingCount;

  Future<void> _handleSyncNow() async {
    setState(() {
      _syncing = true;
      _lastResultMessage = null;
    });

    final result = await OfflineQueueService.syncNow();
    final succeeded = result['succeeded'] ?? 0;
    final failed = result['failed'] ?? 0;

    if (!mounted) return;
    setState(() {
      _syncing = false;
      if (succeeded == 0 && failed == 0) {
        _lastResultMessage = 'Nothing to sync.';
      } else if (failed == 0) {
        _lastResultMessage = 'Synced $succeeded transaction${succeeded == 1 ? '' : 's'}.';
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
            const Text(
              'These were completed offline and are stored safely on this device. '
              'They will not be lost if you close the app.',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 24),
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
                        height: 20, width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(pending == 0 ? 'Nothing to Sync' : 'Sync Now'),
              ),
            ),
            if (_lastResultMessage != null) ...[
              const SizedBox(height: 16),
              Text(_lastResultMessage!, style: const TextStyle(fontWeight: FontWeight.w500)),
            ],
          ],
        ),
      ),
    );
  }
}
