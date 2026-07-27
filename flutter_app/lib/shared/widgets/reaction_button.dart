import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

// The 7 reaction types, in the order they appear in the picker.
const Map<String, String> kReactionEmoji = {
  'like': '👍',
  'love': '❤️',
  'laugh': '😂',
  'wow': '😮',
  'sad': '😢',
  'pray': '🙏',
  'dislike': '👎',
};

/// A reaction button: tap to react with the default (like) or remove
/// your current reaction, long-press to pick a specific one from all
/// 7. Used on both posts and comments - onReact just needs to point
/// at the right endpoint for whichever it's attached to.
class ReactionButton extends StatelessWidget {
  final String? myReaction;
  final int totalCount;
  final void Function(String reactionType) onReact;
  final double iconSize;

  const ReactionButton({
    super.key,
    required this.myReaction,
    required this.totalCount,
    required this.onReact,
    this.iconSize = 20,
  });

  void _showPicker(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2A2A2A) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 10)],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: kReactionEmoji.entries.map((entry) => GestureDetector(
            onTap: () {
              Navigator.pop(ctx);
              onReact(entry.key);
            },
            child: Text(entry.value, style: const TextStyle(fontSize: 26)),
          )).toList(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayEmoji = myReaction != null ? kReactionEmoji[myReaction] : null;
    return GestureDetector(
      onTap: () => onReact(myReaction ?? 'like'),
      onLongPress: () => _showPicker(context),
      child: Row(children: [
        displayEmoji != null
            ? Text(displayEmoji, style: TextStyle(fontSize: iconSize))
            : Icon(Icons.thumb_up_outlined, size: iconSize, color: AppTheme.primaryColor),
        const SizedBox(width: 4),
        Text('$totalCount', style: const TextStyle(fontSize: 13)),
      ]),
    );
  }
}
