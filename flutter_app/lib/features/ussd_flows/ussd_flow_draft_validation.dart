const int kMaxUssdDialCodeLength = 30;
const int kMaxUssdMarkersPerOutcome = 50;
const int kMaxUssdMarkerLength = 200;

String? validateUssdFlowDraftMetadata({
  required String dialCode,
  required List<String> successMarkers,
  required List<String> failureMarkers,
}) {
  final normalizedDialCode = dialCode.trim();

  if (normalizedDialCode.isEmpty) {
    return 'Dial code is required.';
  }

  if (normalizedDialCode.length > kMaxUssdDialCodeLength) {
    return 'Dial code cannot exceed $kMaxUssdDialCodeLength characters.';
  }

  if (!RegExp(r'^[*#][0-9*#]*#$').hasMatch(normalizedDialCode) ||
      !RegExp(r'[0-9]').hasMatch(normalizedDialCode)) {
    return 'Dial code must be a USSD/MMI code such as *170# or *123*1#.';
  }

  final successError = _validateMarkerList(
    successMarkers,
    'Success markers',
  );

  if (successError != null) {
    return successError;
  }

  final failureError = _validateMarkerList(
    failureMarkers,
    'Failure markers',
  );

  if (failureError != null) {
    return failureError;
  }

  final success =
      successMarkers.map((marker) => marker.trim().toLowerCase()).toSet();

  for (final rawMarker in failureMarkers) {
    final marker = rawMarker.trim().toLowerCase();

    if (success.contains(marker)) {
      return 'Marker "$marker" cannot be both a success and failure marker.';
    }
  }

  return null;
}

String? _validateMarkerList(
  List<String> markers,
  String label,
) {
  if (markers.length > kMaxUssdMarkersPerOutcome) {
    return '$label cannot contain more than '
        '$kMaxUssdMarkersPerOutcome entries.';
  }

  final seen = <String>{};

  for (var i = 0; i < markers.length; i++) {
    final marker = markers[i].trim();

    if (marker.isEmpty) {
      return '$label entry ${i + 1} cannot be blank.';
    }

    if (marker.length > kMaxUssdMarkerLength) {
      return '$label entry ${i + 1} cannot exceed '
          '$kMaxUssdMarkerLength characters.';
    }

    final normalized = marker.toLowerCase();

    if (!seen.add(normalized)) {
      return '$label contains duplicate marker "$normalized".';
    }
  }

  return null;
}

const List<String> kValidUssdFlowActions = [
  'send_digit',
  'send_customer_phone',
  'send_amount',
  'send_operator_id',
  'send_reference',
  'send_merchant_id',
  'send_selection',
  'send_literal',
  'pin_prompt',
  'auto_confirm_once',
];

const Set<String> kValueRequiredUssdFlowActions = {
  'send_digit',
  'send_literal',
  'auto_confirm_once',
};

String? validateUssdFlowDraftSteps(
  List<Map<String, dynamic>> steps,
) {
  if (steps.isEmpty) {
    return 'At least one step is required.';
  }

  for (var i = 0; i < steps.length; i++) {
    final step = steps[i];

    final rawMatchers = step['match_all'];

    if (rawMatchers is! List || rawMatchers.isEmpty) {
      return 'Step ${i + 1}: screen match text cannot be empty.';
    }

    final hasUnsafeMatcher = rawMatchers.any(
      (marker) => marker is! String || marker.trim().isEmpty,
    );

    if (hasUnsafeMatcher) {
      return 'Step ${i + 1}: every screen match entry must contain text.';
    }

    final action = step['action']?.toString() ?? '';

    if (!kValidUssdFlowActions.contains(action)) {
      return 'Step ${i + 1}: "$action" is not a valid action.';
    }

    final actionValue = step['action_value']?.toString().trim() ?? '';

    if (action == 'auto_confirm_once' &&
        !RegExp(r'^[0-9]$').hasMatch(actionValue)) {
      return 'Step ${i + 1}: Auto-Confirm Once must be exactly one '
          'numeric menu digit.';
    }

    if (kValueRequiredUssdFlowActions.contains(action) && actionValue.isEmpty) {
      return 'Step ${i + 1}: ${_actionLabel(action)} requires a value.';
    }
  }

  final pinPromptIndexes = <int>[];

  for (var i = 0; i < steps.length; i++) {
    if (steps[i]['action'] == 'pin_prompt') {
      pinPromptIndexes.add(i);
    }
  }

  if (pinPromptIndexes.isEmpty) {
    return 'Add exactly one PIN Prompt step so AgentPro stops automation '
        'for secure PIN entry.';
  }

  if (pinPromptIndexes.length > 1) {
    return 'Only one PIN Prompt step is allowed per flow.';
  }

  final pinPromptIndex = pinPromptIndexes.single;

  final autoConfirmIndexes = <int>[];

  for (var i = 0; i < steps.length; i++) {
    if (steps[i]['action'] == 'auto_confirm_once') {
      autoConfirmIndexes.add(i);
    }
  }

  if (autoConfirmIndexes.length > 1) {
    return 'Only one Auto-Confirm Once step is allowed per flow.';
  }

  if (autoConfirmIndexes.isNotEmpty &&
      autoConfirmIndexes.single <= pinPromptIndex) {
    return 'Step ${autoConfirmIndexes.single + 1}: Auto-Confirm Once '
        'must be placed after the PIN Prompt step.';
  }

  for (var i = pinPromptIndex + 1; i < steps.length; i++) {
    if (steps[i]['action'] != 'auto_confirm_once') {
      return 'Step ${i + 1}: only Auto-Confirm Once may appear after '
          'the PIN Prompt step.';
    }
  }

  return null;
}

String _actionLabel(String action) {
  return switch (action) {
    'send_digit' => 'Send Digit',
    'send_literal' => 'Send Literal Text',
    'auto_confirm_once' => 'Auto-Confirm Once',
    _ => action,
  };
}
