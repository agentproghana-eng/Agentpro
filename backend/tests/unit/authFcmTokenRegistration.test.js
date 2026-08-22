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
  withTransaction,
} = require('../../src/config/database');

const authController =
  require('../../src/controllers/authController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('FCM device registration', () => {
  let txQuery;

  beforeEach(() => {
    jest.clearAllMocks();

    txQuery = jest.fn();

    withTransaction.mockImplementation(
      async (callback) => callback({
        query: txQuery,
      })
    );
  });

  test(
    'reassigns one installation token to the authenticated user',
    async () => {
      txQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'user-current' }],
        });

      const req = {
        user: { id: 'user-current' },
        body: {
          fcm_token: 'firebase-installation-token',
        },
      };

      const res = makeResponse();

      await authController.updateFcmToken(req, res);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(txQuery).toHaveBeenCalledTimes(3);

      expect(
        txQuery.mock.calls[0][0]
      ).toContain('pg_advisory_xact_lock');

      expect(
        txQuery.mock.calls[1][0]
      ).toContain('SET fcm_token = NULL');

      expect(
        txQuery.mock.calls[1][1]
      ).toEqual([
        'firebase-installation-token',
        'user-current',
      ]);

      expect(
        txQuery.mock.calls[2][0]
      ).toContain('SET fcm_token = $1');

      expect(
        txQuery.mock.calls[2][1]
      ).toEqual([
        'firebase-installation-token',
        'user-current',
      ]);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification device registered',
      });
    }
  );

  test(
    'logout clears only the matching device FCM token',
    async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const req = {
        user: {
          id: 'user-current',
          session_id: 'session-current',
        },
        body: {
          fcm_token: 'firebase-installation-token',
        },
        headers: {},
        ip: '127.0.0.1',
        requestId: 'request-1',
      };

      const res = makeResponse();

      await authController.logout(req, res);

      expect(query).toHaveBeenCalledTimes(2);

      expect(
        query.mock.calls[0][0]
      ).toContain('UPDATE refresh_tokens');

      expect(
        query.mock.calls[0][1]
      ).toEqual([
        'session-current',
        'user-current',
      ]);

      expect(
        query.mock.calls[1][0]
      ).toContain('SET fcm_token = NULL');

      expect(
        query.mock.calls[1][1]
      ).toEqual([
        'user-current',
        'firebase-installation-token',
      ]);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

});
