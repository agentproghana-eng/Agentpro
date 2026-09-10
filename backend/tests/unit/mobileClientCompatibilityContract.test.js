const fs = require('fs');
const path = require('path');

const read = relativePath =>
  fs.readFileSync(
    path.resolve(__dirname, '../../..', relativePath),
    'utf8'
  );

describe('AgentPro mobile compatibility integration contract', () => {
  test('ApiClient sends formal client compatibility metadata', () => {
    const source = read(
      'flutter_app/lib/core/api/api_client.dart'
    );

    expect(source).toContain(
      "'X-AgentPro-App-Version'"
    );
    expect(source).toContain(
      "'X-AgentPro-App-Build'"
    );
    expect(source).toContain(
      "'X-AgentPro-Platform'"
    );
    expect(source).toContain(
      "'X-AgentPro-API-Version'"
    );
  });

  test('ApiClient captures forced compatibility failures globally', () => {
    const source = read(
      'flutter_app/lib/core/api/api_client.dart'
    );

    expect(source).toContain(
      'compatibilityBlock'
    );
    expect(source).toContain(
      "error.response?.statusCode != 426"
    );
    expect(source).toContain(
      "code != 'UPDATE_REQUIRED'"
    );
    expect(source).toContain(
      "code != 'API_INCOMPATIBLE'"
    );
  });

  test('app root gates normal navigation behind compatibility state', () => {
    const source = read(
      'flutter_app/lib/main.dart'
    );

    expect(source).toContain(
      'ValueListenableBuilder<ClientCompatibilityBlock?>'
    );
    expect(source).toContain(
      'ApiClient.compatibilityBlock'
    );
    expect(source).toContain(
      'AppUpdateRequiredScreen'
    );
  });

  test('forced-update screen cannot be dismissed with system back', () => {
    const source = read(
      'flutter_app/lib/shared/widgets/app_update_required_screen.dart'
    );

    expect(source).toContain(
      'PopScope('
    );
    expect(source).toContain(
      'canPop: false'
    );
    expect(source).toContain(
      'https://agentproghana.com'
    );
  });

  test('formal migration policy documents expand-and-contract rules', () => {
    const source = read(
      'docs/API_COMPATIBILITY.md'
    );

    expect(source).toContain(
      'expand-and-contract'
    );
    expect(source).toContain(
      'Forced upgrades are exceptional'
    );
    expect(source).toContain(
      'Breaking API changes'
    );
    expect(source).toContain(
      'Deprecation lifecycle'
    );
  });
});
