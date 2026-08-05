import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/audio_player_bubble.dart';
import '../../shared/widgets/reaction_button.dart';

class CommunityFeedScreen extends StatefulWidget {
  const CommunityFeedScreen({super.key});

  @override
  State<CommunityFeedScreen> createState() => _CommunityFeedScreenState();
}

class _CommunityFeedScreenState extends State<CommunityFeedScreen> {
  static const Map<String, String> _postTypes = {
    'all': 'All',
    'general': 'General',
    'question': 'Questions',
    'network_issue': 'Network Issues',
    'fraud_alert': 'Fraud Alerts',
    'business_tip': 'Business Tips',
    'announcement': 'Announcements',
  };

  List<Map<String, dynamic>> _posts = [];

  final _composerController = TextEditingController();
  final _scrollController = ScrollController();
  final _recorder = AudioRecorder();

  bool _loading = true;
  bool _loadingMore = false;
  bool _posting = false;
  bool _hasMore = true;

  String? _error;
  String _selectedFilter = 'all';
  String _selectedPostType = 'general';

  int _page = 1;

  bool _isRecording = false;
  bool _hasRecording = false;
  String? _recordedPath;
  Timer? _recordTimer;
  int _recordSeconds = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
    _load();
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    _recorder.dispose();
    _composerController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 300 &&
        !_loadingMore &&
        _hasMore) {
      _loadMore();
    }
  }

  Map<String, dynamic> _queryParameters(int page) {
    return {
      'page': page,
      'limit': 20,
      if (_selectedFilter != 'all') 'type': _selectedFilter,
    };
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        _page = 1;
      });
    }

    try {
      final response = await ApiClient.instance.get(
        '/agent-posts',
        queryParameters: _queryParameters(1),
      );

      final raw = response.data['data'];
      final pagination = response.data['pagination'];

      if (!mounted) return;

      setState(() {
        _posts = raw is List
            ? raw.whereType<Map>().map(Map<String, dynamic>.from).toList()
            : [];

        _hasMore = pagination is Map && pagination['has_more'] == true;

        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Community posts could not be loaded.';
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;

    setState(() => _loadingMore = true);

    try {
      final nextPage = _page + 1;

      final response = await ApiClient.instance.get(
        '/agent-posts',
        queryParameters: _queryParameters(nextPage),
      );

      final raw = response.data['data'];
      final pagination = response.data['pagination'];

      if (!mounted) return;

      setState(() {
        if (raw is List) {
          _posts.addAll(
            raw.whereType<Map>().map(Map<String, dynamic>.from),
          );
        }

        _page = nextPage;
        _hasMore = pagination is Map && pagination['has_more'] == true;
      });
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Future<void> _toggleReaction(
    Map<String, dynamic> post,
    String reactionType,
  ) async {
    try {
      await ApiClient.instance.post(
        '/agent-posts/${post['id']}/like',
        data: {'reaction_type': reactionType},
      );

      await _load();
    } catch (_) {
      _showMessage(
        'Subscription required to react to posts.',
        error: true,
      );
    }
  }

  Future<void> _toggleSaved(
    Map<String, dynamic> post,
  ) async {
    final isSaved = post['is_saved'] == true;
    final postId = post['id']?.toString();

    if (postId == null) return;

    try {
      if (isSaved) {
        await ApiClient.instance.delete(
          '/agent-posts/$postId/save',
        );
      } else {
        await ApiClient.instance.post(
          '/agent-posts/$postId/save',
        );
      }

      if (!mounted) return;

      setState(() {
        post['is_saved'] = !isSaved;
      });

      _showMessage(
        isSaved ? 'Removed from saved posts.' : 'Post saved.',
      );
    } catch (_) {
      _showMessage('Could not update saved post.', error: true);
    }
  }

  Future<void> _reportPost(
    Map<String, dynamic> post,
  ) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        const options = {
          'spam': 'Spam',
          'fraud': 'Fraud or scam',
          'harassment': 'Harassment',
          'misinformation': 'Misinformation',
          'inappropriate': 'Inappropriate content',
          'privacy': 'Privacy concern',
          'other': 'Other',
        };

        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(
                title: Text(
                  'Report post',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                subtitle: Text(
                  'Choose the reason for your report.',
                ),
              ),
              for (final option in options.entries)
                ListTile(
                  title: Text(option.value),
                  onTap: () => Navigator.pop(
                    context,
                    option.key,
                  ),
                ),
            ],
          ),
        );
      },
    );

    if (reason == null) return;

    try {
      await ApiClient.instance.post(
        '/agent-posts/${post['id']}/report',
        data: {'reason': reason},
      );

      _showMessage('Post reported for review.');
    } catch (error) {
      var message = 'Could not report post.';

      if (error is DioException) {
        final data = error.response?.data;

        if (data is Map && data['message'] != null) {
          message = data['message'].toString();
        }
      }

      _showMessage(
        message,
        error: true,
      );
    }
  }

  Future<void> _blockUser(
    Map<String, dynamic> post,
  ) async {
    final authorId = post['author_id']?.toString();
    final name =
        '${post['first_name'] ?? ''} ${post['last_name'] ?? ''}'.trim();

    if (authorId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Block community member?'),
          content: Text(
            'You will no longer see posts from '
            '${name.isEmpty ? 'this member' : name}.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Block'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      await ApiClient.instance.post(
        '/agent-posts/users/$authorId/block',
      );

      setState(() {
        _posts.removeWhere(
          (item) => item['author_id']?.toString() == authorId,
        );
      });

      _showMessage('Community member blocked.');
    } catch (_) {
      _showMessage('Could not block member.', error: true);
    }
  }

  Future<void> _showPostActions(
    Map<String, dynamic> post,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final isSaved = post['is_saved'] == true;

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: Icon(
                  isSaved
                      ? Icons.bookmark_remove_outlined
                      : Icons.bookmark_add_outlined,
                ),
                title: Text(
                  isSaved ? 'Remove saved post' : 'Save post',
                ),
                onTap: () => Navigator.pop(context, 'save'),
              ),
              ListTile(
                leading: const Icon(Icons.share_outlined),
                title: const Text('Share outside AgentPro'),
                onTap: () => Navigator.pop(context, 'share'),
              ),
              ListTile(
                leading: const Icon(Icons.flag_outlined),
                title: const Text('Report post'),
                onTap: () => Navigator.pop(context, 'report'),
              ),
              ListTile(
                leading: const Icon(Icons.block_outlined),
                title: const Text('Block member'),
                onTap: () => Navigator.pop(context, 'block'),
              ),
            ],
          ),
        );
      },
    );

    switch (action) {
      case 'save':
        await _toggleSaved(post);
      case 'share':
        await Share.share(
          post['content']?.toString().trim().isNotEmpty == true
              ? post['content'].toString()
              : 'Voice note from Agent Community',
        );
      case 'report':
        await _reportPost(post);
      case 'block':
        await _blockUser(post);
    }
  }

  Future<void> _startRecording() async {
    if (!await _recorder.hasPermission()) {
      _showMessage(
        'Microphone permission is required.',
        error: true,
      );
      return;
    }

    final directory = await getTemporaryDirectory();
    final path = '${directory.path}/voice_note_'
        '${DateTime.now().millisecondsSinceEpoch}.m4a';

    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc),
      path: path,
    );

    setState(() {
      _isRecording = true;
      _hasRecording = false;
      _recordSeconds = 0;
    });

    _recordTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) {
        if (mounted) {
          setState(() => _recordSeconds++);
        }
      },
    );
  }

  Future<void> _stopRecording() async {
    final path = await _recorder.stop();
    _recordTimer?.cancel();

    if (!mounted) return;

    setState(() {
      _isRecording = false;
      _hasRecording = path != null;
      _recordedPath = path;
    });
  }

  void _discardRecording() {
    setState(() {
      _hasRecording = false;
      _recordedPath = null;
      _recordSeconds = 0;
    });
  }

  Future<void> _submitPost() async {
    final text = _composerController.text.trim();

    if (text.isEmpty && !_hasRecording) return;

    setState(() => _posting = true);

    try {
      final formData = FormData.fromMap({
        if (text.isNotEmpty) 'content': text,
        'post_type': _selectedPostType,
        if (_hasRecording && _recordedPath != null)
          'audio': await MultipartFile.fromFile(
            _recordedPath!,
            filename: 'voice_note.m4a',
          ),
      });

      final response = await ApiClient.instance.post(
        '/agent-posts',
        data: formData,
      );

      _composerController.clear();
      _discardRecording();

      _showMessage(
        response.data['message']?.toString() ?? 'Posted.',
      );

      await _load();
    } catch (_) {
      _showMessage(
        'Subscription required to post.',
        error: true,
      );
    } finally {
      if (mounted) {
        setState(() => _posting = false);
      }
    }
  }

  void _showMessage(
    String message, {
    bool error = false,
  }) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppTheme.errorColor : null,
      ),
    );
  }

  String _formatSeconds(int seconds) {
    final minutes = seconds ~/ 60;
    final remaining = seconds % 60;

    return '${minutes.toString().padLeft(2, '0')}:'
        '${remaining.toString().padLeft(2, '0')}';
  }

  Widget _buildFilters() {
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _postTypes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 7),
        itemBuilder: (context, index) {
          final entry = _postTypes.entries.elementAt(index);
          final selected = _selectedFilter == entry.key;

          return FilterChip(
            selected: selected,
            label: Text(entry.value),
            onSelected: (_) {
              setState(() {
                _selectedFilter = entry.key;
              });

              _load();
            },
          );
        },
      ),
    );
  }

  Widget _buildComposer() {
    if (_isRecording) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 8,
          ),
          child: Row(
            children: [
              const Icon(
                Icons.fiber_manual_record,
                color: Colors.red,
                size: 14,
              ),
              const SizedBox(width: 8),
              Text(
                'Recording... '
                '${_formatSeconds(_recordSeconds)}',
              ),
              const Spacer(),
              IconButton(
                onPressed: _stopRecording,
                icon: const Icon(
                  Icons.stop_circle,
                  color: AppTheme.errorColor,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_hasRecording) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 8,
          ),
          child: Row(
            children: [
              const Icon(Icons.mic),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Voice note ready '
                  '(${_formatSeconds(_recordSeconds)})',
                ),
              ),
              IconButton(
                onPressed: _discardRecording,
                icon: const Icon(Icons.close),
              ),
              IconButton(
                onPressed: _posting ? null : _submitPost,
                icon: _posting
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
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: _selectedPostType,
              decoration: const InputDecoration(
                labelText: 'Post type',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: _postTypes.entries
                  .where((entry) => entry.key != 'all')
                  .map(
                    (entry) => DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _selectedPostType = value;
                  });
                }
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _composerController,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                hintText: 'Share something with Agent Community...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                IconButton(
                  tooltip: 'Record voice note',
                  onPressed: _startRecording,
                  icon: const Icon(Icons.mic_none),
                ),
                const Spacer(),
                FilledButton.icon(
                  onPressed: _posting ? null : _submitPost,
                  icon: _posting
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.send),
                  label: const Text('Post'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Agent Community'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(14),
          children: [
            _buildFilters(),
            const SizedBox(height: 12),
            _buildComposer(),
            const SizedBox(height: 14),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null)
              _CommunityStateCard(
                icon: Icons.cloud_off_outlined,
                message: _error!,
                actionLabel: 'Retry',
                onAction: _load,
              )
            else if (_posts.isEmpty)
              const _CommunityStateCard(
                icon: Icons.forum_outlined,
                message: 'No posts are available in this category yet.',
              )
            else
              for (final post in _posts)
                _AgentCommunityPostCard(
                  post: post,
                  onReact: (type) => _toggleReaction(post, type),
                  onOpen: () => context
                      .push(
                        '/community/post/${post['id']}',
                      )
                      .then((_) => _load()),
                  onActions: () => _showPostActions(post),
                ),
            if (_loadingMore)
              const Padding(
                padding: EdgeInsets.all(18),
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AgentCommunityPostCard extends StatelessWidget {
  final Map<String, dynamic> post;
  final void Function(String) onReact;
  final VoidCallback onOpen;
  final VoidCallback onActions;

  const _AgentCommunityPostCard({
    required this.post,
    required this.onReact,
    required this.onOpen,
    required this.onActions,
  });

  String _formatTime(String? value) {
    if (value == null) return '';

    final date = DateTime.tryParse(value)?.toLocal();

    if (date == null) return '';

    final difference = DateTime.now().difference(date);

    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    }
    if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    }
    if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    }

    return '${date.day}/${date.month}/${date.year}';
  }

  String _typeLabel(String? type) {
    return switch (type) {
      'question' => 'Question',
      'network_issue' => 'Network Issue',
      'fraud_alert' => 'Fraud Alert',
      'business_tip' => 'Business Tip',
      'announcement' => 'Announcement',
      _ => 'General',
    };
  }

  IconData _typeIcon(String? type) {
    return switch (type) {
      'question' => Icons.help_outline,
      'network_issue' => Icons.signal_wifi_bad,
      'fraud_alert' => Icons.warning_amber_outlined,
      'business_tip' => Icons.lightbulb_outline,
      'announcement' => Icons.campaign_outlined,
      _ => Icons.forum_outlined,
    };
  }

  @override
  Widget build(BuildContext context) {
    final content = post['content']?.toString();
    final audioUrl = post['audio_url']?.toString();
    final isPending = post['status'] == 'pending_review';

    return Card(
      margin: const EdgeInsets.only(bottom: 11),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        onLongPress: onActions,
        child: Padding(
          padding: const EdgeInsets.all(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    child: Text(
                      (post['first_name']?.toString().trim().isNotEmpty == true)
                          ? post['first_name'].toString()[0].toUpperCase()
                          : 'A',
                    ),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${post['first_name'] ?? ''} '
                                  '${post['last_name'] ?? ''}'
                              .trim(),
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          post['role']?.toString().replaceAll('_', ' ') ?? '',
                          style: TextStyle(
                            fontSize: 11,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Post actions',
                    onPressed: onActions,
                    icon: const Icon(Icons.more_horiz),
                  ),
                ],
              ),
              const SizedBox(height: 9),
              Wrap(
                spacing: 6,
                runSpacing: 5,
                children: [
                  _PostBadge(
                    icon: _typeIcon(
                      post['post_type']?.toString(),
                    ),
                    label: _typeLabel(
                      post['post_type']?.toString(),
                    ),
                  ),
                  if (post['is_pinned'] == true)
                    const _PostBadge(
                      icon: Icons.push_pin_outlined,
                      label: 'Pinned',
                    ),
                  if (post['is_official'] == true)
                    const _PostBadge(
                      icon: Icons.verified_outlined,
                      label: 'Official',
                    ),
                  if (post['is_urgent'] == true)
                    const _PostBadge(
                      icon: Icons.priority_high,
                      label: 'Urgent',
                    ),
                  if (post['is_saved'] == true)
                    const _PostBadge(
                      icon: Icons.bookmark,
                      label: 'Saved',
                    ),
                ],
              ),
              if (isPending) ...[
                const SizedBox(height: 8),
                const _PostBadge(
                  icon: Icons.hourglass_top,
                  label: 'Under Review',
                ),
              ],
              if (content != null && content.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(content),
              ],
              if (audioUrl != null && audioUrl.isNotEmpty) ...[
                const SizedBox(height: 10),
                AudioPlayerBubble(url: audioUrl),
              ],
              const SizedBox(height: 8),
              Text(
                _formatTime(
                  post['created_at']?.toString(),
                ),
                style: TextStyle(
                  fontSize: 11,
                  color: context.appSecondaryText,
                ),
              ),
              const Divider(height: 20),
              Row(
                children: [
                  ReactionButton(
                    myReaction: post['my_reaction']?.toString(),
                    totalCount: post['reaction_counts'] is Map
                        ? (post['reaction_counts'] as Map).values.fold<int>(
                              0,
                              (sum, value) =>
                                  sum +
                                  (int.tryParse(
                                        value.toString(),
                                      ) ??
                                      0),
                            )
                        : 0,
                    onReact: onReact,
                    iconSize: 20,
                  ),
                  const SizedBox(width: 18),
                  Icon(
                    Icons.chat_bubble_outline,
                    size: 20,
                    color: context.appSecondaryText,
                  ),
                  const SizedBox(width: 4),
                  Text('${post['comment_count'] ?? 0}'),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Share',
                    onPressed: () => Share.share(
                      content?.isNotEmpty == true
                          ? content!
                          : 'Voice note from Agent Community',
                    ),
                    icon: const Icon(Icons.share_outlined),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PostBadge extends StatelessWidget {
  final IconData icon;
  final String label;

  const _PostBadge({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .primaryContainer
            .withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _CommunityStateCard extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _CommunityStateCard({
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(icon, size: 42),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 10),
              TextButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
