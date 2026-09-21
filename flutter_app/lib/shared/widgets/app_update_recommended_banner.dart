import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';

class AppUpdateRecommendedBanner extends StatefulWidget {
  const AppUpdateRecommendedBanner({
    super.key,
    required this.notice,
    required this.child,
  });

  final ClientUpdateNotice notice;
  final Widget child;

  @override
  State<AppUpdateRecommendedBanner> createState() =>
      _AppUpdateRecommendedBannerState();
}

class _AppUpdateRecommendedBannerState
    extends State<AppUpdateRecommendedBanner> {
  bool _opening = false;

  Future<void> _updateNow() async {
    if (_opening) return;

    setState(() => _opening = true);

    try {
      final uri = Uri.tryParse(widget.notice.updateUrl);

      if (uri == null) {
        return;
      }

      await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
    } finally {
      if (mounted) {
        setState(() => _opening = false);
      }
    }
  }

  Future<void> _later() async {
    await ApiClient.dismissRecommendedUpdate();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Material(
          elevation: 2,
          color: theme.colorScheme.surfaceContainerHighest,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                16,
                10,
                12,
                10,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.system_update_alt_rounded,
                    color: theme.colorScheme.primary,
                    semanticLabel: 'AgentPro update available',
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          'AgentPro update available',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          widget.notice.message,
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Recommended: '
                          '${widget.notice.recommendedVersion} '
                          '(build ${widget.notice.recommendedBuildNumber})',
                          style: theme.textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _later,
                    child: const Text('Later'),
                  ),
                  FilledButton(
                    onPressed: _opening ? null : _updateNow,
                    child: Text(
                      _opening ? 'Opening…' : 'Update',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(child: widget.child),
      ],
    );
  }
}
