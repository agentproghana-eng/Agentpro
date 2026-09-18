const {
  STATUS,
  parseVersion,
  parseBuildNumber,
  compareVersions,
  evaluateClientCompatibility,
} = require('../../src/utils/clientCompatibility');

const policy = {
  apiContractVersion: 1,
  minimumSupportedAppVersion: '2.0.0',
  recommendedAppVersion: '2.2.0',
  forcedUpgradeBelowVersion: '1.5.0',
  minimumSupportedBuildNumber: 5,
  recommendedBuildNumber: 8,
  forcedUpgradeBelowBuildNumber: 3,
};

describe('AgentPro client compatibility policy', () => {
  test('parses strict semantic app versions', () => {
    expect(parseVersion('2.0.0')).toEqual([2, 0, 0]);
    expect(parseVersion(' 2.1.3 ')).toEqual([2, 1, 3]);
    expect(parseVersion('2')).toBeNull();
    expect(parseVersion('2.0')).toBeNull();
    expect(parseVersion('v2.0.0')).toBeNull();
    expect(parseVersion('2.0.0+1')).toBeNull();
  });

  test('parses positive Android build numbers', () => {
    expect(parseBuildNumber('1')).toBe(1);
    expect(parseBuildNumber(' 42 ')).toBe(42);
    expect(parseBuildNumber('0')).toBeNull();
    expect(parseBuildNumber('01')).toBeNull();
    expect(parseBuildNumber('abc')).toBeNull();
  });

  test('compares versions numerically', () => {
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.1.0', '2.0.9')).toBe(1);
    expect(compareVersions('1.10.0', '2.0.0')).toBe(-1);
  });

  test('keeps metadata-free legacy clients supported', () => {
    expect(
      evaluateClientCompatibility({}, policy)
    ).toMatchObject({
      status: STATUS.LEGACY_SUPPORTED,
      enforce: false,
    });
  });

  test('supports a current compatible build', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: '8',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.SUPPORTED,
      enforce: false,
    });
  });

  test('recommends a newer build without blocking it', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: '6',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.UPDATE_RECOMMENDED,
      enforce: false,
    });
  });

  test('blocks a build below minimum build', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: '4',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.UPDATE_REQUIRED,
      enforce: true,
    });
  });

  test('blocks a build below forced build boundary', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: '2',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.UPDATE_REQUIRED,
      enforce: true,
    });
  });

  test('blocks obsolete semantic versions', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '1.4.9',
          buildNumber: '99',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.UPDATE_REQUIRED,
      enforce: true,
    });
  });

  test('rejects unsupported API contract', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: '8',
          platform: 'android',
          apiContractVersion: '2',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.API_INCOMPATIBLE,
      enforce: true,
    });
  });

  test('rejects malformed explicit metadata', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
          buildNumber: 'not-a-build',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
    });
  });
});
