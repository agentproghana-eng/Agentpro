// personal_community_feed_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:share_plus/share_plus.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/reaction_button.dart';
import '../../shared/widgets/audio_player_bubble.dart';

/// Fully separate from the Agent Community per spec - own backend
/// tables/endpoints, own screen. Now at full feature parity with
/// Agent's Community (voice notes + share), reusing the exact same
/// record/audioplayers/share_plus packages and the same shared
/// AudioPlayerBubble widget rather than duplicating that logic.
/// Viewing and reacting work on the Free plan; only posting requires
/// Paid, gated using the cached personal_subscription_plan from
/// AuthBloc rather than an extra network call.
class PersonalCommunityFeedScreen extends StatefulWidget {
  const PersonalCommunityFeedScreen({super.key});
  @override
  State<PersonalCommunityFeedScreen> createState() =>
      _PersonalCommunityFeedScreenState();
}

class _PersonalCommunityFeedScreenState
    extends State<PersonalCommunityFeedScreen> {
  List<dynamic> _posts = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _nextCursor;

  final _composerCtrl = TextEditingController();
  final _composerFocusNode = FocusNode();
  final _composerKey = GlobalKey();
  final _scrollController = ScrollController();

  bool _posting = false;
  bool _showComposerShortcut = false;

  final _recorder = AudioRecorder();
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
    _composerCtrl.dispose();
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
      _isPaid &&
      !_isRecording &&
      !_hasRecording
    ) {
      _composerFocusNode.requestFocus();
    }
  }

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated &&
        state.user['personal_subscription_plan'] == 'paid';
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _nextCursor = null;
        _hasMore = true;
      });
    }

    try {
      final res = await ApiClient.instance.get(
        '/personal-community/feed/cursor',
        queryParameters: {'limit': 20},
      );

      if (!mounted) return;

      final pagination = res.data['pagination'];

      setState(() {
        _posts = res.data['data'] ?? [];
        _hasMore =
            pagination is Map && pagination['has_more'] == true;
        _nextCursor = pagination is Map
            ? pagination['next_cursor']?.toString()
            : null;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;

    final cursor = _nextCursor;

    if (cursor == null || cursor.isEmpty) {
      setState(() => _hasMore = false);
      return;
    }

    setState(() => _loadingMore = true);

    try {
      final res = await ApiClient.instance.get(
        '/personal-community/feed/cursor',
        queryParameters: {
          'limit': 20,
          'cursor': cursor,
        },
      );

      if (!mounted) return;

      final raw = res.data['data'];
      final pagination = res.data['pagination'];

      setState(() {
        if (raw is List) {
          _posts.addAll(raw);
        }

        _hasMore =
            pagination is Map && pagination['has_more'] == true;
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

  Future<void> _toggleLike(String postId, String reactionType) async {
    try {
      await ApiClient.instance.post('/personal-community/posts/$postId/react',
          data: {'reaction_type': reactionType});
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to react'),
            backgroundColor: AppTheme.errorColor));
      }
    }
  }

  Future<void> _startRecording() async {
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Microphone permission is required to record a voice note')));
      }
      return;
    }
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/personal_voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path);
    setState(() {
      _isRecording = true;
      _hasRecording = false;
      _recordSeconds = 0;
    });
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordSeconds++);
    });
  }

  Future<void> _stopRecording() async {
    final path = await _recorder.stop();
    _recordTimer?.cancel();
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

  String _formatSeconds(int s) =>
      '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

  Future<void> _submitPost() async {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty && !_hasRecording) return;

    setState(() => _posting = true);
    try {
      final formData = FormData.fromMap({
        if (text.isNotEmpty) 'content': text,
        if (_hasRecording && _recordedPath != null)
          'audio': await MultipartFile.fromFile(_recordedPath!,
              filename: 'voice_note.m4a'),
      });
      final res = await ApiClient.instance
          .post('/personal-community/posts', data: formData);
      _composerCtrl.clear();
      _discardRecording();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Posted')));
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to post'),
            backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  Widget _buildComposer() {
    if (!_isPaid) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05), blurRadius: 4)
            ]),
        child: Row(children: [
          const Icon(Icons.lock_outline,
              color: AppTheme.primaryColor, size: 18),
          const SizedBox(width: 8),
          const Expanded(
              child: Text('Upgrade to Paid to post in the community',
                  style: TextStyle(fontSize: 12))),
          TextButton(
            onPressed: () => context.push('/personal-subscription'),
            child: const Text('Upgrade'),
          ),
        ]),
      );
    }

    if (_isRecording) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05), blurRadius: 4)
            ]),
        child: Row(children: [
          const Icon(Icons.fiber_manual_record, color: Colors.red, size: 14),
          const SizedBox(width: 8),
          Text('Recording... ${_formatSeconds(_recordSeconds)}',
              style: const TextStyle(fontSize: 12)),
          const Spacer(),
          IconButton(
              icon: const Icon(Icons.stop_circle, color: AppTheme.errorColor),
              onPressed: _stopRecording),
        ]),
      );
    }

    if (_hasRecording) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05), blurRadius: 4)
            ]),
        child: Row(children: [
          const Icon(Icons.mic, color: AppTheme.primaryColor, size: 18),
          const SizedBox(width: 8),
          Text('Voice note ready (${_formatSeconds(_recordSeconds)})',
              style: const TextStyle(fontSize: 12)),
          const Spacer(),
          IconButton(
              icon: Icon(Icons.close, color: context.appSecondaryText),
              onPressed: _discardRecording),
          IconButton(
            icon: _posting
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send, color: AppTheme.primaryColor),
            onPressed: _posting ? null : _submitPost,
          ),
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
          color: context.appSurface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.05), blurRadius: 4)
          ]),
      child: Row(children: [
        Expanded(
            child: TextField(
                controller: _composerCtrl,
                focusNode: _composerFocusNode,
                decoration: const InputDecoration(
                    hintText: 'Share something...', border: InputBorder.none))),
        IconButton(
            icon: const Icon(Icons.mic_none, color: AppTheme.primaryColor),
            onPressed: _startRecording),
        IconButton(
          icon: _posting
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.send, color: AppTheme.primaryColor),
          onPressed: _posting ? null : _submitPost,
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Personal Community')),
      floatingActionButton:
          _isPaid && _showComposerShortcut
              ? FloatingActionButton.extended(
                  onPressed: _scrollToComposer,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('New post'),
                )
              : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                children: [
                  KeyedSubtree(
                    key: _composerKey,
                    child: _buildComposer(),
                  ),
                  const SizedBox(height: 16),
                  for (final p in _posts)
                    _PersonalPostCard(
                      post: p,
                      onLike: (type) => _toggleLike(p['id'], type),
                      onOpen: () => context
                          .push('/personal-community/post/${p['id']}')
                          .then((_) => _load()),
                    ),
                  if (_loadingMore)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
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

class _PersonalPostCard extends StatelessWidget {
  final Map<String, dynamic> post;
  final void Function(String reactionType) onLike;
  final VoidCallback onOpen;

  const _PersonalPostCard(
      {required this.post, required this.onLike, required this.onOpen});

  String _formatPostTime(String? createdAt) {
    if (createdAt == null) return '';
    final date = DateTime.tryParse(createdAt);
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final isPending = post['status'] == 'pending_review';
    final audioUrl = post['audio_url'] as String?;

    return GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(13),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
            color: context.appSurface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)
            ]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
                backgroundColor: AppTheme.primaryColor,
                child: Text(
                    ((post['first_name'] as String?) ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.bold))),
            const SizedBox(width: 8),
            Text('${post['first_name'] ?? ''} ${post['last_name'] ?? ''}',
                style: const TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 12.5)),
          ]),
          const SizedBox(height: 8),
          if (isPending)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                  color: context.isDarkMode
                      ? const Color(0xFF332B15)
                      : const Color(0xFFFFF4D9),
                  borderRadius: BorderRadius.circular(8)),
              child: Text('Under Review — only you can see this',
                  style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.bold,
                      color: context.isDarkMode
                          ? AppTheme.secondaryColor
                          : const Color(0xFF7A5B00))),
            ),
          if (post['content'] != null && (post['content'] as String).isNotEmpty)
            Text(post['content'], style: const TextStyle(fontSize: 12.5)),
          if (audioUrl != null) ...[
            if (post['content'] != null &&
                (post['content'] as String).isNotEmpty)
              const SizedBox(height: 8),
            AudioPlayerBubble(url: audioUrl),
          ],
          const SizedBox(height: 6),
          Text(_formatPostTime(post['created_at'] as String?),
              style:
                  TextStyle(fontSize: 10.5, color: context.appSecondaryText)),
          const SizedBox(height: 10),
          Row(children: [
            ReactionButton(
              myReaction: post['my_reaction'] as String?,
              totalCount: post['reaction_counts'] is Map
                  ? (post['reaction_counts'] as Map).values.fold<int>(
                      0, (sum, v) => sum + (int.tryParse(v.toString()) ?? 0))
                  : 0,
              onReact: onLike,
              iconSize: 20,
            ),
            const SizedBox(width: 18),
            Row(children: [
              Icon(Icons.chat_bubble_outline,
                  size: 20, color: context.appSecondaryText),
              const SizedBox(width: 4),
              Text('${post['comment_count'] ?? 0}',
                  style: const TextStyle(fontSize: 13)),
            ]),
            const SizedBox(width: 18),
            InkWell(
              onTap: () async {
                await SharePlus.instance.share(
                  ShareParams(
                    text: '${post['content'] ?? 'Voice note'}',
                  ),
                );
              },
              child: Icon(Icons.share_outlined,
                  size: 20, color: context.appSecondaryText),
            ),
          ]),
        ]),
      ),
    );
  }
}
