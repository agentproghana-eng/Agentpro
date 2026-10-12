import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'audio_player_bubble.dart';
import 'reaction_button.dart';

/// Shared building blocks for the Agent Community and the Personal
/// Community, so both look and behave the same.

const List<String> _kMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// Short, unambiguous time: "Just now", "5m", "3h", "2d", "7 Aug",
/// and "7 Aug 2025" once it is from a previous year.
String formatCommunityTime(String? value, {DateTime? now}) {
  if (value == null) return '';

  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) return '';

  final current = now ?? DateTime.now();
  final difference = current.difference(date);

  if (difference.inMinutes < 1) return 'Just now';
  if (difference.inMinutes < 60) return '${difference.inMinutes}m';
  if (difference.inHours < 24) return '${difference.inHours}h';
  if (difference.inDays < 7) return '${difference.inDays}d';

  final base = '${date.day} ${_kMonths[date.month - 1]}';
  return date.year == current.year ? base : '$base ${date.year}';
}

/// "business_owner" -> "Business owner".
String communityRoleLabel(String? role) {
  final cleaned = (role ?? '').replaceAll('_', ' ').trim();
  if (cleaned.isEmpty) return '';
  return cleaned[0].toUpperCase() + cleaned.substring(1);
}

/// A truthful message for a failed community action. The server's own
/// message is used when it sent one; a missing connection is reported as
/// such, and only a real 402/403 is described as a plan restriction.
String communityActionError(
  Object error, {
  required String fallback,
  String restrictedMessage = 'Your plan does not allow this action.',
}) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    final data = error.response?.data;

    if (data is Map && data['message'] != null) {
      final message = data['message'].toString().trim();
      if (message.isNotEmpty) return message;
    }

    if (status == 402 || status == 403) return restrictedMessage;

    if (error.response == null) {
      return 'No connection. Check your internet and try again.';
    }
  }

  return fallback;
}

/// Slim "write a post" bar shown above the feed. Tapping it (or the mic)
/// opens the full composer.
class CommunityComposerBar extends StatelessWidget {
  final String initial;
  final String hint;
  final VoidCallback onTap;
  final VoidCallback? onMic;

  const CommunityComposerBar({
    super.key,
    required this.initial,
    required this.hint,
    required this.onTap,
    this.onMic,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.appSurface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: context.appSecondaryText.withValues(alpha: 0.14),
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppTheme.primaryColor,
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(
                      color: context.appSecondaryText.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Text(
                    hint,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: context.appSecondaryText,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
              if (onMic != null)
                IconButton(
                  tooltip: 'Record voice note',
                  onPressed: onMic,
                  icon: const Icon(
                    Icons.mic_none,
                    color: AppTheme.primaryColor,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Container used by the expanded composer, recording and review rows.
class CommunityComposerPanel extends StatelessWidget {
  final Widget child;

  const CommunityComposerPanel({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.35),
        ),
      ),
      child: child,
    );
  }
}

class CommunityPostBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;

  const CommunityPostBadge({
    super.key,
    required this.icon,
    required this.label,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final tint = color ?? AppTheme.primaryColor;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: context.isDarkMode ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: tint),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: tint,
            ),
          ),
        ],
      ),
    );
  }
}

/// One post, used by both communities.
class CommunityPostCard extends StatefulWidget {
  final Map<String, dynamic> post;
  final void Function(String reactionType) onReact;
  final VoidCallback onOpen;
  final VoidCallback? onActions;

  /// Agent Community shows the member's role and the post type; the
  /// Personal Community has neither.
  final bool showTypeAndRole;

  const CommunityPostCard({
    super.key,
    required this.post,
    required this.onReact,
    required this.onOpen,
    this.onActions,
    this.showTypeAndRole = false,
  });

  @override
  State<CommunityPostCard> createState() => _CommunityPostCardState();
}

class _CommunityPostCardState extends State<CommunityPostCard> {
  static const int _collapsedLines = 6;
  static const int _longPostCharacters = 260;

  bool _expanded = false;

  String _typeLabel(String? type) {
    return switch (type) {
      'question' => 'Question',
      'network_issue' => 'Network issue',
      'fraud_alert' => 'Fraud alert',
      'business_tip' => 'Business tip',
      'announcement' => 'Announcement',
      _ => 'General',
    };
  }

  IconData _typeIcon(String? type) {
    return switch (type) {
      'question' => Icons.help_outline,
      'network_issue' => Icons.signal_wifi_bad,
      'fraud_alert' => Icons.warning_amber_rounded,
      'business_tip' => Icons.lightbulb_outline,
      'announcement' => Icons.campaign_outlined,
      _ => Icons.forum_outlined,
    };
  }

  int _reactionTotal() {
    final counts = widget.post['reaction_counts'];
    if (counts is! Map) return 0;

    return counts.values.fold<int>(
      0,
      (sum, value) => sum + (int.tryParse(value.toString()) ?? 0),
    );
  }

