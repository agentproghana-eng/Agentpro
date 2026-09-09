const {
  issueOfflineAuthorizationReceipt,
  verifyOfflineAuthorizationReceipt,
} = require('../../src/utils/offlineAuthorizationReceipt');

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

function issueBusiness(overrides = {}) {
  return issueOfflineAuthorizationReceipt({
    userId: USER_ID,
    companyId: COMPANY_ID,
    sessionId: SESSION_ID,
    mode: 'business',
    issuedAt: ISSUED_AT,
    authorizedUntil:
      AUTHORIZED_UNTIL,
    allowedOperations: [
      'telecel:cash_out',
      'mtn:cash_in',
      ' TELECEL:CASH_OUT ',
    ],
    featureFlagVersion:
      'flags-v1',
    receiptId: RECEIPT_ID,
    secret: SECRET,
    ...overrides,
  });
}

describe(
  'offlineAuthorizationReceipt',
  () => {
    test(
      'issues and verifies a normalized business receipt',
      () => {
        const issued =
          issueBusiness();

        expect(
          issued.token.startsWith(
            'apr1.'
          )
        ).toBe(true);

        expect(
          issued.claims
            .allowed_operations
        ).toEqual([
          'mtn:cash_in',
          'telecel:cash_out',
        ]);

        const verified =
          verifyOfflineAuthorizationReceipt(
            issued.token,
            {
              secret: SECRET,
              expectedUserId:
                USER_ID,
              expectedCompanyId:
                COMPANY_ID,
              expectedSessionId:
                SESSION_ID,
              expectedMode:
                'business',
              requiredOperation:
                'telecel:cash_out',
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          );

        expect(
          verified.receipt_id
        ).toBe(RECEIPT_ID);

        expect(
          verified.feature_flag_version
        ).toBe('flags-v1');
      }
    );

    test(
      'rejects token tampering',
      () => {
        const issued =
          issueBusiness();

        const parts =
          issued.token.split('.');

        parts[1] =
          `${parts[1]}x`;

        expect(() =>
          verifyOfflineAuthorizationReceipt(
            parts.join('.'),
            {
              secret: SECRET,
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          )
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_SIGNATURE_INVALID',
          })
        );
      }
    );

    test(
      'rejects an expired receipt',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationReceipt(
            issued.token,
            {
              secret: SECRET,
              now: AUTHORIZED_UNTIL,
            }
          )
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_EXPIRED',
          })
        );
      }
    );

    test(
      'rejects identity mismatch',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationReceipt(
            issued.token,
            {
              secret: SECRET,
              expectedUserId:
                'different-user',
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          )
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_IDENTITY_MISMATCH',
          })
        );
      }
    );

    test(
      'rejects an operation outside the signed snapshot',
      () => {
        const issued =
          issueBusiness();

        expect(() =>
          verifyOfflineAuthorizationReceipt(
            issued.token,
            {
              secret: SECRET,
              requiredOperation:
                'telecel:cash_in',
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          )
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_OPERATION_NOT_ALLOWED',
          })
        );
      }
    );

    test(
      'requires company identity for business mode',
      () => {
        expect(() =>
          issueBusiness({
            companyId: null,
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_CLAIMS_INVALID',
          })
        );
      }
    );

    test(
      'binds paid Personal entitlement to its signed lifetime',
      () => {
        const issued =
          issueOfflineAuthorizationReceipt({
            userId: USER_ID,
            companyId: null,
            sessionId:
              SESSION_ID,
            mode: 'personal',
            issuedAt:
              ISSUED_AT,
            authorizedUntil:
              new Date(
                '2030-01-02T00:00:00.000Z'
              ),
            allowedOperations: [
              'mtn:send_money',
            ],
            featureFlagVersion:
              'flags-v2',
            personalPaid: true,
            personalPaidUntil:
              new Date(
                '2030-01-01T06:00:00.000Z'
              ),
            receiptId:
              RECEIPT_ID,
            secret: SECRET,
          });

        const verified =
          verifyOfflineAuthorizationReceipt(
            issued.token,
            {
              secret: SECRET,
              expectedUserId:
                USER_ID,
              expectedCompanyId:
                null,
              expectedMode:
                'personal',
              requiredOperation:
                'mtn:send_money',
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          );

        expect(
          verified.personal_paid
        ).toBe(true);

        expect(
          verified.personal_paid_until
        ).toBe(
          '2030-01-01T06:00:00.000Z'
        );
      }
    );

    test(
      'rejects weak signing secrets',
      () => {
        expect(() =>
          issueBusiness({
            secret: 'too-short',
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_SECRET_INVALID',
          })
        );
      }
    );

    test(
      'rejects malformed operation keys',
      () => {
        expect(() =>
          issueBusiness({
            allowedOperations: [
              'telecel cash out',
            ],
          })
        ).toThrow(
          expect.objectContaining({
            code:
              'OFFLINE_RECEIPT_CLAIMS_INVALID',
          })
        );
      }
    );
  }
);
