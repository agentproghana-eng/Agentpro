'use strict';

jest.mock(
  'jsonwebtoken',
  () => ({
    verify: jest.fn(),
  }),
);

jest.mock(
  '../../src/config/redis',
  () => ({
    isTokenBlacklisted:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
  }),
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
    },
  }),
);

const jwt =
  require('jsonwebtoken');

const {
  isTokenBlacklisted,
} = require(
  '../../src/config/redis'
);

const {
  query,
} = require(
  '../../src/config/database'
);

const {
  authenticate,
} = require(
  '../../src/middleware/auth'
);

function request() {
  return {
    headers: {
      authorization:
        'Bearer access-token',
    },
  };
}

function response() {
  return {
    status:
      jest.fn()
        .mockReturnThis(),
    json:
      jest.fn(),
  };
}

describe(
  'superuser durable MFA session enforcement',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      jwt.verify
        .mockReturnValue({
          id: 'user-1',
          session_id:
            'session-1',
        });

      isTokenBlacklisted
        .mockResolvedValue(false);
    });

    test(
      'rejects an active legacy superuser session with no MFA assurance',
      async () => {
        query.mockResolvedValue({
          rows: [
            {
              id: 'user-1',
              role: 'superuser',
              company_id: null,
              email:
                'admin@example.com',
              status: 'active',
              mfa_enabled: true,
              session_id:
                'session-1',
              session_expires_at:
                new Date(
                  Date.now() +
                  60000,
                ),
              mfa_verified_at:
                null,
            },
          ],
        });

        const res =
          response();

        const next =
          jest.fn();

        await authenticate(
          request(),
          res,
          next,
        );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          401,
        );

        expect(
          res.json,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'MFA_REAUTH_REQUIRED',
          }),
        );

        expect(next)
          .not
          .toHaveBeenCalled();
      },
    );

    test(
      'authorizes a superuser only when the exact durable session is MFA verified',
      async () => {
        query.mockResolvedValue({
          rows: [
            {
              id: 'user-1',
              role: 'superuser',
              company_id: null,
              email:
                'admin@example.com',
              status: 'active',
              mfa_enabled: true,
              session_id:
                'session-1',
              session_expires_at:
                new Date(
                  Date.now() +
                  60000,
                ),
              mfa_verified_at:
                new Date(),
            },
          ],
        });

        const req =
          request();

        const res =
          response();

        const next =
          jest.fn();

        await authenticate(
          req,
          res,
          next,
        );

        expect(next)
          .toHaveBeenCalledTimes(
            1,
          );

        expect(
          req.user.role,
        ).toBe(
          'superuser',
        );
      },
    );

    test(
      'ordinary application roles retain their existing durable-session contract',
      async () => {
        query.mockResolvedValue({
          rows: [
            {
              id: 'user-2',
              role: 'agent',
              company_id:
                'company-1',
              email:
                'agent@example.com',
              status: 'active',
              mfa_enabled: false,
              session_id:
                'session-2',
              session_expires_at:
                new Date(
                  Date.now() +
                  60000,
                ),
              mfa_verified_at:
                null,
            },
          ],
        });

        const req =
          request();

        const next =
          jest.fn();

        await authenticate(
          req,
          response(),
          next,
        );

        expect(next)
          .toHaveBeenCalledTimes(
            1,
          );
      },
    );
  },
);
