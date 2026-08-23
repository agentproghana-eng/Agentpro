import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _readSource(String path) {
  final file = File(path);

  expect(
    file.existsSync(),
    isTrue,
    reason: 'Expected production source file to exist: $path',
  );

  return file.readAsStringSync();
}

String _downloadSlice(String source, String marker) {
  final start = source.indexOf(marker);

  expect(
    start,
    greaterThanOrEqualTo(0),
    reason: 'Missing report download marker: $marker',
  );

  return source.substring(start);
}

void main() {
  group('Report file opening contracts', () {
    const screens = {
      'business reports': (
        'lib/features/reports/reports_screen.dart',
        'Future<void> _download(String type) async',
      ),
      'personal reports': (
        'lib/features/reports/personal_reports_screen.dart',
        'Future<void> _download() async',
      ),
    };

    for (final entry in screens.entries) {
      test('${entry.key} handles OpenFilex results', () {
        final source = _readSource(entry.value.$1);

        expect(
          source,
          contains(
            'Future<void> _openGeneratedReport(File file) async',
          ),
        );

        expect(
          source,
          contains(
            'final result = await OpenFilex.open(file.path);',
          ),
        );

        expect(
          source,
          contains('result.type == ResultType.done'),
          reason: 'Successful Android file handoff must be recognized.',
        );

        expect(
          source,
          contains('ResultType.noAppToOpen'),
        );

        expect(
          source,
          contains('ResultType.fileNotFound'),
        );

        expect(
          source,
          contains('ResultType.permissionDenied'),
        );

        expect(
          source,
          contains('ResultType.error'),
        );

        expect(
          source,
          contains(
            'Report generated, but it could not be opened.',
          ),
          reason: 'Thrown platform errors must also surface to the user.',
        );

        final download = _downloadSlice(
          source,
          entry.value.$2,
        );

        expect(
          download,
          contains('await _openGeneratedReport(file);'),
          reason: 'Downloaded reports must use the guarded opener.',
        );

        expect(
          download,
          isNot(
            contains('await OpenFilex.open(file.path);'),
          ),
          reason: 'Download flow must not discard OpenResult.',
        );
      });
    }
  });
}
