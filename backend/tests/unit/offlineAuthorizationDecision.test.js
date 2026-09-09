const {
  DECISION,
  decideOfflineAuthorization,
} = require(
  '../../src/utils/offlineAuthorizationDecision'
);

describe(
  'offlineAuthorizationDecision',
  () => {
    const user = {
      id: 'user-1',
      company_id: 'company-1',
      session_id: 'session-1',
    };

    test(
      'currently enabled operation proceeds without receipt',
      () => {
        const verifyRequest =
          jest.fn();

        const result =
          decideOfflineAuthorization({
            currentlyDisabled:
              false,
            receipt:
              null,
            user,
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            verifyRequest,
          });

        expect(result).toEqual({
          allowed: true,
          decision:
            DECISION.LIVE_ALLOWED,
          receipt_claims:
            null,
        });

        expect(
          verifyRequest
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'currently enabled operation does not depend on supplied receipt',
      () => {
        const verifyRequest =
          jest.fn(() => {
            throw new Error(
              'must not verify'
            );
          });

        const result =
          decideOfflineAuthorization({
            currentlyDisabled:
              false,
            receipt:
              'malformed-client-value',
            user,
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            verifyRequest,
          });

        expect(result.decision)
          .toBe(
            DECISION.LIVE_ALLOWED
          );

        expect(
          verifyRequest
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'disabled operation without receipt remains blocked',
      () => {
        const verifyRequest =
          jest.fn();

        const result =
          decideOfflineAuthorization({
            currentlyDisabled:
              true,
            receipt:
              null,
            user,
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            verifyRequest,
          });

        expect(result).toEqual({
          allowed: false,
          decision:
            DECISION.FEATURE_DISABLED,
          receipt_claims:
            null,
        });

        expect(
          verifyRequest
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'disabled operation accepts matching signed authorization receipt',
      () => {
        const claims = {
          receipt_id:
            'receipt-1',
          allowed_operations: [
            'mtn:cash_in',
          ],
        };

        const verifyRequest =
          jest.fn(() => claims);

        const now =
          new Date(
            '2030-01-01T01:00:00.000Z'
          );

        const result =
          decideOfflineAuthorization({
            currentlyDisabled:
              true,
            receipt:
              'apr1.payload.signature',
            user,
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            now,
            secret:
              'server-secret',
            verifyRequest,
          });

        expect(result).toEqual({
          allowed: true,
          decision:
            DECISION.RECEIPT_ALLOWED,
          receipt_claims:
            claims,
        });

        expect(
          verifyRequest
        ).toHaveBeenCalledWith({
          receipt:
            'apr1.payload.signature',
          user,
          mode:
            'business',
          provider:
            'mtn',
          transactionType:
            'cash_in',
          now,
          secret:
            'server-secret',
        });
      }
    );

    test(
      'invalid receipt never bypasses disabled operation',
      () => {
        const error =
          Object.assign(
            new Error(
              'receipt invalid'
            ),
            {
              code:
                'OFFLINE_RECEIPT_INVALID',
            }
          );

        const verifyRequest =
          jest.fn(() => {
            throw error;
          });

        expect(() =>
          decideOfflineAuthorization({
            currentlyDisabled:
              true,
            receipt:
              'apr1.invalid.signature',
            user,
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            verifyRequest,
          })
        ).toThrow(error);
      }
    );

    test(
      'client queue timestamp is not an authorization input',
      () => {
        const verifyRequest =
          jest.fn();

        const input = {
          currentlyDisabled:
            true,
          receipt:
            null,
          user,
          mode:
            'business',
          provider:
            'mtn',
          transactionType:
            'cash_in',
          queued_at:
            '2020-01-01T00:00:00Z',
          offline_sync:
            true,
          verifyRequest,
        };

        const result =
          decideOfflineAuthorization(
            input
          );

        expect(result.decision)
          .toBe(
            DECISION.FEATURE_DISABLED
          );

        expect(
          result.allowed
        ).toBe(false);

        expect(
          verifyRequest
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'receipt verifier receives Personal mode unchanged',
      () => {
        const verifyRequest =
          jest.fn(() => ({
            receipt_id:
              'personal-receipt',
          }));

        decideOfflineAuthorization({
          currentlyDisabled:
            true,
          receipt:
            'apr1.payload.signature',
          user: {
            id:
              'user-1',
            company_id:
              null,
            session_id:
              'session-1',
          },
          mode:
            'personal',
          provider:
            'telecel',
          transactionType:
            'send_money',
          verifyRequest,
        });

        expect(
          verifyRequest
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            mode:
              'personal',
            provider:
              'telecel',
            transactionType:
              'send_money',
          })
        );
      }
    );
  }
);
