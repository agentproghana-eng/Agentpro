jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/config/redis', () => ({
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn(),
  decode: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));

jest.mock('../../src/services/smsService', () => ({
  sendPasswordResetSMS: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const {
  query,
} = require('../../src/config/database');

const {
  isTokenBlacklisted,
} = require('../../src/config/redis');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController =
  require('../../src/controllers/authController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeRequest() {
  return {
    body: {
      refresh_token: 'presented-refresh-token',
    },
  };
}

function activeUser() {
  return {
    id: 'staff-1',
    role: 'agent',
    company_id: 'company-1',
    email: 'staff@example.com',
    status: 'active',
  };
}

describe('Refresh token persistence authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 'staff-1',
      type: 'refresh',
    });

    jwt.sign.mockReturnValue('new-access-token');

    isTokenBlacklisted.mockResolvedValue(false);
    bcrypt.compare.mockResolvedValue(true);
  });

  test(
    'refresh token must still exist as an active stored token',
    async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM refresh_tokens')) {
          return { rows: [] };
        }

        if (sql.includes('FROM users u')) {
          return { rows: [activeUser()] };
        }

        return { rows: [] };
      });

      const req = makeRequest();
      const res = makeResponse();

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );

      expect(jwt.sign).not.toHaveBeenCalled();
    }
  );

  test(
    'unrevoked unexpired stored refresh token can issue access token',
    async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM refresh_tokens')) {
          return {
            rows: [
              {
                token_hash: 'stored-refresh-hash',
              },
            ],
          };
        }

        if (sql.includes('FROM users u')) {
          return { rows: [activeUser()] };
        }

        return { rows: [] };
      });

      const req = makeRequest();
      const res = makeResponse();

      await authController.refreshToken(req, res);

      const refreshRead = query.mock.calls.find(
        ([sql]) => sql.includes('FROM refresh_tokens')
      );

      expect(refreshRead).toBeDefined();

      const [refreshSql, refreshParams] = refreshRead;

      expect(refreshSql).toContain('revoked_at IS NULL');
      expect(refreshSql).toContain('expires_at > NOW()');
      expect(refreshParams).toEqual(['staff-1']);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'presented-refresh-token',
        'stored-refresh-hash'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          access_token: 'new-access-token',
        },
      });
    }
  );
});
