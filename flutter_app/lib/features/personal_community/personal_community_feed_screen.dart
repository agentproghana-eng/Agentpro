// personal_community_feed_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_bloc.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/widgets/reaction_button.dart';

/// Fully separate from the Agent Community per spec - own backend
/// tables/endpoints, own screen. Text-only (the Agent Community's
/// voice-note recording is a real dependency-risk surface this doesn't
/// need to touch at all). Viewing and reacting work on the Free plan;
/// only posting requires Paid, gated using the cached
/// personal_subscription_plan from AuthBloc rather than an extra
/// network call.
class PersonalCommunityFeedScreen extends StatefulWidget {
  const PersonalCommunityFeedScreen({super.key});
  @override
  State<PersonalCommunityFeedScreen> createState() => _PersonalCommunityFeedScreenState();
}

class _PersonalCommunityFeedScreenState extends State<PersonalCommunityFeedScreen> {
  List<dynamic> _posts = [];
  bool _loading = true;
  final _composerCtrl = TextEditingController();
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _composerCtrl.dispose();
    super.dispose();
  }

  bool get _isPaid {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated && state.user['personal_subscription_plan'] == 'paid';
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/personal-community/feed');
      setState(() {
        _posts = res.data['data'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _toggleLike(String postId, String reactionType) async {
    try {
      await ApiClient.instance.post('/personal-community/posts/$postId/react', data: {'reaction_type': reactionType});
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to react'), backgroundColor: AppTheme.errorColor));
      }
    }
  }

  Future<void> _submitPost() async {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty) return;

    setState(() => _posting = true);
    try {
      final res = await ApiClient.instance.post('/personal-community/posts', data: {'content': text});
      _composerCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res.data['message'] ?? 'Posted')));
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to post'), backgroundColor: AppTheme.errorColor));
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  Widget _buildComposer() {
    if (!_isPaid) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
        child: Row(children: [
          const Icon(Icons.lock_outline, color: AppTheme.primaryColor, size: 18),
          const SizedBox(width: 8),
          const Expanded(child: Text('Upgrade to Paid to post in the community', style: TextStyle(fontSize: 12))),
          TextButton(
            onPressed: () => context.push('/personal-subscription'),
            child: const Text('Upgrade'),
          ),
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
      child: Row(children: [
        Expanded(child: TextField(controller: _composerCtrl,
          decoration: const InputDecoration(hintText: 'Share something...', border: InputBorder.none))),
        IconButton(
          icon: _posting ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send, color: AppTheme.primaryColor),
          onPressed: _posting ? null : _submitPost,
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Personal Community')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildComposer(),
                  const SizedBox(height: 16),
                  for (final p in _posts)
                    _PersonalPostCard(
                      post: p,
                      onLike: (type) => _toggleLike(p['id'], type),
                      onOpen: () => context.push('/personal-community/post/${p['id']}').then((_) => _load()),
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

  const _PersonalPostCard({required this.post, required this.onLike, required this.onOpen});

  String _formatPostTime(String? createdAt) {
    if (createdAt == null) return '';
    final date = DateTime.tryParse(createdAt);
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final isPending = post['status'] == 'pending_review';

    return GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(13),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(color: context.appSurface, borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(backgroundColor: AppTheme.primaryColor,
              child: Text(((post['first_name'] as String?) ?? 'U')[0].toUpperCase(),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
            const SizedBox(width: 8),
            Text('${post['first_name'] ?? ''} ${post['last_name'] ?? ''}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
          ]),
          const SizedBox(height: 8),
          if (isPending)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: context.isDarkMode ? const Color(0xFF332B15) : const Color(0xFFFFF4D9),
                borderRadius: BorderRadius.circular(8)),
              child: Text('Under Review — only you can see this',
                style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold,
                  color: context.isDarkMode ? AppTheme.secondaryColor : const Color(0xFF7A5B00))),
            ),
          if (post['content'] != null && (post['content'] as String).isNotEmpty)
            Text(post['content'], style: const TextStyle(fontSize: 12.5)),
          const SizedBox(height: 6),
          Text(_formatPostTime(post['created_at'] as String?),
            style: TextStyle(fontSize: 10.5, color: context.appSecondaryText)),
          const SizedBox(height: 10),
          Row(children: [
            ReactionButton(
              myReaction: post['my_reaction'] as String?,
              totalCount: post['reaction_counts'] is Map
                  ? (post['reaction_counts'] as Map).values.fold<int>(0, (sum, v) => sum + (int.tryParse(v.toString()) ?? 0))
                  : 0,
              onReact: onLike,
              iconSize: 20,
            ),
            const SizedBox(width: 18),
            Row(children: [
              Icon(Icons.chat_bubble_outline, size: 20, color: context.appSecondaryText),
              const SizedBox(width: 4),
              Text('${post['comment_count'] ?? 0}', style: const TextStyle(fontSize: 13)),
            ]),
          ]),
        ]),
      ),
    );
  }
}
