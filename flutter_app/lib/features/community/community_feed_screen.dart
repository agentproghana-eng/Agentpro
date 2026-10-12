import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/community_widgets.dart';

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
  final _composerFocusNode = FocusNode();
  final _composerKey = GlobalKey();
  final _scrollController = ScrollController();
  final _recorder = AudioRecorder();

  bool _loading = true;
  bool _showComposerShortcut = false;
  bool _loadingMore = false;
  bool _posting = false;
  bool _hasMore = true;

  String? _error;
  String _selectedFilter = 'all';
  String _selectedPostType = 'general';

  String? _nextCursor;

  // The composer starts as a slim bar and opens when tapped.
  bool _composerExpanded = false;

  static const int _maxRecordSeconds = 120;

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
    _composerFocusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _handleScroll() {
    _syncComposerShortcut();

    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 300 &&
        !_loadingMore &&
        _hasMore) {
      _loadMore();
    }
  }

  void _syncComposerShortcut() {
    if (!mounted) return;

    final composerContext = _composerKey.currentContext;
    final renderObject = composerContext?.findRenderObject();

    if (renderObject is! RenderBox || !renderObject.hasSize) {
      return;
    }

    final top = renderObject.localToGlobal(Offset.zero).dy;
    final bottom = top + renderObject.size.height;

    final unavailableAbove =
        MediaQuery.of(context).padding.top +
        kToolbarHeight +
        8;

    final shouldShow =
        bottom <= unavailableAbove;

    if (shouldShow != _showComposerShortcut) {
      setState(() {
        _showComposerShortcut = shouldShow;
      });
    }
  }

  Future<void> _scrollToComposer() async {
    final composerContext = _composerKey.currentContext;

    if (composerContext != null) {
      await Scrollable.ensureVisible(
        composerContext,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        alignment: 0.05,
      );
    } else if (_scrollController.hasClients) {
      await _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    }

    if (
      mounted &&
      !_isRecording &&
      !_hasRecording
    ) {
      _composerFocusNode.requestFocus();
    }
  }

  Map<String, dynamic> _queryParameters({String? cursor}) {
    return {
      'limit': 20,
      if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      if (_selectedFilter != 'all') 'type': _selectedFilter,
    };
  }

  Future<void> _load({bool silent = false}) async {
    if (mounted && !silent) {
      setState(() {
        _loading = true;
        _error = null;
        _nextCursor = null;
      });
    }

    try {
      final response = await ApiClient.instance.get(
        '/agent-posts/cursor',
        queryParameters: _queryParameters(),
      );

      final raw = response.data['data'];
      final pagination = response.data['pagination'];

      if (!mounted) return;

      setState(() {
        _posts = raw is List
            ? raw.whereType<Map>().map(Map<String, dynamic>.from).toList()
            : [];

        _hasMore = pagination is Map && pagination['has_more'] == true;
        _nextCursor = pagination is Map
            ? pagination['next_cursor']?.toString()
            : null;

        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      // A quiet refresh that fails keeps the posts already on screen.
      if (silent) return;

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
      final cursor = _nextCursor;

      if (cursor == null || cursor.isEmpty) {
        setState(() {
          _hasMore = false;
          _loadingMore = false;
        });
        return;
      }

      final response = await ApiClient.instance.get(
        '/agent-posts/cursor',
        queryParameters: _queryParameters(cursor: cursor),
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

        _hasMore = pagination is Map && pagination['has_more'] == true;
        _nextCursor = pagination is Map
            ? pagination['next_cursor']?.toString()
            : null;
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
    final previousReaction = post['my_reaction']?.toString();

    final previousCounts = post['reaction_counts'] is Map
        ? Map<String, dynamic>.from(
            post['reaction_counts'] as Map,
          )
        : <String, dynamic>{};

    final updatedCounts = Map<String, dynamic>.from(previousCounts);

    void changeCount(String type, int change) {
      final current = int.tryParse(updatedCounts[type]?.toString() ?? '') ?? 0;
      final updated = current + change;

      if (updated <= 0) {
        updatedCounts.remove(type);
      } else {
        updatedCounts[type] = updated;
      }
    }

    final nextReaction = previousReaction == reactionType ? null : reactionType;

    if (previousReaction != null) {
      changeCount(previousReaction, -1);
    }

    if (nextReaction != null) {
      changeCount(nextReaction, 1);
    }

    setState(() {
      post['my_reaction'] = nextReaction;
      post['reaction_counts'] = updatedCounts;
    });

    try {
      await ApiClient.instance.post(
        '/agent-posts/${post['id']}/like',
        data: {'reaction_type': reactionType},
      );
    } catch (error) {
      if (!mounted) return;

      setState(() {
        post['my_reaction'] = previousReaction;
        post['reaction_counts'] = previousCounts;
      });

      _showMessage(
        communityActionError(
          error,
          fallback: 'Could not save your reaction. Please try again.',
          restrictedMessage: 'A subscription is required to react to posts.',
        ),
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
        await SharePlus.instance.share(
          ShareParams(
            text: post['content']?.toString().trim().isNotEmpty == true
                ? post['content'].toString()
                : 'Voice note from Agent Community',
          ),
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
        if (!mounted) return;

        setState(() => _recordSeconds++);

        if (_recordSeconds >= _maxRecordSeconds && _isRecording) {
          _showMessage('Voice notes are limited to 2 minutes.');
          _stopRecording();
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

      if (mounted) {
        setState(() => _composerExpanded = false);
      }

      _showMessage(
        response.data['message']?.toString() ?? 'Posted.',
      );

      // Refresh quietly so the feed does not flash and keeps its place.
      await _load(silent: true);
    } catch (error) {
      _showMessage(
        communityActionError(
          error,
          fallback: 'Could not post. Please try again.',
          restrictedMessage: 'A subscription is required to post.',
        ),
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
            showCheckmark: false,
            label: Text(
              entry.value,
              style: const TextStyle(fontSize: 14),
            ),
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

    if (!_composerExpanded && _composerController.text.trim().isEmpty) {
      return CommunityComposerBar(
        initial: _userInitial(),
        hint: 'Share something with Agent Community...',
        onTap: _openComposer,
        onMic: _startRecording,
      );
    }

    return CommunityComposerPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What is this about?',
            style: TextStyle(
              fontSize: 12.5,
              color: context.appSecondaryText,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final entry
                    in _postTypes.entries.where((e) => e.key != 'all'))
                  Padding(
                    padding: const EdgeInsets.only(right: 7),
                    child: ChoiceChip(
                      selected: _selectedPostType == entry.key,
                      showCheckmark: false,
                      label: Text(
                        entry.value,
                        style: const TextStyle(fontSize: 14),
                      ),
                      onSelected: (_) {
                        setState(() => _selectedPostType = entry.key);
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _composerController,
            focusNode: _composerFocusNode,
            autofocus: true,
            minLines: 3,
            maxLines: 8,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(fontSize: 15, height: 1.45),
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
                icon: const Icon(
                  Icons.mic_none,
                  color: AppTheme.primaryColor,
                ),
              ),
              TextButton(
                onPressed: _posting ? null : _closeComposer,
                child: const Text('Cancel'),
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
    );
  }

  String _userInitial() {
    final state = context.read<AuthBloc>().state;

    if (state is AuthAuthenticated) {
      final name = state.user['first_name']?.toString().trim() ?? '';
      if (name.isNotEmpty) return name[0].toUpperCase();
    }

    return 'A';
  }

  void _openComposer() {
    setState(() => _composerExpanded = true);
  }

  void _closeComposer() {
    FocusScope.of(context).unfocus();
    setState(() {
      _composerExpanded = false;
      _composerController.clear();
    });
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
      floatingActionButton:
          _showComposerShortcut
              ? FloatingActionButton.extended(
                  onPressed: _scrollToComposer,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('New post'),
                )
              : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                14,
                14,
                14,
                0,
              ),
              sliver: SliverList.list(
                children: [
                  _buildFilters(),
                  const SizedBox(height: 12),
                  KeyedSubtree(
                    key: _composerKey,
                    child: _buildComposer(),
                  ),
                  const SizedBox(height: 14),
                ],
              ),
            ),
            if (_loading)
              const SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 14),
                sliver: SliverToBoxAdapter(
                  child: CommunitySkeletonList(),
                ),
              )
            else if (_error != null)
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                ),
                sliver: SliverToBoxAdapter(
                  child: CommunityStateCard(
                    icon: Icons.cloud_off_outlined,
                    title: 'Could not load posts',
                    message: '$_error Check your connection and try again.',
                    actionLabel: 'Try again',
                    onAction: _load,
                  ),
                ),
              )
            else if (_posts.isEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                ),
                sliver: SliverToBoxAdapter(
                  child: CommunityStateCard(
                    icon: Icons.forum_outlined,
                    title: 'Nothing here yet',
                    message: _selectedFilter == 'all'
                        ? 'Be the first to share something with the community.'
                        : 'No posts in this category yet.',
                    actionLabel: 'Write a post',
                    onAction: () {
                      _openComposer();
                      _scrollToComposer();
                    },
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                ),
                sliver: SliverList.builder(
                  itemCount: _posts.length,
                  itemBuilder: (context, index) {
                    final post = _posts[index];

                    return CommunityPostCard(
                      key: ValueKey(
                        post['id']?.toString() ?? index,
                      ),
                      showTypeAndRole: true,
                      post: post,
                      onReact: (type) => _toggleReaction(post, type),
                      onOpen: () async {
                        await context.push(
                          '/community/post/${post['id']}',
                        );
                      },
                      onActions: () => _showPostActions(post),
                    );
                  },
                ),
              ),
            if (_loadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Center(
                    child: CircularProgressIndicator(),
                  ),
                ),
              ),
            const SliverToBoxAdapter(
              child: SizedBox(height: 14),
            ),
          ],
        ),
      ),
    );
  }
}
