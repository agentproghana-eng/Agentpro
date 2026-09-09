jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
    withTransaction: jest.fn(),
  })
);

jest.mock(
  '../../src/utils/offlineAuthorizationSnapshot',
  () => ({
    getOfflineAuthorizationSnapshot:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: jest.fn(),
  })
);

jest.mock(
  '../../src/services/emailService',
  () => ({
    sendEmail: jest.fn(),
    sendNewEmployeeEmail: jest.fn(),
  })
);

jest.mock(
  '../../src/services/smsService',
  () => ({
    sendNewEmployeeSMS: jest.fn(),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  })
);

const {
  getOfflineAuthorizationSnapshot,
} = require(
  '../../src/utils/offlineAuthorizationSnapshot'
);

const {
  verifyOfflineAuthorizationReceipt,
} = require(
  '../../src/utils/offlineAuthorizationReceipt'
);

const {
  getOfflineAuthorization,
} = require(
  '../../src/controllers/userController'
);

const SECRET =
  'test-only-offline-receipt-secret-0123456789abcdef';

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeBusinessRequest() {
  return {
    params: {
      mode: 'business',
    },
    user: {
      id:
        '11111111-1111-4111-8111-111111111111',
      company_id:
        '22222222-2222-4222-8222-222222222222',
      session_id:
        '33333333-3333-4333-8333-333333333333',
    },
    offline_transaction_trust: {
      mode: 'business',
      user_id:
        '11111111-1111-4111-8111-111111111111',
      company_id:
        '22222222-2222-4222-8222-222222222222',
      session_id:
        '33333333-3333-4333-8333-333333333333',
      verified_at:
        '2030-01-01T00:00:00.000Z',
      authorized_until:
        '2030-01-01T12:00:00.000Z',
      personal_paid: false,
      personal_paid_until: null,
    },
  };
}

describe(
  'offline authorization receipt issuance',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      process.env
        .AGENTPRO_OFFLINE_RECEIPT_SECRET =
        SECRET;

      getOfflineAuthorizationSnapshot
        .mockResolvedValue({
          account_mode:
            'business',
          allowed_operations: [
            'mtn:cash_in',
            'telecel:cash_out',
          ],
          feature_flag_version:
            'snapshot-v1',
        });
    });

    afterEach(() => {
      delete process.env
        .AGENTPRO_OFFLINE_RECEIPT_SECRET;
    });

    test(
      'issues a signed receipt from server-derived trust and snapshot state',
      async () => {
        const req =
          makeBusinessRequest();

        const res =
          makeResponse();

        await getOfflineAuthorization(
          req,
          res
        );

        expect(res.status)
          .not.toHaveBeenCalled();

        expect(res.json)
          .toHaveBeenCalledTimes(1);

        const payload =
          res.json.mock.calls[0][0];

        expect(payload.success)
          .toBe(true);

        expect(
          payload.data.receipt
        ).toEqual(
          expect.stringMatching(
            /^apr1\./
          )
        );

        expect(
          payload.data.feature_flag_version
        ).toBe('snapshot-v1');

        const claims =
          verifyOfflineAuthorizationReceipt(
            payload.data.receipt,
            {
              secret: SECRET,
              expectedUserId:
                req.user.id,
              expectedCompanyId:
                req.user.company_id,
              expectedSessionId:
                req.user.session_id,
              expectedMode:
                'business',
              requiredOperation:
                'mtn:cash_in',
              now: new Date(
                '2030-01-01T01:00:00.000Z'
              ),
            }
          );

        expect(
          claims.feature_flag_version
        ).toBe('snapshot-v1');
      }
    );

    test(
      'does not issue when request trust context is missing',
      async () => {
        const req =
          makeBusinessRequest();

        delete req
          .offline_transaction_trust;

        const res =
          makeResponse();

        await getOfflineAuthorization(
          req,
          res
        );

        expect(res.status)
          .toHaveBeenCalledWith(503);

        expect(
          res.json.mock.calls[0][0]
            .code
        ).toBe(
          'OFFLINE_AUTHORIZATION_UNAVAILABLE'
        );

        expect(
          getOfflineAuthorizationSnapshot
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'does not issue when business identity differs from signed trust context',
      async () => {
        const req =
          makeBusinessRequest();

        req.user.company_id =
          'different-company';

        const res =
          makeResponse();

        await getOfflineAuthorization(
          req,
          res
        );

        expect(res.status)
          .toHaveBeenCalledWith(403);

        expect(
          getOfflineAuthorizationSnapshot
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'fails closed when signing secret is unavailable',
      async () => {
        delete process.env
          .AGENTPRO_OFFLINE_RECEIPT_SECRET;

        const req =
          makeBusinessRequest();

        const res =
          makeResponse();

        await getOfflineAuthorization(
          req,
          res
        );

        expect(res.status)
          .toHaveBeenCalledWith(503);

        expect(
          res.json.mock.calls[0][0]
            .code
        ).toBe(
          'OFFLINE_AUTHORIZATION_UNAVAILABLE'
        );
      }
    );

    test(
      'fails closed when authorization snapshot cannot be built',
      async () => {
        getOfflineAuthorizationSnapshot
          .mockRejectedValueOnce(
            Object.assign(
              new Error(
                'invalid feature flags'
              ),
              {
                code:
                  'INVALID_FEATURE_FLAG_CONFIG',
              }
            )
          );

        const req =
          makeBusinessRequest();

        const res =
          makeResponse();

        await getOfflineAuthorization(
          req,
          res
        );

        expect(res.status)
          .toHaveBeenCalledWith(503);

        expect(
          res.json.mock.calls[0][0]
            .code
        ).toBe(
          'OFFLINE_AUTHORIZATION_UNAVAILABLE'
        );
      }
    );
  }
);
