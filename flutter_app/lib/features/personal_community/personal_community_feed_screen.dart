// personal_community_feed_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/community_widgets.dart';

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
  bool _composerExpanded = false;
  String? _error;
  static const int _maxRecordSeconds = 120;
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

  Future<void> _load({bool silent = false}) async {
    if (mounted && !silent) {
      setState(() {
        _loading = true;
        _error = null;
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
        _hasMore = pagination is Map && pagination['has_more'] == true;
        _nextCursor =
            pagination is Map ? pagination['next_cursor']?.toString() : null;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent) {
          _error = communityActionError(e, fallback: 'Something went wrong.');
        }
      });
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

        _hasMore = pagination is Map && pagination['has_more'] == true;
        _nextCursor =
            pagination is Map ? pagination['next_cursor']?.toString() : null;
      });
    } catch (_) {
      // Keep the posts already shown; the next scroll retries.
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _showMessage(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? AppTheme.errorColor : null,
    ));
  }

  Future<void> _toggleLike(
      Map<String, dynamic> post, String reactionType) async {
    final previousReaction = post['my_reaction']?.toString();
    final previousCounts = post['reaction_counts'] is Map
        ? Map<String, dynamic>.from(post['reaction_counts'] as Map)
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
    if (previousReaction != null) changeCount(previousReaction, -1);
    if (nextReaction != null) changeCount(nextReaction, 1);

    setState(() {
      post['my_reaction'] = nextReaction;
      post['reaction_counts'] = updatedCounts;
    });

    try {
      await ApiClient.instance.post(
        '/personal-community/posts/${post['id']}/react',
        data: {'reaction_type': reactionType},
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        post['my_reaction'] = previousReaction;
        post['reaction_counts'] = previousCounts;
      });
      _showMessage(
        communityActionError(e, fallback: 'Could not react. Try again.'),
        error: true,
      );
    }
  }

  Future<void> _startRecording() async {
    if (!await _recorder.hasPermission()) {
      _showMessage('Microphone permission is required to record a voice note');
      return;
    }
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/personal_voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path);
    if (!mounted) return;
    setState(() {
      _isRecording = true;
      _hasRecording = false;
      _recordSeconds = 0;
    });
    _recordTimer?.cancel();
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _recordSeconds++);
      if (_recordSeconds >= _maxRecordSeconds) {
        _stopRecording();
      }
    });
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
        setState(() => _composerExpanded = false);
        FocusScope.of(context).unfocus();
      }
      _showMessage(res.data['message']?.toString() ?? 'Posted');
      _load(silent: true);
    } catch (e) {
      _showMessage(
        communityActionError(
          e,
          fallback: 'Could not post. Try again.',
          restrictedMessage: 'Posting needs the Paid plan.',
        ),
        error: true,
      );
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  String _userInitial() {
    final state = context.read<AuthBloc>().state;
    if (state is AuthAuthenticated) {
      final name = state.user['first_name']?.toString().trim() ?? '';
      if (name.isNotEmpty) return name[0].toUpperCase();
    }
    return 'U';
  }

  void _openComposer() => setState(() => _composerExpanded = true);

  void _closeComposer() {
    FocusScope.of(context).unfocus();
    setState(() {
      _composerExpanded = false;
      _composerCtrl.clear();
    });
  }

  Widget _buildComposer() {
    if (!_isPaid) {
      return CommunityComposerPanel(
        child: Row(children: [
          const Icon(Icons.lock_outline,
              color: AppTheme.primaryColor, size: 20),
          const SizedBox(width: 10),
          const Expanded(
              child: Text('Upgrade to Paid to post in the community',
                  style: TextStyle(fontSize: 13.5))),
          TextButton(
            onPressed: () => context.push('/personal-subscription'),
            child: const Text('Upgrade'),
          ),
        ]),
      );
    }

    if (_isRecording) {
      return CommunityComposerPanel(
        child: Row(children: [
          const Icon(Icons.fiber_manual_record, color: Colors.red, size: 14),
          const SizedBox(width: 8),
          Text('Recording... ${_formatSeconds(_recordSeconds)}'
              ' / ${_formatSeconds(_maxRecordSeconds)}'),
          const Spacer(),
          IconButton(
              tooltip: 'Stop recording',
              icon: const Icon(Icons.stop_circle, color: AppTheme.errorColor),
              onPressed: _stopRecording),
        ]),
      );
    }

    if (_hasRecording) {
      return CommunityComposerPanel(
        child: Row(children: [
          const Icon(Icons.mic, color: AppTheme.primaryColor),
          const SizedBox(width: 8),
          Expanded(
              child: Text('Voice note ready (${_formatSeconds(_recordSeconds)})')),
          IconButton(
              tooltip: 'Discard',
              icon: Icon(Icons.close, color: context.appSecondaryText),
              onPressed: _discardRecording),
          IconButton(
            tooltip: 'Post',
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

    if (!_composerExpanded && _composerCtrl.text.trim().isEmpty) {
      return CommunityComposerBar(
        initial: _userInitial(),
        hint: 'Share something with Personal Community...',
        onTap: _openComposer,
        onMic: _startRecording,
      );
    }

    return CommunityComposerPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _composerCtrl,
            focusNode: _composerFocusNode,
            autofocus: true,
            minLines: 3,
            maxLines: 8,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(fontSize: 15, height: 1.45),
            decoration: const InputDecoration(
              hintText: 'Share something with Personal Community...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          Row(children: [
            IconButton(
              tooltip: 'Record voice note',
              onPressed: _startRecording,
              icon: const Icon(Icons.mic_none, color: AppTheme.primaryColor),
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
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Text('Post'),
            ),
          ]),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Personal Community'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: _isPaid && _showComposerShortcut
          ? FloatingActionButton.extended(
              onPressed: () {
                _openComposer();
                _scrollToComposer();
              },
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
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
              sliver: SliverList.list(children: [
                KeyedSubtree(key: _composerKey, child: _buildComposer()),
                const SizedBox(height: 14),
              ]),
            ),
            if (_loading)
              const SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 14),
                sliver: SliverToBoxAdapter(child: CommunitySkeletonList()),
              )
            else if (_error != null)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                sliver: SliverToBoxAdapter(
                  child: CommunityStateCard(
                    icon: Icons.cloud_off_outlined,
                    title: 'Could not load posts',
                    message: _error!,
                    actionLabel: 'Try again',
                    onAction: _load,
                  ),
                ),
              )
            else if (_posts.isEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                sliver: SliverToBoxAdapter(
                  child: CommunityStateCard(
                    icon: Icons.forum_outlined,
                    title: 'Nothing here yet',
                    message: 'Be the first to share something with the community.',
                    actionLabel: _isPaid ? 'Write a post' : null,
                    onAction: _isPaid
                        ? () {
                            _openComposer();
                            _scrollToComposer();
                          }
                        : null,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                sliver: SliverList.builder(
                  itemCount: _posts.length,
                  itemBuilder: (context, index) {
                    final post = _posts[index] as Map<String, dynamic>;
                    return CommunityPostCard(
                      key: ValueKey(post['id']?.toString() ?? index),
                      post: post,
                      onReact: (type) => _toggleLike(post, type),
                      onOpen: () async {
                        await context
                            .push('/personal-community/post/${post['id']}');
                        if (mounted) _load(silent: true);
                      },
                    );
                  },
                ),
              ),
            if (_loadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 90)),
          ],
        ),
      ),
    );
  }
}
