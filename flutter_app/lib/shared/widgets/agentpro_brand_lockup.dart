import 'package:flutter/material.dart';

import '../../core/constants/app_constants.dart';
import '../theme/app_theme.dart';

/// Reusable AgentPro identity.
///
/// Brand system:
/// - Deep teal = primary identity
/// - Gold = supporting accent
/// - Shield = standalone icon
/// - AgentPro + tagline = full brand lockup
class AgentProBrandLockup extends StatelessWidget {
  const AgentProBrandLockup({
    super.key,
    this.iconSize = 92,
    this.wordmarkSize = 36,
    this.taglineSize = 14,
    this.showTagline = true,
    this.centered = true,
    this.compact = false,
    this.onDarkBackground = false,
  });

  final double iconSize;
  final double wordmarkSize;
  final double taglineSize;
  final bool showTagline;
  final bool centered;
  final bool compact;
  final bool onDarkBackground;

  @override
  Widget build(BuildContext context) {
    final alignment =
        centered ? CrossAxisAlignment.center : CrossAxisAlignment.start;

    final textAlign = centered ? TextAlign.center : TextAlign.start;

    final taglineColor = onDarkBackground
        ? Colors.white.withValues(alpha: 0.82)
        : Theme.of(context).colorScheme.onSurfaceVariant;

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: alignment,
      children: [
        Image.asset(
          'assets/images/agentpro-icon.png',
          width: iconSize,
          height: iconSize,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          isAntiAlias: true,
        ),
        SizedBox(height: compact ? 8 : 12),
        Semantics(
          label: 'AgentPro',
          header: true,
          child: ExcludeSemantics(
            child: RichText(
              textAlign: textAlign,
              text: TextSpan(
                style: TextStyle(
                  fontSize: wordmarkSize,
                  height: 1,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.35,
                ),
                children: const [
                  TextSpan(
                    text: 'Agent',
                    style: TextStyle(
                      color: AppTheme.primaryColor,
                    ),
                  ),
                  TextSpan(
                    text: 'Pro',
                    style: TextStyle(
                      color: AppTheme.secondaryColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (showTagline) ...[
          SizedBox(height: compact ? 6 : 9),
          Text(
            AppConstants.appTagline,
            textAlign: textAlign,
            maxLines: 1,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: taglineColor,
                  fontSize: taglineSize,
                  height: 1.25,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.25,
                ),
          ),
        ],
      ],
    );

    return centered ? Center(child: content) : content;
  }
}
