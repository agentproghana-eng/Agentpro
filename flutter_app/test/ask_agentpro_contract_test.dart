import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final assistant = File(
    'lib/features/ai_assistant/ai_assistant_screen.dart',
  ).readAsStringSync();

  final support = File(
    'lib/features/support/support_screen.dart',
  ).readAsStringSync();

  test('Support exposes Ask AgentPro', () {
    expect(
      support,
      contains("'Ask AgentPro'"),
    );

    expect(
      support,
      contains(
        'securely diagnose your AgentPro issues',
      ),
    );

    expect(
      support,
      isNot(contains("'AI Assistant'")),
    );
  });

  test('Ask AgentPro UI has no stale provider branding', () {
    expect(
      assistant,
      contains("Text('Ask AgentPro'"),
    );

    expect(
      assistant,
      contains('Never share your PIN, OTP or password here.'),
    );

    expect(
      assistant,
      contains("hintText: 'Ask AgentPro...'"),
    );

    expect(
      assistant,
      isNot(contains('Powered by Claude')),
    );
  });

  test('Ask AgentPro exposes diagnostic-oriented suggestions', () {
    expect(
      assistant,
      contains('Check my recent transactions'),
    );

    expect(
      assistant,
      contains('Is my subscription active?'),
    );

    expect(
      assistant,
      contains('Is AgentPro working normally?'),
    );
  });

  test('Ask AgentPro preserves Personal or Business mode', () {
    final router = File(
      'lib/core/router/app_router.dart',
    ).readAsStringSync();

    expect(
      support,
      contains("'/ai?mode=personal'"),
    );

    expect(
      support,
      contains("'/ai?mode=business'"),
    );

    expect(
      router,
      contains("path: '/ai'"),
    );

    expect(
      router,
      contains(
        "state.uri.queryParameters['mode'] == 'personal'",
      ),
    );

    expect(
      assistant,
      contains(
        "'mode': widget.isPersonal ? 'personal' : 'business'",
      ),
    );
  });


  test('Ask AgentPro displays automatic Basic or Full mode', () {
    expect(
      assistant,
      contains('Automatic support'),
    );

    expect(
      assistant,
      contains('Basic support'),
    );

    expect(
      assistant,
      contains('Live diagnostics'),
    );

    expect(
      assistant,
      contains("_supportMode = data['mode']?.toString()"),
    );
  });

}
