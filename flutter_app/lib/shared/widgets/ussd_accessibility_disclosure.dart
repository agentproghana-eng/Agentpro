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
          'AgentPro uses Android Accessibility only for USSD '
          'transactions you start. It reads the active USSD menu and '
          'enters the non-PIN transaction details you already '
          'provided.\n\n'
          'Your Mobile Money PIN is never read, stored, or entered by '
          'AgentPro. USSD screen content is processed only on this '
          'device during the active session and is cleared when the '
          'session ends. Only the transaction outcome is returned to '
          'AgentPro.\n\n'
          'You can turn this access off anytime in Android Settings.\n\n'
          'Tap Continue to Settings to enable USSD Automation, or '
          'Not Now to leave it off.',
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
