import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_cache.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/app_widgets.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  static const _cacheKey = 'notifications:list';

  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;
  bool _markingAllRead = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<List<Map<String, dynamic>>> _fetchNotifications() async {
    final response = await ApiClient.instance.get(
      '/notifications',
      queryParameters: {
        'page': 1,
        'limit': 30,
      },
    );

    final raw = response.data['data'];

    return raw is List
        ? raw
            .whereType<Map>()
            .map(
              (item) => Map<String, dynamic>.from(item),
            )
            .toList()
        : <Map<String, dynamic>>[];
  }

  Future<void> _load({
    bool forceRefresh = false,
  }) async {
    final cached = ApiCache.get<List<Map<String, dynamic>>>(_cacheKey);

    if (cached != null && mounted) {
      setState(() {
        _notifications = List<Map<String, dynamic>>.from(
          cached,
        );
        _loading = false;
      });
    } else if (mounted) {
      setState(() => _loading = true);
    }

    try {
      final notifications =
          await ApiCache.getOrLoad<List<Map<String, dynamic>>>(
        key: _cacheKey,
        ttl: const Duration(seconds: 45),
        forceRefresh: forceRefresh,
        loader: _fetchNotifications,
      );

      if (!mounted) return;

      setState(() {
        _notifications = List<Map<String, dynamic>>.from(notifications);
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAllRead || _notifications.isEmpty) return;

    final previous =
        _notifications.map((item) => Map<String, dynamic>.from(item)).toList();

    final updated = _notifications
        .map(
          (item) => {
            ...item,
            'is_read': true,
          },
        )
        .toList();

    setState(() {
      _markingAllRead = true;
      _notifications = updated;
    });

    ApiCache.put<List<Map<String, dynamic>>>(
      _cacheKey,
      updated,
      ttl: const Duration(seconds: 45),
    );

    try {
      await ApiClient.instance.patch(
        '/notifications/mark-read',
        data: {
          'notification_ids': 'all',
        },
      );
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _notifications = previous;
      });

      ApiCache.put<List<Map<String, dynamic>>>(
        _cacheKey,
        previous,
        ttl: const Duration(seconds: 45),
      );

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Notifications could not be marked as read.',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _markingAllRead = false);
      }
    }
  }

  String _formatTime(dynamic rawValue) {
    if (rawValue == null) return '';

    final parsed = DateTime.tryParse(rawValue.toString());
    if (parsed == null) return '';

    return DateFormat(
      'dd MMM, HH:mm',
    ).format(parsed.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _notifications.any(
      (notification) => notification['is_read'] != true,
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: hasUnread && !_markingAllRead ? _markAllRead : null,
            child: _markingAllRead
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                    ),
                  )
                : const Text(
                    'Mark all read',
                    style: TextStyle(color: Colors.white),
                  ),
          ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(),
            )
          : _notifications.isEmpty
              ? const EmptyState(
                  icon: Icons.notifications_none,
                  title: 'No notifications',
                  subtitle: 'You\'re all caught up!',
                )
              : RefreshIndicator(
                  onRefresh: () => _load(
                    forceRefresh: true,
                  ),
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final notification = _notifications[index];
                      final isRead = notification['is_read'] == true;

                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isRead
                              ? context.appSurface
                              : AppTheme.primaryColor.withValues(
                                  alpha: 0.15,
                                ),
                          child: Icon(
                            Icons.notifications,
                            color: isRead
                                ? context.appSecondaryText
                                : AppTheme.primaryColor,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          notification['title']?.toString() ?? '',
                          style: TextStyle(
                            fontWeight:
                                isRead ? FontWeight.normal : FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              notification['body']?.toString() ?? '',
                              style: const TextStyle(fontSize: 12),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              _formatTime(
                                notification['created_at'],
                              ),
                              style: TextStyle(
                                color: context.appSecondaryText,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        tileColor: isRead
                            ? null
                            : AppTheme.primaryColor.withValues(
                                alpha: 0.03,
                              ),
                      );
                    },
                  ),
                ),
    );
  }
}
