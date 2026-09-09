const {
  issueOfflineAuthorizationReceipt,
} = require(
  '../../src/utils/offlineAuthorizationReceipt'
);

const {
  verifyOfflineAuthorizationRequest,
} = require(
  '../../src/utils/offlineAuthorizationRequest'
);

const SECRET =
  'test-only-offline-receipt-secret-0123456789abcdef';

const USER_ID =
  '11111111-1111-4111-8111-111111111111';

const COMPANY_ID =
  '22222222-2222-4222-8222-222222222222';

const SESSION_ID =
  '33333333-3333-4333-8333-333333333333';

const RECEIPT_ID =
  '44444444-4444-4444-8444-444444444444';

const ISSUED_AT =
  new Date(
    '2030-01-01T00:00:00.000Z'
  );

const AUTHORIZED_UNTIL =
  new Date(
    '2030-01-01T12:00:00.000Z'
  );

function businessUser(
  overrides = {}
) {
  return {
    id: USER_ID,
    company_id:
      COMPANY_ID,
    session_id:
      SESSION_ID,
    ...overrides,
  };
}

function issueBusiness(
  overrides = {}
) {
  return issueOfflineAuthorizationReceipt({
    userId: USER_ID,
    companyId:
      COMPANY_ID,
    sessionId:
      SESSION_ID,
    mode: 'business',
    issuedAt:
      ISSUED_AT,
    authorizedUntil:
      AUTHORIZED_UNTIL,
    allowedOperations: [
      'mtn:cash_in',
      'telecel:cash_out',
    ],
    featureFlagVersion:
      'snapshot-v1',
    receiptId:
      RECEIPT_ID,
    secret:
      SECRET,
    ...overrides,
  });
}

describe(
  'offlineAuthorizationRequest',
  () => {
    test(
      'verifies a matching business request',
      () => {
        const issued =
          issueBusiness();

        const claims =
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser(),
            mode:
              'business',
            provider:
              'MTN',
            transactionType:
              'CASH_IN',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          });

        expect(
          claims.receipt_id
        ).toBe(RECEIPT_ID);

        expect(
          claims.allowed_operations
        ).toContain(
          'mtn:cash_in'
        );
      }
    );

    test(
      'rejects a different operation',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser(),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_out',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_OPERATION_NOT_ALLOWED',
          })
        );
      }
    );

    test(
      'rejects a different authenticated user',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser({
                id:
                  'different-user',
              }),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_IDENTITY_MISMATCH',
          })
        );
      }
    );

    test(
      'rejects a different durable session',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser({
                session_id:
                  'different-session',
              }),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_IDENTITY_MISMATCH',
          })
        );
      }
    );

    test(
      'rejects a different business company',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser({
                company_id:
                  'different-company',
              }),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_IDENTITY_MISMATCH',
          })
        );
      }
    );

    test(
      'rejects expired receipt',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser(),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash_in',
            now:
              AUTHORIZED_UNTIL,
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_EXPIRED',
          })
        );
      }
    );

    test(
      'verifies Personal mode without company identity',
      () => {
        const issued =
          issueOfflineAuthorizationReceipt({
            userId:
              USER_ID,
            companyId:
              null,
            sessionId:
              SESSION_ID,
            mode:
              'personal',
            issuedAt:
              ISSUED_AT,
            authorizedUntil:
              AUTHORIZED_UNTIL,
            allowedOperations: [
              'mtn:send_money',
            ],
            featureFlagVersion:
              'snapshot-personal-v1',
            receiptId:
              RECEIPT_ID,
            secret:
              SECRET,
          });

        const claims =
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user: {
              id:
                USER_ID,
              company_id:
                COMPANY_ID,
              session_id:
                SESSION_ID,
            },
            mode:
              'personal',
            provider:
              'mtn',
            transactionType:
              'send_money',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          });

        expect(
          claims.company_id
        ).toBeNull();
      }
    );

    test(
      'rejects malformed operation before receipt verification',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationRequest({
            receipt:
              issued.token,
            user:
              businessUser(),
            mode:
              'business',
            provider:
              'mtn',
            transactionType:
              'cash out',
            now: new Date(
              '2030-01-01T01:00:00.000Z'
            ),
            secret:
              SECRET,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_AUTHORIZATION_OPERATION_INVALID',
          })
        );
      }
    );
  }
);
