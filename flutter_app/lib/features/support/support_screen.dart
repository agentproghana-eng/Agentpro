import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/app_constants.dart';
import '../../shared/theme/app_colors.dart';
import '../../shared/theme/app_theme.dart';

class SupportScreen extends StatelessWidget {
  final bool isPersonal;

  const SupportScreen({
    super.key,
    this.isPersonal = false,
  });

  Map<String, String> get _networkNumbers => isPersonal
      ? AppConstants.personalProviderSupportNumbers
      : AppConstants.agentProviderSupportNumbers;

  String _providerLabel(String provider) => switch (provider) {
        'mtn' => 'MTN',
        'telecel' => 'Telecel',
        'at_money' => 'AT Money',
        _ => provider,
      };

  Future<void> _launch(
    BuildContext context,
    Uri uri, {
    LaunchMode mode = LaunchMode.platformDefault,
    required String fallbackMessage,
  }) async {
    bool launched = false;

    try {
      launched = await launchUrl(uri, mode: mode);
    } catch (_) {
      launched = false;
    }

    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(fallbackMessage)),
      );
    }
  }

  Future<void> _call(
    BuildContext context,
    String number,
  ) async {
    await _launch(
      context,
      Uri(scheme: 'tel', path: number),
      fallbackMessage: 'Please call $number from your phone.',
    );
  }

  Future<void> _email(
    BuildContext context,
    String address,
  ) async {
    await _launch(
      context,
      Uri(
        scheme: 'mailto',
        path: address,
        queryParameters: {
          'subject': 'Agent Pro Ghana Support',
        },
      ),
      fallbackMessage: 'Please email us at $address.',
    );
  }

  Future<void> _whatsapp(
    BuildContext context,
    String number,
  ) async {
    await _launch(
      context,
      Uri.parse('https://wa.me/$number'),
      mode: LaunchMode.externalApplication,
      fallbackMessage:
          'WhatsApp could not be opened. Please contact ${AppConstants.supportPhone}.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final modeLabel = isPersonal ? 'Personal' : 'Agent';

    return Scaffold(
      appBar: AppBar(title: const Text('Support')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          InkWell(
            onTap: () => context.push('/ai'),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [
                    AppTheme.primaryColor,
                    Color(0xFF004D43),
                  ],
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.smart_toy_outlined,
                    color: Colors.white,
                    size: 26,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'AI Assistant',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          'Ask about any feature, or get help with a transaction',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.8),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    color: Colors.white,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: () => context.push('/help-guide'),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.appSurface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: AppTheme.primaryColor.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.menu_book_outlined,
                    color: AppTheme.primaryColor,
                    size: 26,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'How to Use the App',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          'Step-by-step help for every feature — works offline',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: context.appSecondaryText,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    color: AppTheme.primaryColor,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 4,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isPersonal ? 'Call Your Network' : 'Call Your Agent Network',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                Text(
                  '$modeLabel support numbers for account or PIN issues',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.appSecondaryText,
                  ),
                ),
                const SizedBox(height: 10),
                for (final entry in _networkNumbers.entries) ...[
                  _CallRow(
                    label: _providerLabel(entry.key),
                    number: entry.value,
                    onTap: (number) => _call(context, number),
                  ),
                  if (entry.key != _networkNumbers.keys.last)
                    const Divider(height: 20),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.appSurface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 4,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'App Support',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                Text(
                  'For questions about Agent Pro Ghana itself',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.appSecondaryText,
                  ),
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () => _email(
                    context,
                    AppConstants.supportEmail,
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.mail_outline,
                        size: 18,
                        color: AppTheme.primaryColor,
                      ),
                      SizedBox(width: 8),
                      Text(
                        AppConstants.supportEmail,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () => _call(
                    context,
                    AppConstants.supportPhone,
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.call_outlined,
                        size: 18,
                        color: AppTheme.primaryColor,
                      ),
                      SizedBox(width: 8),
                      Text(
                        AppConstants.supportPhone,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () => _whatsapp(
                    context,
                    AppConstants.supportWhatsAppNumber,
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.chat_outlined,
                        size: 18,
                        color: AppTheme.primaryColor,
                      ),
                      SizedBox(width: 8),
                      Text(
                        'WhatsApp: ${AppConstants.supportPhone}',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  AppConstants.supportHours,
                  style: TextStyle(
                    fontSize: 11,
                    color: context.appSecondaryText,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  final String label;
  final String number;
  final Future<void> Function(String) onTap;

  const _CallRow({
    required this.label,
    required this.number,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onTap(number),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
          Row(
            children: [
              const Icon(
                Icons.call_outlined,
                size: 16,
                color: AppTheme.primaryColor,
              ),
              const SizedBox(width: 6),
              Text(
                'Call $number',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
