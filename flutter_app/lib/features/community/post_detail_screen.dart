import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/reaction_button.dart';
import '../../shared/widgets/audio_player_bubble.dart';

class PostDetailScreen extends StatefulWidget {
  final String postId;
  const PostDetailScreen({super.key, required this.postId});

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  Map<String, dynamic>? _post;
  List<dynamic> _comments = [];
  bool _loading = true;
  final _commentCtrl = TextEditingController();
  bool _sending = false;

  // Replies can go to any depth - every comment, including replies
  // themselves, gets its own Reply button. null means the composer
  // is posting a top-level comment.
  String? _replyingToId;
  String? _replyingToName;

  final _recorder = AudioRecorder();
  bool _isRecording = false;
  bool _hasRecording = false;
  String? _recordedPath;
  int _recordSeconds = 0;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/agent-posts'),
        ApiClient.instance.get('/agent-posts/${widget.postId}/comments'),
      ]);
      final allPosts = results[0].data['data'] as List;
      final match = allPosts.firstWhere((p) => p['id'] == widget.postId,
          orElse: () => null);
      setState(() {
        _post = match as Map<String, dynamic>?;
        _comments = results[1].data['data'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _topLevelComments => _comments
      .where((c) => c['parent_comment_id'] == null)
      .cast<Map<String, dynamic>>()
      .toList();

  List<Map<String, dynamic>> _repliesFor(String commentId) => _comments
      .where((c) => c['parent_comment_id'] == commentId)
      .cast<Map<String, dynamic>>()
      .toList();

  String _relativeTime(String? dateStr) {
    if (dateStr == null) return '';
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    final diff = DateTime.now().difference(date.toLocal());
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'just now';
  }

  Future<void> _toggleCommentReaction(
    String commentId,
    String reactionType,
  ) async {
    final commentIndex = _comments.indexWhere(
      (comment) => comment is Map && comment['id']?.toString() == commentId,
    );

    if (commentIndex == -1) return;

    final comment = Map<String, dynamic>.from(
      _comments[commentIndex] as Map,
    );

    final previousReaction = comment['my_reaction']?.toString();

    final previousCounts = comment['reaction_counts'] is Map
        ? Map<String, dynamic>.from(
            comment['reaction_counts'] as Map,
          )
        : <String, dynamic>{};

    final updatedCounts = Map<String, dynamic>.from(previousCounts);

    void changeCount(String type, int change) {
      final current = int.tryParse(
            updatedCounts[type]?.toString() ?? '',
          ) ??
          0;
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
      _comments[commentIndex] = {
        ...comment,
        'my_reaction': nextReaction,
        'reaction_counts': updatedCounts,
      };
    });

    try {
      await ApiClient.instance.post(
        '/agent-posts/comments/$commentId/react',
        data: {'reaction_type': reactionType},
      );
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _comments[commentIndex] = {
          ...comment,
          'my_reaction': previousReaction,
          'reaction_counts': previousCounts,
        };
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Subscription required to react',
          ),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _startReply(String commentId, String name) {
    setState(() {
      _replyingToId = commentId;
      _replyingToName = name;
    });
  }

  void _cancelReply() {
    setState(() {
      _replyingToId = null;
      _replyingToName = null;
    });
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
        '${dir.path}/comment_voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a';
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
      "${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}";

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty && !_hasRecording) return;
    setState(() => _sending = true);
    try {
      final formData = FormData.fromMap({
        if (text.isNotEmpty) 'content': text,
        if (_replyingToId != null) 'parent_comment_id': _replyingToId,
        if (_hasRecording && _recordedPath != null)
          'audio': await MultipartFile.fromFile(_recordedPath!,
              filename: 'comment_voice_note.m4a'),
      });
      await ApiClient.instance
          .post('/agent-posts/${widget.postId}/comments', data: formData);
      _commentCtrl.clear();
      _discardRecording();
      _cancelReply();
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Subscription required to comment'),
            backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  // Recursive by design - a reply can itself have replies, to any
  // depth the backend's self-referencing parent_comment_id allows.
  // Visual indent is capped at 2 levels so a long thread doesn't
  // squeeze content off a phone screen; deeper replies still render,
  // just at the same indent as level 2 rather than creeping further.
  Widget _commentTile(Map<String, dynamic> c, {int depth = 0}) {
    final name = "${c["first_name"] ?? ""} ${c["last_name"] ?? ""}".trim();
    final indent = depth.clamp(0, 2) * 20.0;
    final time = _relativeTime(c['created_at'] as String?);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.all(10),
        margin: EdgeInsets.only(bottom: 8, left: indent),
        decoration: BoxDecoration(
          color: depth > 0 ? context.appDivider : context.appSurface,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(name.isEmpty ? '—' : name,
                style: const TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 11.5)),
            if (time.isNotEmpty) ...[
              const SizedBox(width: 6),
              Text(time,
                  style:
                      TextStyle(fontSize: 10, color: context.appSecondaryText)),
            ],
          ]),
          const SizedBox(height: 3),
          if (c['content'] != null && (c['content'] as String).isNotEmpty)
            Text(c['content'], style: const TextStyle(fontSize: 12)),
          if (c['audio_url'] != null) ...[
            const SizedBox(height: 4),
            AudioPlayerBubble(url: c['audio_url'] as String),
          ],
          const SizedBox(height: 4),
          Row(children: [
            ReactionButton(
              myReaction: c['my_reaction'] as String?,
              totalCount: c['reaction_counts'] is Map
                  ? (c['reaction_counts'] as Map).values.fold<int>(
                      0, (sum, v) => sum + (int.tryParse(v.toString()) ?? 0))
                  : 0,
              onReact: (type) =>
                  _toggleCommentReaction(c['id'] as String, type),
              iconSize: 15,
            ),
            const SizedBox(width: 14),
            GestureDetector(
              onTap: () =>
                  _startReply(c['id'] as String, name.isEmpty ? 'them' : name),
              child: const Text('Reply',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor)),
            ),
          ]),
        ]),
      ),
      for (final r in _repliesFor(c['id'] as String))
        _commentTile(r, depth: depth + 1),
    ]);
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _recordTimer?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _post == null
              ? const Center(child: Text('Post not found'))
              : Column(children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                              color: context.appSurface,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.06),
                                    blurRadius: 4)
                              ]),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                    "${_post!["first_name"] ?? ""} ${_post!["last_name"] ?? ""}",
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                                const SizedBox(height: 6),
                                if (_post!['content'] != null &&
                                    (_post!['content'] as String).isNotEmpty)
                                  Text(_post!['content'],
                                      style: const TextStyle(fontSize: 13)),
                                if (_post!['audio_url'] != null) ...[
                                  const SizedBox(height: 8),
                                  AudioPlayerBubble(
                                      url: _post!['audio_url'] as String),
                                ],
                              ]),
                        ),
                        const SizedBox(height: 16),
                        const Text('Comments',
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        for (final c in _topLevelComments) _commentTile(c),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        color: context.appSurface,
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 4)
                        ]),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_replyingToId != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(children: [
                                Expanded(
                                    child: Text('Replying to $_replyingToName',
                                        style: TextStyle(
                                            fontSize: 11,
                                            color: context.appSecondaryText))),
                                GestureDetector(
                                    onTap: _cancelReply,
                                    child: Icon(Icons.close,
                                        size: 16,
                                        color: context.appSecondaryText)),
                              ]),
                            ),
                          if (_isRecording)
                            Row(children: [
                              const Icon(Icons.fiber_manual_record,
                                  color: Colors.red, size: 14),
                              const SizedBox(width: 8),
                              Text(
                                  'Recording... ${_formatSeconds(_recordSeconds)}',
                                  style: const TextStyle(fontSize: 12)),
                              const Spacer(),
                              IconButton(
                                  icon: const Icon(Icons.stop_circle,
                                      color: AppTheme.errorColor),
                                  onPressed: _stopRecording),
                            ])
                          else if (_hasRecording)
                            Row(children: [
                              const Icon(Icons.mic,
                                  color: AppTheme.primaryColor, size: 18),
                              const SizedBox(width: 8),
                              Text(
                                  'Voice note ready (${_formatSeconds(_recordSeconds)})',
                                  style: const TextStyle(fontSize: 12)),
                              const Spacer(),
                              IconButton(
                                  icon: Icon(Icons.close,
                                      color: context.appSecondaryText),
                                  onPressed: _discardRecording),
                              IconButton(
                                icon: _sending
                                    ? const SizedBox(
                                        height: 18,
                                        width: 18,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : const Icon(Icons.send,
                                        color: AppTheme.primaryColor),
                                onPressed: _sending ? null : _sendComment,
                              ),
                            ])
                          else
                            Row(children: [
                              Expanded(
                                  child: TextField(
                                      controller: _commentCtrl,
                                      decoration: InputDecoration(
                                          hintText: _replyingToId != null
                                              ? 'Write a reply...'
                                              : 'Write a comment...',
                                          border: const OutlineInputBorder()))),
                              IconButton(
                                  icon: const Icon(Icons.mic_none,
                                      color: AppTheme.primaryColor),
                                  onPressed: _startRecording),
                              IconButton(
                                icon: _sending
                                    ? const SizedBox(
                                        height: 18,
                                        width: 18,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : const Icon(Icons.send,
                                        color: AppTheme.primaryColor),
                                onPressed: _sending ? null : _sendComment,
                              ),
                            ]),
                        ]),
                  ),
                ]),
    );
  }
}
