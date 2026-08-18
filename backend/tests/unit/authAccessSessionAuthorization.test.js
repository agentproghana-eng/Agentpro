jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/config/redis', () => ({
  isTokenBlacklisted: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const jwt = require('jsonwebtoken');
const { query } = require('../../src/config/database');
const {
  isTokenBlacklisted,
} = require('../../src/config/redis');

const {
  authenticate,
} = require('../../src/middleware/auth');

function makeRequest() {
  return {
    headers: {
      authorization: 'Bearer access-token',
    },
  };
}

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function activeSession() {
  return {
    id: 'user-1',
    role: 'agent',
    company_id: 'company-1',
    email: 'current@example.com',
    status: 'active',
    session_id: 'session-1',
  };
}

describe('Access token durable session authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 'user-1',
      role: 'stale-role',
      company_id: 'stale-company',
      email: 'stale@example.com',
      session_id: 'session-1',
    });

    isTokenBlacklisted.mockResolvedValue(false);

    query.mockResolvedValue({
      rows: [activeSession()],
    });
  });

  test(
    'authorizes only an active persisted session and uses current DB identity',
    async () => {
      const req = makeRequest();
      const res = makeResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);

      expect(req.user).toEqual({
        id: 'user-1',
        role: 'agent',
        company_id: 'company-1',
        email: 'current@example.com',
        session_id: 'session-1',
      });

      const [sql, params] = query.mock.calls[0];

      expect(sql).toContain(
        'JOIN refresh_tokens rt',
      );
      expect(sql).toContain(
        "u.status = 'active'",
      );
      expect(sql).toContain(
        'rt.id = $2',
      );
      expect(sql).toContain(
        'rt.revoked_at IS NULL',
      );
      expect(sql).toContain(
        'rt.expires_at > NOW()',
      );

      expect(params).toEqual([
        'user-1',
        'session-1',
      ]);
    },
  );

  test(
    'legacy access token without a session ID fails closed and can be refreshed',
    async () => {
      jwt.verify.mockReturnValue({
        id: 'user-1',
      });

      const req = makeRequest();
      const res = makeResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SESSION_REFRESH_REQUIRED',
        }),
      );

      expect(query).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    },
  );

  test(
    'revoked or expired database session rejects access even when Redis allows it',
    async () => {
      isTokenBlacklisted.mockResolvedValue(false);
      query.mockResolvedValue({ rows: [] });

      const req = makeRequest();
      const res = makeResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SESSION_REVOKED',
        }),
      );

      expect(next).not.toHaveBeenCalled();
    },
  );

  test(
    'Redis blacklist still rejects before the database session read',
    async () => {
      isTokenBlacklisted.mockResolvedValue(true);

      const req = makeRequest();
      const res = makeResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(query).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    },
  );

  test(
    'database verification failure fails closed',
    async () => {
      query.mockRejectedValue(
        new Error('database unavailable'),
      );

      const req = makeRequest();
      const res = makeResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    },
  );
});
