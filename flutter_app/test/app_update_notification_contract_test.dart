import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final api = File(
    'lib/core/api/api_client.dart',
  ).readAsStringSync();

  final storage = File(
    'lib/core/services/storage_service.dart',
  ).readAsStringSync();

  final main = File(
    'lib/main.dart',
  ).readAsStringSync();

  final requiredScreen = File(
    'lib/shared/widgets/app_update_required_screen.dart',
  ).readAsStringSync();

  final recommendedBanner = File(
    'lib/shared/widgets/app_update_recommended_banner.dart',
  ).readAsStringSync();

  test('AgentPro proactively checks update compatibility', () {
    expect(
      api,
      contains(").get('/compatibility')"),
    );

    expect(
      main,
      contains('ApiClient.checkForAppUpdate'),
    );

    expect(
      main,
      contains('AppLifecycleState.resumed'),
    );
  });

  test('recommended update is dismissible but returns after 24 hours', () {
    expect(
      api,
      contains('recommendedUpdateNotice'),
    );

    expect(
      storage,
      contains('Duration(hours: 24)'),
    );

    expect(
      recommendedBanner,
      contains("const Text('Later')"),
    );

    expect(
      recommendedBanner,
      contains("child: Text("),
    );
  });

  test('required update remains a blocking application gate', () {
    expect(
      main,
      contains('AppUpdateRequiredScreen'),
    );

    expect(
      requiredScreen,
      contains('canPop: false'),
    );

    expect(
      requiredScreen,
      contains('widget.compatibility.updateUrl'),
    );
  });

  test('update destination is server controlled with official APK fallback', () {
    expect(
      api,
      contains(
        'https://agentproghana.com/download/agentpro-latest.apk',
      ),
    );

    expect(
      api,
      contains("data['update_url']"),
    );
  });
}
