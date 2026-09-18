import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String read(String path) =>
    File(path).readAsStringSync();

void main() {
  group(
    'USSD Flow Health Monitor',
    () {
      test(
        'native mismatch exports structural position only',
        () {
          final service = read(
            'android/app/src/main/kotlin/com/agentpro/ghana/'
            'UssdAccessibilityService.kt',
          );

          final channel = read(
            'android/app/src/main/kotlin/com/agentpro/ghana/'
            'UssdAccessibilityChannel.kt',
          );

          expect(
            service,
            contains(
              'flowMismatchStepIndex',
            ),
          );

          expect(
            service,
            contains(
              'flowStepCount',
            ),
          );

          expect(
            channel,
            contains(
              'flow_mismatch_step_index',
            ),
          );

          expect(
            channel,
            contains(
              'flow_step_count',
            ),
          );

          expect(
            channel,
            isNot(
              contains(
                'screen_text',
              ),
            ),
          );
        },
      );

      test(
        'completion carries optional flow-health receipt',
        () {
          final progress = read(
            'lib/features/transactions/'
            'transaction_progress_screen.dart',
          );

          expect(
            progress,
            contains(
              "'flow_health': flowHealth",
            ),
          );

          expect(
            progress,
            contains(
              "'mismatch_step_index'",
            ),
          );

          expect(
            progress,
            contains(
              "'healthy'",
            ),
          );

          expect(
            progress,
            isNot(
              contains(
                "'screen_text'",
              ),
            ),
          );
        },
      );

      test(
        'PIN boundary creates healthy evidence',
        () {
          final progress = read(
            'lib/features/transactions/'
            'transaction_progress_screen.dart',
          );

          expect(
            progress,
            contains(
              '_activeFlowReachedPinPrompt',
            ),
          );

          expect(
            progress,
            contains(
              'accessEngine.reachedPinPrompt',
            ),
          );
        },
      );
    },
  );
}
