import "dart:async";
import "package:flutter/material.dart";
import "package:share_plus/share_plus.dart";
import "package:go_router/go_router.dart";
import "package:dio/dio.dart";
import "package:record/record.dart";
import "package:audioplayers/audioplayers.dart";
import "package:path_provider/path_provider.dart";
import "../../core/api/api_client.dart";
import "../../shared/theme/app_theme.dart";

// NOTE: record/audioplayers are new dependencies added specifically for
// this feature - unlike everything else touched tonight, there is no
// way to verify their exact API surface or that they even resolve
// without a real `flutter pub get` + build (Termux has no Flutter
// installed). Test this carefully on a real build before trusting it.
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

  final _recorder = AudioRecorder();
  bool _isRecording = false;
  bool _hasRecording = false;
  String? _recordedPath;
  Timer? _recordTimer;
  int _recordSeconds = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    _recorder.dispose();
    super.dispose();
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

  Future<void> _startRecording() async {
    if (!await _recorder.hasPermission()) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Microphone permission is required to record a voice note")));
      return;
    }
    final dir = await getTemporaryDirectory();
    final path = "${dir.path}/voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a";
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
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

  Future<void> _submitPost() async {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty && !_hasRecording) return;

    setState(() => _posting = true);
    try {
      final formData = FormData.fromMap({
        if (text.isNotEmpty) "content": text,
        if (_hasRecording && _recordedPath != null)
          "audio": await MultipartFile.fromFile(_recordedPath!, filename: "voice_note.m4a"),
      });
      final res = await ApiClient.instance.post("/agent-posts", data: formData);
      _composerCtrl.clear();
      _discardRecording();
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

  String _formatSeconds(int s) => "${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}";

  Widget _buildComposer() {
    if (_isRecording) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
        child: Row(children: [
          const Icon(Icons.fiber_manual_record, color: Colors.red, size: 14),
          const SizedBox(width: 8),
          Text("Recording... ${_formatSeconds(_recordSeconds)}", style: const TextStyle(fontSize: 12)),
          const Spacer(),
          IconButton(icon: const Icon(Icons.stop_circle, color: AppTheme.errorColor), onPressed: _stopRecording),
        ]),
      );
    }

    if (_hasRecording) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
        child: Row(children: [
          const Icon(Icons.mic, color: AppTheme.primaryColor, size: 18),
          const SizedBox(width: 8),
          Text("Voice note ready (${_formatSeconds(_recordSeconds)})", style: const TextStyle(fontSize: 12)),
          const Spacer(),
          IconButton(icon: const Icon(Icons.close, color: Colors.grey), onPressed: _discardRecording),
          IconButton(
            icon: _posting ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send, color: AppTheme.primaryColor),
            onPressed: _posting ? null : _submitPost,
          ),
        ]),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)]),
      child: Row(children: [
        Expanded(child: TextField(controller: _composerCtrl, decoration: const InputDecoration(hintText: "Share something with the community...", border: InputBorder.none))),
        IconButton(icon: const Icon(Icons.mic_none, color: AppTheme.primaryColor), onPressed: _startRecording),
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
      appBar: AppBar(title: const Text("Agent Community")),
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
    final audioUrl = post["audio_url"] as String?;
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
          if (post["content"] != null && (post["content"] as String).isNotEmpty)
            Text(post["content"], style: const TextStyle(fontSize: 12.5)),
          if (audioUrl != null) ...[
            if (post["content"] != null && (post["content"] as String).isNotEmpty) const SizedBox(height: 8),
            _AudioPlayerBubble(url: audioUrl),
          ],
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
            const SizedBox(width: 16),
            InkWell(
              onTap: () => Share.share("${post["content"] ?? "Voice note"}"),
              child: const Icon(Icons.share_outlined, size: 15, color: Colors.grey),
            ),
          ]),
        ]),
      ),
    );
  }
}

// Minimal inline player: play/pause toggle + elapsed/duration text.
// Deliberately simple (no waveform, no seek bar) given the acknowledged
// risk around this whole dependency - a smaller API surface used here
// means less that can be wrong.
class _AudioPlayerBubble extends StatefulWidget {
  final String url;
  const _AudioPlayerBubble({required this.url});

  @override
  State<_AudioPlayerBubble> createState() => _AudioPlayerBubbleState();
}

class _AudioPlayerBubbleState extends State<_AudioPlayerBubble> {
  final _player = AudioPlayer();
  bool _isPlaying = false;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;
  StreamSubscription? _durationSub;
  StreamSubscription? _positionSub;
  StreamSubscription? _completeSub;

  @override
  void initState() {
    super.initState();
    _durationSub = _player.onDurationChanged.listen((d) {
      if (mounted) setState(() => _duration = d);
    });
    _positionSub = _player.onPositionChanged.listen((p) {
      if (mounted) setState(() => _position = p);
    });
    _completeSub = _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() { _isPlaying = false; _position = Duration.zero; });
    });
  }

  Future<void> _toggle() async {
    if (_isPlaying) {
      await _player.pause();
      setState(() => _isPlaying = false);
    } else {
      await _player.play(UrlSource(widget.url));
      setState(() => _isPlaying = true);
    }
  }

  String _fmt(Duration d) => "${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}";

  @override
  void dispose() {
    _durationSub?.cancel();
    _positionSub?.cancel();
    _completeSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: AppTheme.primaryColor.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        IconButton(
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
          icon: Icon(_isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled, color: AppTheme.primaryColor, size: 28),
          onPressed: _toggle,
        ),
        const SizedBox(width: 8),
        Text(
          _duration == Duration.zero ? "Voice note" : "${_fmt(_position)} / ${_fmt(_duration)}",
          style: const TextStyle(fontSize: 11, color: AppTheme.primaryColor),
        ),
      ]),
    );
  }
}
