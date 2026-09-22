const fs = require('fs');
const path = require('path');

const read = relativePath =>
  fs.readFileSync(
    path.resolve(
      __dirname,
      '../../..',
      relativePath
    ),
    'utf8'
  );

const exists = relativePath =>
  fs.existsSync(
    path.resolve(
      __dirname,
      '../../..',
      relativePath
    )
  );

describe('AgentPro mobile release contract', () => {
  test('mobile identifies version, build and source commit', () => {
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
      "'X-AgentPro-Source-Commit'"
    );

    expect(source).toContain(
      "'AGENTPRO_SOURCE_COMMIT'"
    );
  });

  test('CI generates unique signed release identity', () => {
    const source = read(
      '.github/workflows/ci.yml'
    );

    expect(source).toContain(
      '--build-number "$GITHUB_RUN_NUMBER"'
    );

    expect(source).toContain(
      '--dart-define=AGENTPRO_SOURCE_COMMIT="$GITHUB_SHA"'
    );

    expect(source).toContain(
      'Verify signed release APK'
    );
  });

  test('normal non-mobile changes do not publish Android releases', () => {
    const source = read(
      '.github/workflows/ci.yml'
    );

    expect(source).toContain(
      "grep -Eq '^flutter_app/' changed-files.txt"
    );

    expect(source).toContain(
      'needs.mobile-release-changes.outputs.should_publish'
    );

    expect(source).toContain(
      'Publish Rolling Android Release'
    );
  });

  test('public APK is rolling release rather than frozen repository binary', () => {
    const route = read(
      'intellicore_web/src/app/download/agentpro-latest.apk/route.ts'
    );

    expect(route).toContain(
      'releases/download/android-latest/agentpro-latest.apk'
    );

    expect(
      exists(
        'intellicore_web/public/download/agentpro-latest.apk'
      )
    ).toBe(false);
  });

  test('admin verifies persisted flow before reporting live', () => {
    const source = read(
      'admin_portal/src/features/ussd/UssdAdminPages.jsx'
    );

    expect(source).toContain(
      'verifyPersistedFlow'
    );

    expect(source).toContain(
      'FLOW_READ_AFTER_WRITE_MISMATCH'
    );

    expect(source).toContain(
      'Flow updated and verified live'
    );
  });

  test('compatibility policy documents build identity', () => {
    const source = read(
      'docs/API_COMPATIBILITY.md'
    );

    expect(source).toContain(
      'Build-number compatibility'
    );

    expect(source).toContain(
      'Release provenance'
    );

    expect(source).toContain(
      'USSD flow freshness'
    );
  });
});
