import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class MarketplaceEnquiriesScreen extends StatefulWidget {
  const MarketplaceEnquiriesScreen({super.key});

  @override
  State<MarketplaceEnquiriesScreen> createState() =>
      _MarketplaceEnquiriesScreenState();
}

class _MarketplaceEnquiriesScreenState
    extends State<MarketplaceEnquiriesScreen> {
  List<Map<String, dynamic>> _conversations = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.get('/marketplace/enquiries');
      final raw = response.data['data'];

      if (!mounted) return;

      setState(() {
        _conversations = raw is List
            ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.response?.data?['message'] ?? 'Failed to load enquiries.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load enquiries.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.read<AuthBloc>().state;
    final currentUserId = authState is AuthAuthenticated
        ? authState.user['id']?.toString()
        : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Marketplace Enquiries'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const ListView(
                physics: AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: 180),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 100),
                      const Icon(Icons.error_outline, size: 48),
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _load,
                        child: const Text('Try Again'),
                      ),
                    ],
                  )
                : _conversations.isEmpty
                    ? const ListView(
                        physics: AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.all(24),
                        children: [
                          SizedBox(height: 100),
                          Icon(Icons.mark_chat_unread_outlined, size: 56),
                          SizedBox(height: 12),
                          Text(
                            'No enquiries yet',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Customer and seller conversations will appear here.',
                            textAlign: TextAlign.center,
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(12),
                        itemCount: _conversations.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final conversation = _conversations[index];

                          final isSeller =
                              conversation['seller_id']?.toString() ==
                                  currentUserId;

                          final firstName = isSeller
                              ? conversation['customer_first_name']
                              : conversation['seller_first_name'];
                          final lastName = isSeller
                              ? conversation['customer_last_name']
                              : conversation['seller_last_name'];
                          final profileImage = isSeller
                              ? conversation['customer_profile_image_url']
                              : conversation['seller_profile_image_url'];

                          final name =
                              '${firstName ?? ''} ${lastName ?? ''}'.trim();

                          final unreadCount = int.tryParse(
                                conversation['unread_count']?.toString() ?? '0',
                              ) ??
                              0;

                          final lastMessageAt = DateTime.tryParse(
                            conversation['last_message_at']?.toString() ?? '',
                          );

                          return Card(
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundImage: profileImage != null &&
                                        profileImage.toString().isNotEmpty
                                    ? NetworkImage(
                                        profileImage.toString(),
                                      )
                                    : null,
                                child: profileImage == null ||
                                        profileImage.toString().isEmpty
                                    ? const Icon(Icons.person_outline)
                                    : null,
                              ),
                              title: Text(
                                name.isEmpty ? 'Marketplace user' : name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    conversation['ad_title']?.toString() ??
                                        'Advertisement',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    conversation['last_message']?.toString() ??
                                        'No messages yet',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (lastMessageAt != null)
                                    Text(
                                      DateFormat('MMM d').format(
                                        lastMessageAt.toLocal(),
                                      ),
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                  if (unreadCount > 0) ...[
                                    const SizedBox(height: 4),
                                    CircleAvatar(
                                      radius: 10,
                                      child: Text(
                                        unreadCount.toString(),
                                        style: const TextStyle(fontSize: 10),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              onTap: () async {
                                await context.push(
                                  '/marketplace/enquiries/'
                                  '${conversation['id']}',
                                );
                                if (mounted) _load();
                              },
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
