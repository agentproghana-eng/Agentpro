import 'package:flutter/material.dart';

import '../../core/services/high_amount_warning_service.dart';
import '../widgets/app_prompt_dialog.dart';

String _formatGhs(double amount) {
  final decimals = amount == amount.roundToDouble() ? 0 : 2;
  return 'GHS ${amount.toStringAsFixed(decimals)}';
}

/// Returns true when the transaction may continue.
///
/// A configured high-amount limit is a warning only. It never rejects,
/// disables, or changes the transaction. The user always owns the final
/// decision to edit the amount or continue.
Future<bool> confirmHighAmountIfNeeded(
  BuildContext context, {
  required double amount,
}) async {
  if (!amount.isFinite || amount <= 0) {
    return true;
  }

  final limit = await HighAmountWarningService.getLimit();

  if (!HighAmountWarningService.exceeds(amount: amount, limit: limit)) {
    return true;
  }

  if (!context.mounted) {
    return false;
  }

  return showAppPromptDialog(
    context,
    icon: Icons.warning_amber_rounded,
    title: 'High amount',
    message:
        'You are about to transfer ${_formatGhs(amount)}, '
        'which is above your warning limit. '
        'Would you like to continue?',
    cancelLabel: 'Edit amount',
    confirmLabel: 'Continue',
  );
}
