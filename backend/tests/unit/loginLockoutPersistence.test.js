const mockQuery =
  jest.fn();

const mockTxQuery =
  jest.fn();

const mockWithTransaction =
  jest.fn();

const mockCompare =
  jest.fn();

const mockHash =
  jest.fn();

const mockRecordOperationalEvent =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),

    withTransaction:
      (...args) =>
        mockWithTransaction(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/operationalEventService',
  () => ({
    recordOperationalEvent:
      (...args) =>
        mockRecordOperationalEvent(
          ...args
        ),
  })
);

jest.mock(
  'bcryptjs',
  () => ({
    compare:
      (...args) =>
        mockCompare(...args),
    hash:
      (...args) =>
        mockHash(...args),
  })
);

jest.mock(
  '../../src/config/redis',
  () => ({
    blacklistToken:
      jest.fn(),
    isTokenBlacklisted:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/emailService',
  () => ({
    sendPasswordResetEmail:
      jest.fn(),
    sendWelcomeEmail:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/smsService',
  () => ({
    sendPasswordResetSMS:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog:
      jest.fn(),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  })
);

const {
  login,
} = require(
  '../../src/controllers/authController'
);

describe(
  'persistent login lockout state',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockWithTransaction
        .mockImplementation(
          async (callback) =>
            callback({
              query:
                (...args) =>
                  mockTxQuery(
                    ...args
                  ),
            })
        );

      mockRecordOperationalEvent
        .mockResolvedValue(undefined);
    });

    test(
      'increments failed login attempts atomically in PostgreSQL',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'user-1',
                email:
                  'agent@example.com',
                password_hash:
                  'stored-hash',
                login_attempts: 4,
                locked_until: null,
                status: 'active',
              },
            ],
          });

        mockTxQuery
          .mockResolvedValueOnce({
            rows: [
              {
                login_attempts: 5,
                locked_until:
                  new Date(),
              },
            ],
          });

        mockCompare
          .mockResolvedValue(false);

        const req = {
          body: {
            email:
              'agent@example.com',
            password:
              'wrong-password',
          },
        };

        const json =
          jest.fn();

        const status =
          jest.fn(() => ({
            json,
          }));

        const res = {
          status,
        };

        await login(
          req,
          res
        );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(1);

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(1);

        expect(
          mockTxQuery
        ).toHaveBeenCalledTimes(1);

        const [
          sql,
          params,
        ] =
          mockTxQuery.mock.calls[0];

        expect(sql)
          .toContain(
            'login_attempts = login_attempts + 1'
          );

        expect(sql)
          .toContain(
            'login_attempts + 1 >= $1'
          );

        expect(sql)
          .toContain(
            "NOW() + ($2 * INTERVAL '1 minute')"
          );

        expect(sql)
          .toContain(
            'RETURNING login_attempts, locked_until'
          );

        expect(params)
          .toEqual([
            5,
            30,
            'user-1',
          ]);

        expect(
          mockRecordOperationalEvent
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName:
              'auth.login.failed',
            actorUserId:
              'user-1',
            subjectType:
              'user',
            subjectId:
              'user-1',
          })
        );

        expect(status)
          .toHaveBeenCalledWith(
            401
          );
      }
    );
  }
);
