import 'package:flutter/material.dart';

/// Google Play prominent disclosure shown immediately before AgentPro asks
/// the user to enable Android Accessibility Service for USSD automation.
///
/// Returns true only after the user explicitly chooses Continue to Settings.
/// Back navigation, dismissal, or Not Now are never interpreted as consent.
Future<bool> showUssdAccessibilityDisclosure(
  BuildContext context,
) async {
  final consented = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      title: const Text('USSD Automation Access'),
      content: const SingleChildScrollView(
        child: Text(
          'AgentPro uses Android Accessibility Service only for a '
          'USSD automation that you start.\n\n'
          'What it accesses: text and interactive controls in the '
          'active USSD dialog. This can include network menu prompts, '
          'numbers or IDs and amounts shown by the provider, and the '
          'final transaction result.\n\n'
          'How it is used: AgentPro processes that USSD screen content '
          'on this device to recognize the current menu and enter the '
          'non-PIN transaction details you already provided. Raw USSD '
          'screen text is processed only in memory during the active '
          'session and is cleared when the session ends. It is not '
          'uploaded to AgentPro servers or used for advertising or '
          'profiling. Only the automation outcome, such as success, '
          'failure, or pending confirmation, is returned to the '
          'AgentPro transaction flow.\n\n'
          'PIN protection: AgentPro never stores or auto-enters your '
          'Mobile Money PIN. When the PIN prompt is reached, automated '
          'input stops and you enter the PIN yourself.\n\n'
          'By tapping Continue to Settings, you consent to this use of '
          'Accessibility Service. You can choose Not Now and continue '
          'without enabling USSD automation.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.of(dialogContext).pop(false);
          },
          child: const Text('Not Now'),
        ),
        TextButton(
          onPressed: () {
            Navigator.of(dialogContext).pop(true);
          },
          child: const Text('Continue to Settings'),
        ),
      ],
    ),
  );

  return consented == true;
}
