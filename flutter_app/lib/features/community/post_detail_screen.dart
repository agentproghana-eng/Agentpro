import "package:flutter/material.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

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

  // One level of threading only, matching the backend's design (a
  // reply itself never gets its own Reply button). null means the
  // composer is posting a top-level comment.
  String? _replyingToId;
  String? _replyingToName;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.get("/agent-posts"),
        ApiClient.instance.get("/agent-posts/${widget.postId}/comments"),
      ]);
      final allPosts = results[0].data["data"] as List;
      final match = allPosts.firstWhere((p) => p["id"] == widget.postId, orElse: () => null);
      setState(() {
        _post = match as Map<String, dynamic>?;
        _comments = results[1].data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _topLevelComments => _comments
      .where((c) => c["parent_comment_id"] == null)
      .cast<Map<String, dynamic>>()
      .toList();

  List<Map<String, dynamic>> _repliesFor(String commentId) => _comments
      .where((c) => c["parent_comment_id"] == commentId)
      .cast<Map<String, dynamic>>()
      .toList();

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
      await ApiClient.instance.post("/agent-posts/${widget.postId}/comments", data: {
        "content": text,
        if (_replyingToId != null) "parent_comment_id": _replyingToId,
      });
      _commentCtrl.clear();
      _cancelReply();
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Subscription required to comment"), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _commentTile(Map<String, dynamic> c, {bool isReply = false}) {
    final name = "${c["first_name"] ?? ""} ${c["last_name"] ?? ""}".trim();
    return Container(
      padding: const EdgeInsets.all(10),
      margin: EdgeInsets.only(bottom: 8, left: isReply ? 24 : 0),
      decoration: BoxDecoration(
        color: isReply ? Colors.grey[100] : Colors.white,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(name.isEmpty ? "—" : name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11.5)),
        const SizedBox(height: 3),
        Text(c["content"] ?? "", style: const TextStyle(fontSize: 12)),
        if (!isReply) ...[
          const SizedBox(height: 4),
          GestureDetector(
            onTap: () => _startReply(c["id"] as String, name.isEmpty ? "them" : name),
            child: const Text("Reply", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primaryColor)),
          ),
        ],
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Post")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _post == null
              ? const Center(child: Text("Post not found"))
              : Column(children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text("${_post!["first_name"] ?? ""} ${_post!["last_name"] ?? ""}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            const SizedBox(height: 6),
                            if (_post!["content"] != null && (_post!["content"] as String).isNotEmpty)
                              Text(_post!["content"], style: const TextStyle(fontSize: 13)),
                          ]),
                        ),
                        const SizedBox(height: 16),
                        const Text("Comments", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        for (final c in _topLevelComments) ...[
                          _commentTile(c),
                          for (final r in _repliesFor(c["id"] as String)) _commentTile(r, isReply: true),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 4)]),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (_replyingToId != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(children: [
                            Expanded(child: Text("Replying to $_replyingToName", style: const TextStyle(fontSize: 11, color: Colors.grey))),
                            GestureDetector(onTap: _cancelReply, child: const Icon(Icons.close, size: 16, color: Colors.grey)),
                          ]),
                        ),
                      Row(children: [
                        Expanded(child: TextField(controller: _commentCtrl, decoration: InputDecoration(hintText: _replyingToId != null ? "Write a reply..." : "Write a comment...", border: const OutlineInputBorder()))),
                        IconButton(
                          icon: _sending ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send, color: AppTheme.primaryColor),
                          onPressed: _sending ? null : _sendComment,
                        ),
                      ]),
                    ]),
                  ),
                ]),
    );
  }
}
