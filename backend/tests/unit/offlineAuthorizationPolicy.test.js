const {
  POLICY_STATE,
  parseEnforcementCutoff,
  evaluateOfflineAuthorizationPolicy,
} = require(
  '../../src/utils/offlineAuthorizationPolicy'
);

describe(
  'offlineAuthorizationPolicy',
  () => {
    test(
      'receipt is recognized independently of migration cutoff',
      () => {
        const result =
          evaluateOfflineAuthorizationPolicy({
            receipt:
              'apr1.payload.signature',
            now:
              '2030-02-01T00:00:00.000Z',
            enforcementCutoff:
              '2030-01-01T00:00:00.000Z',
          });

        expect(result.state)
          .toBe(
            POLICY_STATE.RECEIPT_PRESENT
          );

        expect(result.receipt)
          .toBe(
            'apr1.payload.signature'
          );
      }
    );

    test(
      'missing receipt remains transitional when cutoff is not configured',
      () => {
        const result =
          evaluateOfflineAuthorizationPolicy({
            receipt: null,
            enforcementCutoff: '',
          });

        expect(result.state)
          .toBe(
            POLICY_STATE.LEGACY_TRANSITION
          );

        expect(
          result.enforcement_cutoff
        ).toBeNull();
      }
    );

    test(
      'missing receipt remains transitional before cutoff',
      () => {
        const result =
          evaluateOfflineAuthorizationPolicy({
            receipt: '',
            now:
              '2030-01-01T11:59:59.999Z',
            enforcementCutoff:
              '2030-01-01T12:00:00.000Z',
          });

        expect(result.state)
          .toBe(
            POLICY_STATE.LEGACY_TRANSITION
          );
      }
    );

    test(
      'missing receipt requires receipt exactly at cutoff',
      () => {
        const result =
          evaluateOfflineAuthorizationPolicy({
            receipt: null,
            now:
              '2030-01-01T12:00:00.000Z',
            enforcementCutoff:
              '2030-01-01T12:00:00.000Z',
          });

        expect(result.state)
          .toBe(
            POLICY_STATE.RECEIPT_REQUIRED
          );
      }
    );

    test(
      'missing receipt requires receipt after cutoff',
      () => {
        const result =
          evaluateOfflineAuthorizationPolicy({
            receipt: null,
            now:
              '2030-01-02T00:00:00.000Z',
            enforcementCutoff:
              '2030-01-01T12:00:00.000Z',
          });

        expect(result.state)
          .toBe(
            POLICY_STATE.RECEIPT_REQUIRED
          );
      }
    );

    test(
      'malformed configured cutoff fails closed',
      () => {
        expect(() =>
          evaluateOfflineAuthorizationPolicy({
            receipt: null,
            enforcementCutoff:
              'not-a-date',
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_ENFORCEMENT_CONFIG_INVALID',
          })
        );
      }
    );

    test(
      'invalid policy evaluation time fails closed when cutoff is active',
      () => {
        expect(() =>
          evaluateOfflineAuthorizationPolicy({
            receipt: null,
            now:
              'invalid-now',
            enforcementCutoff:
              '2030-01-01T12:00:00.000Z',
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_POLICY_TIME_INVALID',
          })
        );
      }
    );

    test(
      'cutoff parser normalizes a valid instant',
      () => {
        expect(
          parseEnforcementCutoff(
            '2030-01-01T12:00:00Z'
          ).toISOString()
        ).toBe(
          '2030-01-01T12:00:00.000Z'
        );
      }
    );
  }
);
