import "package:flutter/material.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

class PostModerationScreen extends StatefulWidget {
  const PostModerationScreen({super.key});

  @override
  State<PostModerationScreen> createState() => _PostModerationScreenState();
}

class _PostModerationScreenState extends State<PostModerationScreen> {
  List<dynamic> _pending = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get("/agent-posts/moderation/pending");
      setState(() {
        _pending = res.data["data"] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _review(String postId, String action) async {
    try {
      await ApiClient.instance.patch("/agent-posts/$postId/moderate", data: {"action": action});
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(action == "approve" ? "Approved" : "Rejected")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Failed to submit review"), backgroundColor: AppTheme.errorColor));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Pending Posts")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _pending.isEmpty
              ? const Center(child: Text("No posts awaiting review"))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _pending.length,
                    itemBuilder: (_, i) {
                      final p = _pending[i] as Map<String, dynamic>;
                      return Container(
                        padding: const EdgeInsets.all(13),
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 4)]),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text("${p["first_name"] ?? ""} ${p["last_name"] ?? ""}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(height: 6),
                          Text(p["content"] ?? "", style: const TextStyle(fontSize: 12.5)),
                          const SizedBox(height: 4),
                          Text("Flagged: ${p["flagged_reason"] ?? "N/A"}", style: const TextStyle(fontSize: 10.5, color: Colors.grey, fontStyle: FontStyle.italic)),
                          const SizedBox(height: 10),
                          Row(children: [
                            Expanded(child: OutlinedButton(onPressed: () => _review(p["id"], "reject"), child: const Text("Reject"))),
                            const SizedBox(width: 8),
                            Expanded(child: ElevatedButton(onPressed: () => _review(p["id"], "approve"), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor), child: const Text("Approve"))),
                          ]),
                        ]),
                      );
                    },
                  ),
                ),
    );
  }
}
