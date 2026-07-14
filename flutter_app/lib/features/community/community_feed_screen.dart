import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class CommunityFeedScreen extends StatefulWidget {
  const CommunityFeedScreen({super.key});

  @override
  State<CommunityFeedScreen> createState() => _CommunityFeedScreenState();
}

class _CommunityFeedScreenState extends State<CommunityFeedScreen> {
  List<dynamic> _posts = [];
  bool _loading = true;
  final _composerCtrl = TextEditingController();
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get("/agent-posts");
      setState(() {
        _posts = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _toggleLike(String postId) async {
    try {
      await ApiClient.instance.post("/agent-posts/$postId/like");
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Subscription required to like posts"), backgroundColor: AppTheme.errorColor));
    }
  }

  Future<void> _submitPost() async {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _posting = true);
    try {
      final res = await ApiClient.instance.post("/agent-posts", data: {"content": text});
      _composerCtrl.clear();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res.data["message"] ?? "Posted")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Subscription required to post"), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Agent Community")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
                    child: Row(children: [
                      Expanded(child: TextField(controller: _composerCtrl, decoration: const InputDecoration(hintText: "Share something with the community...", border: InputBorder.none))),
                      IconButton(
                        icon: _posting ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send, color: AppTheme.primaryColor),
                        onPressed: _posting ? null : _submitPost,
                      ),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  for (final p in _posts)
                    _PostCard(
                      post: p,
                      onLike: () => _toggleLike(p["id"]),
                      onOpen: () => context.push("/community/post/${p["id"]}").then((_) => _load()),
                    ),
                ],
              ),
            ),
    );
  }
}

class _PostCard extends StatelessWidget {
  final Map<String, dynamic> post;
  final VoidCallback onLike;
  final VoidCallback onOpen;

  const _PostCard({required this.post, required this.onLike, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final isPending = post["status"] == "pending_review";
    return GestureDetector(
      onTap: onOpen,
      child: Container(
        padding: const EdgeInsets.all(13),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(backgroundColor: AppTheme.primaryColor, child: Text(((post["first_name"] as String?) ?? "A")[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text("${post["first_name"] ?? ""} ${post["last_name"] ?? ""}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
              Text((post["role"] ?? "").toString().replaceAll("_", " "), style: const TextStyle(fontSize: 10, color: Colors.grey)),
            ])),
          ]),
          const SizedBox(height: 8),
          if (isPending)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFFFF4D9), borderRadius: BorderRadius.circular(8)),
              child: const Text("Under Review — only you can see this", style: TextStyle(fontSize: 9.5, color: Color(0xFF7A5B00), fontWeight: FontWeight.bold)),
            ),
          Text(post["content"] ?? "", style: const TextStyle(fontSize: 12.5)),
          const SizedBox(height: 10),
          Row(children: [
            InkWell(onTap: onLike, child: Row(children: [
              Icon((post["liked_by_me"] == true) ? Icons.thumb_up : Icons.thumb_up_outlined, size: 15, color: AppTheme.primaryColor),
              const SizedBox(width: 4),
              Text("${post["like_count"] ?? 0}", style: const TextStyle(fontSize: 11.5)),
            ])),
            const SizedBox(width: 16),
            Row(children: [
              const Icon(Icons.chat_bubble_outline, size: 15, color: Colors.grey),
              const SizedBox(width: 4),
              Text("${post["comment_count"] ?? 0}", style: const TextStyle(fontSize: 11.5)),
            ]),
          ]),
        ]),
      ),
    );
  }
}
