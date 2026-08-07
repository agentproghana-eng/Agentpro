// personal_post_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/reaction_button.dart';

class PersonalPostDetailScreen extends StatefulWidget {
  final String postId;
  const PersonalPostDetailScreen({super.key, required this.postId});

  @override
  State<PersonalPostDetailScreen> createState() =>
      _PersonalPostDetailScreenState();
}

class _PersonalPostDetailScreenState extends State<PersonalPostDetailScreen> {
  Map<String, dynamic>? _post;
  List<dynamic> _comments = [];
  bool _loading = true;
  final _commentCtrl = TextEditingController();
  bool _sending = false;

  // Replies can go to any depth - every comment, including replies
  // themselves, gets its own Reply button. null means the composer is
  // posting a top-level comment.
  String? _replyingToId;
  String? _replyingToName;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated &&
        state.user['personal_subscription_plan'] == 'paid';
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/personal-community/feed'),
        ApiClient.instance
            .get('/personal-community/posts/${widget.postId}/comments'),
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
      String commentId, String reactionType) async {
    try {
      await ApiClient.instance.post(
          '/personal-community/comments/$commentId/react',
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

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    try {
      await ApiClient.instance
          .post('/personal-community/posts/${widget.postId}/comments', data: {
        'content': text,
        if (_replyingToId != null) 'parent_comment_id': _replyingToId,
      });
      _commentCtrl.clear();
      _cancelReply();
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to comment'),
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
    final name = '${c['first_name'] ?? ''} ${c['last_name'] ?? ''}'.trim();
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
            if (_isPaid)
              GestureDetector(
                onTap: () => _startReply(
                    c['id'] as String, name.isEmpty ? 'them' : name),
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

  Widget _buildComposer() {
    if (!_isPaid) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: context.appSurface, boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 4)
        ]),
        child: Row(children: [
          const Icon(Icons.lock_outline,
              color: AppTheme.primaryColor, size: 18),
          const SizedBox(width: 8),
          const Expanded(
              child: Text('Upgrade to Paid to comment',
                  style: TextStyle(fontSize: 12))),
          TextButton(
            onPressed: () => context.push('/personal-subscription'),
            child: const Text('Upgrade'),
          ),
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: context.appSurface, boxShadow: [
        BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 4)
      ]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_replyingToId != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Expanded(
                  child: Text('Replying to $_replyingToName',
                      style: TextStyle(
                          fontSize: 11, color: context.appSecondaryText))),
              GestureDetector(
                  onTap: _cancelReply,
                  child: Icon(Icons.close,
                      size: 16, color: context.appSecondaryText)),
            ]),
          ),
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
            icon: _sending
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send, color: AppTheme.primaryColor),
            onPressed: _sending ? null : _sendComment,
          ),
        ]),
      ]),
    );
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
                                    '${_post!['first_name'] ?? ''} ${_post!['last_name'] ?? ''}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                                const SizedBox(height: 6),
                                if (_post!['content'] != null &&
                                    (_post!['content'] as String).isNotEmpty)
                                  Text(_post!['content'],
                                      style: const TextStyle(fontSize: 13)),
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
                  _buildComposer(),
                ]),
    );
  }
}
