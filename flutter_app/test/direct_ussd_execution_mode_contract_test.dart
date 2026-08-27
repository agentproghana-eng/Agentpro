import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('Flow Builder exposes explicit Direct and Interactive modes', () {
    final editor = source(
      'lib/features/ussd_flows/ussd_flow_editor_screen.dart',
    );

    expect(editor, contains("String _executionMode = 'interactive'"));
    expect(editor, contains("'Direct USSD String'"));
    expect(editor, contains("'Interactive Flow'"));
    expect(editor, contains("'execution_mode': _executionMode"));
    expect(
      editor,
      contains("_executionMode == 'direct'"),
    );
    expect(editor, contains('*138*1*2*1*1#'));
  });

  test('Direct mode is zero-step and Interactive remains step-based', () {
    final validation = source(
      'lib/features/ussd_flows/ussd_flow_draft_validation.dart',
    );

    expect(
      validation,
      contains(
        "normalizedExecutionMode == 'direct'",
      ),
    );
    expect(
      validation,
      contains(
        'Direct USSD String must not contain interactive steps.',
      ),
    );
    expect(
      validation,
      contains('At least one step is required.'),
    );
  });

  test('resolved Direct flow uses one-dispatch USSDEngine', () {
    final progress = source(
      'lib/features/transactions/transaction_progress_screen.dart',
    );

    expect(
      progress,
      contains("if (executionMode == 'direct')"),
    );
    expect(
      progress,
      contains('_startDirectUssdAutomation('),
    );
    expect(
      progress,
      contains('final template = USSDTemplate('),
    );
    expect(
      progress,
      contains('_engine = USSDEngine('),
    );
    expect(
      progress,
      contains('final result = await _engine!.execute();'),
    );
  });

  test('USSD Automation no longer duplicates Quick Action customization', () {
    final settings = source(
      'lib/features/ussd_settings/ussd_settings_screen.dart',
    );

    expect(settings, contains("'Create USSD Automation'"));
    expect(settings, contains("'Create Automation'"));
    expect(
      settings,
      contains('Direct USSD String'),
    );
    expect(
      settings,
      contains('Interactive Flow'),
    );
    expect(
      settings,
      isNot(contains('Customize Quick Actions')),
    );
    expect(
      settings,
      isNot(contains('Personal USSD Flows')),
    );
    expect(
      settings,
      isNot(contains('Manage Custom USSD Flows')),
    );
  });

  test('flow list makes execution mode visible', () {
    final list = source(
      'lib/features/ussd_flows/ussd_flow_list_screen.dart',
    );

    expect(list, contains("'Direct String'"));
    expect(list, contains("'Interactive'"));
    expect(list, contains('_executionModeLabel(flow)'));
  });
}
