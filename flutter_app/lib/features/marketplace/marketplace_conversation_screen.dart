import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';

class MarketplaceConversationScreen extends StatefulWidget {
  final String conversationId;

  const MarketplaceConversationScreen({
    super.key,
    required this.conversationId,
  });

  @override
  State<MarketplaceConversationScreen> createState() =>
      _MarketplaceConversationScreenState();
}

class _MarketplaceConversationScreenState
    extends State<MarketplaceConversationScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  Map<String, dynamic>? _conversation;
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await ApiClient.instance.get(
        '/marketplace/enquiries/${widget.conversationId}',
      );

      final rawConversation = response.data['data']?['conversation'];
      final rawMessages = response.data['data']?['messages'];

      if (!mounted) return;

      setState(() {
        _conversation = rawConversation is Map
            ? Map<String, dynamic>.from(rawConversation)
            : null;
        _messages = rawMessages is List
            ? rawMessages
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
            : [];
        _loading = false;
        _error = null;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(
            _scrollController.position.maxScrollExtent,
          );
        }
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = e.response?.data?['message'] ?? 'Failed to load conversation.';
        _loading = false;
      });
    }
  }

  Future<void> _send() async {
    final message = _controller.text.trim();
    if (message.isEmpty || _sending) return;

    setState(() => _sending = true);

    try {
      await ApiClient.instance.post(
        '/marketplace/enquiries/${widget.conversationId}/messages',
        data: {'message': message},
      );

      _controller.clear();
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.response?.data?['message'] ?? 'Failed to send message.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
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
        title: Text(
          _conversation?['ad_title']?.toString() ?? 'Marketplace Conversation',
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    Expanded(
                      child: _messages.isEmpty
                          ? const Center(
                              child: Text('No messages yet'),
                            )
                          : ListView.builder(
                              controller: _scrollController,
                              padding: const EdgeInsets.all(12),
                              itemCount: _messages.length,
                              itemBuilder: (context, index) {
                                final message = _messages[index];
                                final isMine =
                                    message['sender_id']?.toString() ==
                                        currentUserId;
                                final createdAt = DateTime.tryParse(
                                  message['created_at']?.toString() ?? '',
                                );

                                return Align(
                                  alignment: isMine
                                      ? Alignment.centerRight
                                      : Alignment.centerLeft,
                                  child: Container(
                                    constraints: const BoxConstraints(
                                      maxWidth: 300,
                                    ),
                                    margin: const EdgeInsets.only(
                                      bottom: 8,
                                    ),
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: isMine
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primaryContainer
                                          : Theme.of(context)
                                              .colorScheme
                                              .surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          message['body']?.toString() ?? '',
                                        ),
                                        if (createdAt != null) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            DateFormat('h:mm a').format(
                                              createdAt.toLocal(),
                                            ),
                                            style: const TextStyle(
                                              fontSize: 10,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(
                          12,
                          8,
                          12,
                          12,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _controller,
                                maxLength: 2000,
                                minLines: 1,
                                maxLines: 4,
                                decoration: const InputDecoration(
                                  hintText: 'Write a message',
                                  border: OutlineInputBorder(),
                                  counterText: '',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filled(
                              onPressed: _sending ? null : _send,
                              icon: _sending
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.send),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