  Future<void> _share(String content) {
    return SharePlus.instance.share(
      ShareParams(
        text: content.isNotEmpty ? content : 'Voice note from AgentPro',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    final type = post['post_type']?.toString();
    final content = post['content']?.toString().trim() ?? '';
    final audioUrl = post['audio_url']?.toString();
    final isPending = post['status'] == 'pending_review';
    final isAlert = widget.showTypeAndRole &&
        (type == 'fraud_alert' || post['is_urgent'] == true);

    final firstName = post['first_name']?.toString().trim() ?? '';
    final name = '$firstName ${post['last_name'] ?? ''}'.trim();
    final initial = firstName.isNotEmpty ? firstName[0].toUpperCase() : 'A';
    final time = formatCommunityTime(post['created_at']?.toString());
    final role =
        widget.showTypeAndRole ? communityRoleLabel(post['role']?.toString()) : '';

    final isLong = content.length > _longPostCharacters ||
        '\n'.allMatches(content).length >= _collapsedLines;

    final border = isAlert
        ? AppTheme.errorColor.withValues(alpha: 0.55)
        : context.appSecondaryText.withValues(alpha: 0.10);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isAlert
            ? Color.alphaBlend(
                AppTheme.errorColor.withValues(alpha: 0.07),
                context.appSurface,
              )
            : context.appSurface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onOpen,
        onLongPress: widget.onActions,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppTheme.primaryColor,
                    child: Text(
                      initial,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: name.isEmpty ? 'Member' : name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              if (time.isNotEmpty)
                                TextSpan(
                                  text: '  ·  $time',
                                  style: TextStyle(
                                    color: context.appSecondaryText,
                                    fontSize: 13,
                                  ),
                                ),
                            ],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (role.isNotEmpty)
                          Text(
                            role,
                            style: TextStyle(
                              fontSize: 12.5,
                              color: context.appSecondaryText,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (widget.onActions != null)
                    IconButton(
                      tooltip: 'Post actions',
                      onPressed: widget.onActions,
                      icon: const Icon(Icons.more_horiz),
                    ),
                ],
              ),
              if (widget.showTypeAndRole ||
                  isPending ||
                  post['is_pinned'] == true ||
                  post['is_official'] == true ||
                  post['is_saved'] == true) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (widget.showTypeAndRole)
                      CommunityPostBadge(
                        icon: _typeIcon(type),
                        label: _typeLabel(type),
                        color: isAlert ? AppTheme.errorColor : null,
                      ),
                    if (post['is_pinned'] == true)
                      const CommunityPostBadge(
                        icon: Icons.push_pin_outlined,
                        label: 'Pinned',
                      ),
                    if (post['is_official'] == true)
                      const CommunityPostBadge(
                        icon: Icons.verified_outlined,
                        label: 'Official',
                      ),
                    if (post['is_saved'] == true)
                      const CommunityPostBadge(
                        icon: Icons.bookmark,
                        label: 'Saved',
                      ),
                    if (isPending)
                      CommunityPostBadge(
                        icon: Icons.hourglass_top,
                        label: 'Under review · only you can see this',
                        color: AppTheme.warningColor,
                      ),
                  ],
                ),
              ],
              if (content.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  content,
                  maxLines: _expanded || !isLong ? null : _collapsedLines,
                  overflow: _expanded || !isLong
                      ? TextOverflow.visible
                      : TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, height: 1.5),
                ),
                if (isLong)
                  InkWell(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        _expanded ? 'Show less' : 'Read more',
                        style: const TextStyle(
                          color: AppTheme.primaryColor,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
              ],
              if (audioUrl != null && audioUrl.isNotEmpty) ...[
                const SizedBox(height: 10),
                AudioPlayerBubble(url: audioUrl),
              ],
              const SizedBox(height: 8),
              Divider(
                height: 1,
                color: context.appSecondaryText.withValues(alpha: 0.12),
              ),
              Row(
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Center(
                        child: ReactionButton(
                          myReaction: post['my_reaction']?.toString(),
                          totalCount: _reactionTotal(),
                          onReact: widget.onReact,
                          iconSize: 22,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: InkWell(
                      onTap: widget.onOpen,
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline,
                              size: 21,
                              color: context.appSecondaryText,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '${post['comment_count'] ?? 0} Comment',
                              style: TextStyle(
                                fontSize: 13.5,
                                color: context.appSecondaryText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: InkWell(
                      onTap: () => _share(content),
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.share_outlined,
                              size: 21,
                              color: context.appSecondaryText,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Share',
                              style: TextStyle(
                                fontSize: 13.5,
                                color: context.appSecondaryText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Placeholder cards shown while the first page loads.
class CommunitySkeletonList extends StatelessWidget {
  final int count;

  const CommunitySkeletonList({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    final block = context.appSecondaryText.withValues(alpha: 0.12);

    Widget bar(double width, double height) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: block,
            borderRadius: BorderRadius.circular(6),
          ),
        );

    return Column(
      children: [
        for (var i = 0; i < count; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: block,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [bar(120, 12), const SizedBox(height: 6), bar(70, 10)],
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                bar(double.infinity, 12),
                const SizedBox(height: 8),
                bar(220, 12),
              ],
            ),
          ),
      ],
    );
  }
}

/// Friendly empty / error state with an optional action.
class CommunityStateCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const CommunityStateCard({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 28, 22, 24),
      decoration: BoxDecoration(
        color: context.appSurface,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.primaryColor.withValues(alpha: 0.12),
            ),
            child: Icon(icon, size: 30, color: AppTheme.primaryColor),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.appSecondaryText,
              fontSize: 13.5,
              height: 1.45,
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
