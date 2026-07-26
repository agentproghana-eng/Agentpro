import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/app_widgets.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<dynamic> _notifs = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/notifications');
      if (mounted) setState(() { _notifs = res.data['data'] ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _markAllRead() async {
    try {
      await ApiClient.instance.patch('/notifications/mark-read', data: {'notification_ids': 'all'});
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: _markAllRead, child: const Text('Mark all read', style: TextStyle(color: Colors.white)))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notifs.isEmpty
              ? const EmptyState(icon: Icons.notifications_none, title: 'No notifications', subtitle: 'You\'re all caught up!')
              : RefreshIndicator(
                  onRefresh: () async => _load(),
                  child: ListView.builder(
                    itemCount: _notifs.length,
                    itemBuilder: (_, i) {
                      final n = _notifs[i];
                      final isRead = n['is_read'] == true;
                      final time = n['created_at'] != null
                          ? DateFormat('dd MMM, HH:mm').format(DateTime.parse(n['created_at']))
                          : '';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isRead ? context.appSurface : AppTheme.primaryColor.withOpacity(0.15),
                          child: Icon(Icons.notifications, color: isRead ? context.appSecondaryText : AppTheme.primaryColor, size: 20),
                        ),
                        title: Text(n['title'] ?? '', style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.bold, fontSize: 13)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(n['body'] ?? '', style: const TextStyle(fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis),
                          Text(time, style: TextStyle(color: context.appSecondaryText, fontSize: 11)),
                        ]),
                        tileColor: isRead ? null : AppTheme.primaryColor.withOpacity(0.03),
                      );
                    },
                  ),
                ),
    );
  }
}
