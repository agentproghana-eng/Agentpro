import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

class AIAssistantScreen extends StatefulWidget {
  const AIAssistantScreen({super.key});
  @override
  State<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends State<AIAssistantScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_ChatMessage> _messages = [];
  String? _conversationId;
  bool _loading = false;

  final _suggestions = [
    'How do I process a Cash In?',
    'Why did my transaction fail?',
    'How is my commission calculated?',
    'How do I renew my subscription?',
    'How do I add a new agent?',
  ];

  @override
  void initState() {
    super.initState();
    _addWelcome();
  }

  void _addWelcome() {
    _messages.add(const _ChatMessage(
      role: 'assistant',
      content: 'Akwaaba! 👋 I\'m your Agent Pro Ghana AI Assistant.\n\n'
          'I can help you with:\n'
          '• Processing Mobile Money transactions\n'
          '• Understanding your float and commissions\n'
          '• Subscription and marketplace support\n'
          '• Troubleshooting failed transactions\n\n'
          'What can I help you with today?',
    ));
  }

  Future<void> _send([String? quickMsg]) async {
    final msg = quickMsg ?? _msgCtrl.text.trim();
    if (msg.isEmpty || _loading) return;

    _msgCtrl.clear();
    setState(() {
      _messages.add(_ChatMessage(role: 'user', content: msg));
      _loading = true;
    });
    _scroll();

    try {
      final res = await ApiClient.instance.post('/ai/chat', data: {
        'message': msg,
        if (_conversationId != null) 'conversation_id': _conversationId,
      });
      final data = res.data['data'];
      if (mounted) {
        setState(() {
          _conversationId = data['conversation_id'];
          _messages.add(_ChatMessage(role: 'assistant', content: data['message']));
          _loading = false;
        });
        _scroll();
      }
    } on DioException catch (_) {
      if (mounted) {
        setState(() {
          _messages.add(const _ChatMessage(
            role: 'assistant',
            content: 'Sorry, I\'m having trouble connecting right now. Please try again.',
            isError: true,
          ));
          _loading = false;
        });
      }
    }
  }

  void _scroll() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(children: [
          CircleAvatar(
            backgroundColor: Colors.white,
            radius: 16,
            child: Icon(Icons.smart_toy, color: AppTheme.primaryColor, size: 18),
          ),
          SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('AI Assistant', style: TextStyle(fontSize: 15)),
            Text('Powered by Claude', style: TextStyle(fontSize: 10, color: Colors.white70)),
          ]),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(() { _messages.clear(); _conversationId = null; _addWelcome(); }),
            tooltip: 'New conversation',
          ),
        ],
      ),
      body: Column(
        children: [
          // Chat Messages
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length + (_loading ? 1 : 0),
              itemBuilder: (_, i) {
                if (i == _messages.length) return const _TypingIndicator();
                return _MessageBubble(message: _messages[i]);
              },
            ),
          ),

          // Quick suggestions (shown when no conversation)
          if (_messages.length == 1 && !_loading)
            Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _suggestions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ActionChip(
                  label: Text(_suggestions[i], style: const TextStyle(fontSize: 12)),
                  onPressed: () => _send(_suggestions[i]),
                  backgroundColor: AppTheme.primaryColor.withOpacity(0.08),
                  side: BorderSide(color: AppTheme.primaryColor.withOpacity(0.3)),
                ),
              ),
            ),

          const Divider(height: 1),

          // Input
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    maxLines: 3,
                    minLines: 1,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: 'Ask me anything...',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(
                  backgroundColor: AppTheme.primaryColor,
                  child: IconButton(
                    icon: const Icon(Icons.send, color: Colors.white, size: 18),
                    onPressed: _send,
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() { _msgCtrl.dispose(); _scrollCtrl.dispose(); super.dispose(); }
}

class _ChatMessage {
  final String role, content;
  final bool isError;
  const _ChatMessage({required this.role, required this.content, this.isError = false});
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;
  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
              child: const Icon(Icons.smart_toy, color: AppTheme.primaryColor, size: 16),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isUser
                    ? AppTheme.primaryColor
                    : message.isError ? AppTheme.errorColor.withOpacity(0.1) : Colors.grey[100],
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
              ),
              child: Text(
                message.content,
                style: TextStyle(
                  color: isUser ? Colors.white : message.isError ? AppTheme.errorColor : Colors.black87,
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
            ),
          ),
          if (isUser) const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();
  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  @override
  void initState() { super.initState(); _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))..repeat(reverse: true); }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      CircleAvatar(radius: 16, backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
        child: const Icon(Icons.smart_toy, color: AppTheme.primaryColor, size: 16)),
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(16)),
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) => Row(mainAxisSize: MainAxisSize.min, children: List.generate(3, (i) =>
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 2),
              width: 6, height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.primaryColor.withOpacity(0.3 + (i == 1 ? _ctrl.value * 0.7 : 0)),
              ),
            )
          )),
        ),
      ),
    ]);
  }
}
