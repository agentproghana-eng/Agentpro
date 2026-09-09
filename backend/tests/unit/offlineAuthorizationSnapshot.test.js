const {
  getOfflineAuthorizationSnapshot,
} = require('../../src/utils/offlineAuthorizationSnapshot');

function querySequence(responses) {
  const queryFn = jest.fn();

  for (const response of responses) {
    queryFn.mockResolvedValueOnce(response);
  }

  return queryFn;
}

describe(
  'offlineAuthorizationSnapshot',
  () => {
    test(
      'builds provider and initiable-type cross product minus disabled operations',
      async () => {
        const queryFn =
          querySequence([
            {
              rows: [
                { provider: 'mtn' },
                { provider: 'telecel' },
                { provider: 'at_money' },
              ],
            },
            {
              rows: [
                {
                  transaction_type:
                    'cash_in',
                },
                {
                  transaction_type:
                    'cash_out',
                },
              ],
            },
            {
              rows: [
                {
                  value: JSON.stringify([
                    'telecel:cash_out',
                    'mtn:cash_in',
                  ]),
                },
              ],
            },
          ]);

        const snapshot =
          await getOfflineAuthorizationSnapshot(
            'business',
            queryFn
          );

        expect(
          snapshot.account_mode
        ).toBe('business');

        expect(
          snapshot.allowed_operations
        ).toEqual([
          'at_money:cash_in',
          'at_money:cash_out',
          'mtn:cash_out',
          'telecel:cash_in',
        ]);

        expect(
          snapshot.disabled_operations
        ).toEqual([
          'mtn:cash_in',
          'telecel:cash_out',
        ]);

        expect(
          snapshot.feature_flag_version
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        expect(queryFn)
          .toHaveBeenCalledTimes(3);
      }
    );

    test(
      'missing disabled config means no disabled operations',
      async () => {
        const queryFn =
          querySequence([
            {
              rows: [
                { provider: 'mtn' },
              ],
            },
            {
              rows: [
                {
                  transaction_type:
                    'send_money',
                },
              ],
            },
            {
              rows: [],
            },
          ]);

        const snapshot =
          await getOfflineAuthorizationSnapshot(
            'personal',
            queryFn
          );

        expect(
          snapshot.disabled_operations
        ).toEqual([]);

        expect(
          snapshot.allowed_operations
        ).toEqual([
          'mtn:send_money',
        ]);
      }
    );

    test(
      'malformed disabled config fails closed instead of expanding authorization',
      async () => {
        const queryFn =
          querySequence([
            {
              rows: [
                { provider: 'mtn' },
              ],
            },
            {
              rows: [
                {
                  transaction_type:
                    'cash_out',
                },
              ],
            },
            {
              rows: [
                {
                  value:
                    '{"not":"an array"}',
                },
              ],
            },
          ]);

        await expect(
          getOfflineAuthorizationSnapshot(
            'business',
            queryFn
          )
        ).rejects.toMatchObject({
          code:
            'INVALID_FEATURE_FLAG_CONFIG',
        });
      }
    );

    test(
      'snapshot version is deterministic',
      async () => {
        const responses = [
          {
            rows: [
              { provider: 'telecel' },
              { provider: 'mtn' },
            ],
          },
          {
            rows: [
              {
                transaction_type:
                  'cash_out',
              },
              {
                transaction_type:
                  'cash_in',
              },
            ],
          },
          {
            rows: [
              {
                value:
                  '["telecel:cash_out"]',
              },
            ],
          },
        ];

        const first =
          await getOfflineAuthorizationSnapshot(
            'business',
            querySequence(responses)
          );

        const second =
          await getOfflineAuthorizationSnapshot(
            'business',
            querySequence(responses)
          );

        expect(
          first.feature_flag_version
        ).toBe(
          second.feature_flag_version
        );

        expect(
          first.allowed_operations
        ).toEqual(
          second.allowed_operations
        );
      }
    );

    test(
      'business and personal snapshots have different versions',
      async () => {
        const responses = [
          {
            rows: [
              { provider: 'mtn' },
            ],
          },
          {
            rows: [
              {
                transaction_type:
                  'cash_in',
              },
            ],
          },
          {
            rows: [],
          },
        ];

        const business =
          await getOfflineAuthorizationSnapshot(
            'business',
            querySequence(responses)
          );

        const personal =
          await getOfflineAuthorizationSnapshot(
            'personal',
            querySequence(responses)
          );

        expect(
          business.feature_flag_version
        ).not.toBe(
          personal.feature_flag_version
        );
      }
    );

    test(
      'rejects invalid account mode before querying',
      async () => {
        const queryFn = jest.fn();

        await expect(
          getOfflineAuthorizationSnapshot(
            'admin',
            queryFn
          )
        ).rejects.toThrow(
          'accountMode must be either business or personal'
        );

        expect(queryFn)
          .not.toHaveBeenCalled();
      }
    );
  }
);
