const {
  STATUS,
  parseVersion,
  compareVersions,
  evaluateClientCompatibility,
} = require('../../src/utils/clientCompatibility');

const policy = {
  apiContractVersion: 1,
  minimumSupportedAppVersion: '2.0.0',
  recommendedAppVersion: '2.2.0',
  forcedUpgradeBelowVersion: '1.5.0',
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

  test('compares versions numerically', () => {
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.1.0', '2.0.9')).toBe(1);
    expect(compareVersions('1.10.0', '2.0.0')).toBe(-1);
  });

  test('keeps clients with no version headers legacy supported', () => {
    expect(
      evaluateClientCompatibility({}, policy)
    ).toMatchObject({
      status: STATUS.LEGACY_SUPPORTED,
      enforce: false,
    });
  });

  test('supports a current compatible client', () => {
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

  test('recommends an update without blocking a supported older client', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.0.0',
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

  test('requires an update below minimum supported version', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '1.9.0',
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

  test('requires an update below forced-upgrade boundary', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '1.4.9',
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

  test('rejects an unsupported API contract', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.2.0',
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

  test('rejects malformed explicit compatibility metadata', () => {
    expect(
      evaluateClientCompatibility(
        {
          appVersion: 'version-two',
          platform: 'android',
          apiContractVersion: '1',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
    });

    expect(
      evaluateClientCompatibility(
        {
          appVersion: '2.0.0',
        },
        policy
      )
    ).toMatchObject({
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
    });
  });
});
