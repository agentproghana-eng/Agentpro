import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class AIAssistantScreen extends StatefulWidget {
  final bool isPersonal;

  const AIAssistantScreen({
    super.key,
    required this.isPersonal,
  });
  @override
  State<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends State<AIAssistantScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_ChatMessage> _messages = [];
  String? _conversationId;
  String? _supportMode;
  bool _loading = false;

  final _suggestions = [
    'Check my recent transactions',
    'Is my subscription active?',
    'Why is my Business Hub ad not showing?',
    'Is AgentPro working normally?',
    'How do I use AgentPro?',
  ];

  @override
  void initState() {
    super.initState();
    _addWelcome();
  }

  void _addWelcome() {
    _messages.add(const _ChatMessage(
      role: 'assistant',
      content: 'Akwaaba! 👋 I\'m Ask AgentPro.\n\n'
          'I can explain AgentPro and securely check read-only '
          'diagnostic information for your own account, transactions, '
          'subscription and Business Hub listings.\n\n'
          'Never share your PIN, OTP or password here.\n\n'
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
        'mode': widget.isPersonal ? 'personal' : 'business',
        if (_conversationId != null) 'conversation_id': _conversationId,
      });
      final data = res.data['data'];
      if (mounted) {
        setState(() {
          _conversationId = data['conversation_id'];
          _supportMode = data['mode']?.toString();
          _messages
              .add(_ChatMessage(role: 'assistant', content: data['message']));
          _loading = false;
        });
        _scroll();
      }
    } on DioException catch (_) {
      if (mounted) {
        setState(() {
          _messages.add(const _ChatMessage(
            role: 'assistant',
            content:
                'Sorry, I\'m having trouble connecting right now. Please try again.',
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
        title: Row(children: [
          const CircleAvatar(
            backgroundColor: Colors.white,
            radius: 16,
            child:
                Icon(Icons.smart_toy, color: AppTheme.primaryColor, size: 18),
          ),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Ask AgentPro', style: TextStyle(fontSize: 15)),
            Text(
              _supportMode == 'full'
                  ? 'Live diagnostics'
                  : _supportMode == 'basic'
                      ? 'Basic support'
                      : 'Automatic support',
              style: const TextStyle(
                fontSize: 10,
                color: Colors.white70,
              ),
            ),
          ]),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(() {
              _messages.clear();
              _conversationId = null;
              _supportMode = null;
              _addWelcome();
            }),
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
                  label: Text(_suggestions[i],
                      style: const TextStyle(fontSize: 12)),
                  onPressed: () => _send(_suggestions[i]),
                  backgroundColor:
                      AppTheme.primaryColor.withValues(alpha: 0.08),
                  side: BorderSide(
                      color: AppTheme.primaryColor.withValues(alpha: 0.3)),
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
                      hintText: 'Ask AgentPro...',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24)),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
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
  void dispose() {
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }
}

class _ChatMessage {
  final String role, content;
  final bool isError;
  const _ChatMessage(
      {required this.role, required this.content, this.isError = false});
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;
  const _MessageBubble({required this.message});

  static final RegExp _assistantMarkdownPattern = RegExp(
    r'(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)',
  );

  List<InlineSpan> _assistantSpans(String text) {
    final spans = <InlineSpan>[];
    var cursor = 0;

    for (final match in _assistantMarkdownPattern.allMatches(text)) {
      if (match.start > cursor) {
        spans.add(
          TextSpan(
            text: text.substring(cursor, match.start),
          ),
        );
      }

      final token = match.group(0) ?? '';

      if (token.startsWith('**') &&
          token.endsWith('**') &&
          token.length >= 4) {
        spans.add(
          TextSpan(
            text: token.substring(2, token.length - 2),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
            ),
          ),
        );
      } else if (token.length >= 2) {
        spans.add(
          TextSpan(
            text: token.substring(1, token.length - 1),
            style: const TextStyle(
              fontStyle: FontStyle.italic,
            ),
          ),
        );
      }

      cursor = match.end;
    }

    if (cursor < text.length) {
      spans.add(
        TextSpan(
          text: text.substring(cursor),
        ),
      );
    }

    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final messageStyle = TextStyle(
      color: isUser
          ? Colors.white
          : message.isError
              ? AppTheme.errorColor
              : context.appPrimaryText,
      fontSize: 14,
      height: 1.4,
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.1),
              child: const Icon(Icons.smart_toy,
                  color: AppTheme.primaryColor, size: 16),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isUser
                    ? AppTheme.primaryColor
                    : message.isError
                        ? AppTheme.errorColor.withValues(alpha: 0.1)
                        : context.appSurface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
              ),
              child: isUser
                  ? Text(
                      message.content,
                      style: messageStyle,
                    )
                  : Text.rich(
                      TextSpan(
                        style: messageStyle,
                        children: _assistantSpans(
                          message.content,
                        ),
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

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 600))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      CircleAvatar(
          radius: 16,
          backgroundColor: AppTheme.primaryColor.withValues(alpha: 0.1),
          child: const Icon(Icons.smart_toy,
              color: AppTheme.primaryColor, size: 16)),
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
            color: context.appSurface, borderRadius: BorderRadius.circular(16)),
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) => Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(
                  3,
                  (i) => Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppTheme.primaryColor.withValues(
                              alpha: 0.3 + (i == 1 ? _ctrl.value * 0.7 : 0)),
                        ),
                      ))),
        ),
      ),
    ]);
  }
}
