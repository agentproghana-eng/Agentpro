import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';

class AppUpdateRequiredScreen extends StatefulWidget {
  final ClientCompatibilityBlock compatibility;

  const AppUpdateRequiredScreen({
    super.key,
    required this.compatibility,
  });

  @override
  State<AppUpdateRequiredScreen> createState() =>
      _AppUpdateRequiredScreenState();
}

class _AppUpdateRequiredScreenState
    extends State<AppUpdateRequiredScreen> {
  static final Uri _updateUri =
      Uri.parse('https://agentproghana.com');

  bool _openingUpdatePage = false;
  String? _launchError;

  Future<void> _openUpdatePage() async {
    if (_openingUpdatePage) {
      return;
    }

    setState(() {
      _openingUpdatePage = true;
      _launchError = null;
    });

    try {
      final launched = await launchUrl(
        _updateUri,
        mode: LaunchMode.externalApplication,
      );

      if (!launched && mounted) {
        setState(() {
          _launchError =
              'Could not open the AgentPro update page. '
              'Please update AgentPro from the same source you installed it from.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _launchError =
              'Could not open the AgentPro update page. '
              'Please update AgentPro from the same source you installed it from.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _openingUpdatePage = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final compatibility = widget.compatibility;
    final theme = Theme.of(context);

    final title = compatibility.code == 'API_INCOMPATIBLE'
        ? 'AgentPro update needed'
        : 'Update AgentPro';

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: 28,
                vertical: 36,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 460,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.system_update_rounded,
                      size: 72,
                      color: theme.colorScheme.primary,
                      semanticLabel: 'AgentPro update required',
                    ),
                    const SizedBox(height: 24),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      compatibility.message,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        height: 1.45,
                      ),
                    ),
                    if (compatibility.recommendedVersion != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Recommended version: '
                        '${compatibility.recommendedVersion}',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed:
                            _openingUpdatePage ? null : _openUpdatePage,
                        icon: _openingUpdatePage
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.open_in_new_rounded),
                        label: Text(
                          _openingUpdatePage
                              ? 'Opening...'
                              : 'Get latest AgentPro',
                        ),
                      ),
                    ),
                    if (_launchError != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        _launchError!,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Text(
                      'Your account and transaction records are not affected.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
