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
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const {
  query,
} = require('../../src/config/database');

const {
  requireActiveSubscription,
  requirePersonalAccount,
} = require('../../src/middleware/auth');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
}

function makeUser() {
  return {
    id: 'user-1',
    role: 'agent',
    company_id: 'company-1',
    session_id: 'session-1',
    session_expires_at: '2099-12-31T23:59:59.000Z',
  };
}

describe('Offline transaction trust authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'Business proof is issued only after active subscription verification and is capped by subscription expiry',
    async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            plan: 'business',
            status: 'active',
            expires_at: '2099-06-30T23:59:59.000Z',
          },
        ],
      });

      const req = {
        user: makeUser(),
      };

      const res = makeResponse();
      const next = jest.fn();

      await requireActiveSubscription(
        req,
        res,
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Version',
        '2',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Mode',
        'business',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-User-Id',
        'user-1',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Session-Id',
        'session-1',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Authorized-Until',
        '2099-06-30T23:59:59.000Z',
      );
    },
  );

  test(
    'Personal Free capability receives Personal trust but no Paid override entitlement',
    async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            plan: 'free',
            expires_at: null,
          },
        ],
      });

      const req = {
        user: makeUser(),
      };

      const res = makeResponse();
      const next = jest.fn();

      await requirePersonalAccount(
        req,
        res,
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Mode',
        'personal',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Authorized-Until',
        '2099-12-31T23:59:59.000Z',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Personal-Paid',
        '0',
      );

      expect(res.set).not.toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Personal-Paid-Until',
        expect.any(String),
      );
    },
  );

  test(
    'active Personal Paid entitlement is separately capped by its own expiry',
    async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            plan: 'paid',
            expires_at: '2099-07-31T23:59:59.000Z',
          },
        ],
      });

      const req = {
        user: makeUser(),
      };

      const res = makeResponse();
      const next = jest.fn();

      await requirePersonalAccount(
        req,
        res,
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Personal-Paid',
        '1',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Personal-Paid-Until',
        '2099-07-31T23:59:59.000Z',
      );

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Authorized-Until',
        '2099-12-31T23:59:59.000Z',
      );
    },
  );

  test(
    'expired Personal Paid state falls back to Personal capability without Paid override trust',
    async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            plan: 'paid',
            expires_at: '2020-01-01T00:00:00.000Z',
          },
        ],
      });

      const req = {
        user: makeUser(),
      };

      const res = makeResponse();
      const next = jest.fn();

      await requirePersonalAccount(
        req,
        res,
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);

      expect(res.set).toHaveBeenCalledWith(
        'X-AgentPro-Offline-Trust-Personal-Paid',
        '0',
      );
    },
  );
});
