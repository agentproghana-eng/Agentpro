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

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ApiClient.instance.post("/agent-posts/${widget.postId}/comments", data: {"content": text});
      _commentCtrl.clear();
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Subscription required to comment"), backgroundColor: AppTheme.errorColor));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
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
                            Text(_post!["content"] ?? "", style: const TextStyle(fontSize: 13)),
                          ]),
                        ),
                        const SizedBox(height: 16),
                        Text("Comments", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 8),
                        for (final c in _comments)
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 8),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text("${c["first_name"] ?? ""} ${c["last_name"] ?? ""}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11.5)),
                              const SizedBox(height: 3),
                              Text(c["content"] ?? "", style: const TextStyle(fontSize: 12)),
                            ]),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 4)]),
                    child: Row(children: [
                      Expanded(child: TextField(controller: _commentCtrl, decoration: const InputDecoration(hintText: "Write a comment...", border: OutlineInputBorder()))),
                      IconButton(
                        icon: _sending ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send, color: AppTheme.primaryColor),
                        onPressed: _sending ? null : _sendComment,
                      ),
                    ]),
                  ),
                ]),
    );
  }
}
