'use strict';

const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/controllers/transactionController', () => ({
  sanitizeUSSDLog: jest.fn((value) => value),
  sanitizeFailureReason: jest.fn((value) => value),
}));

const controller =
  require('../../src/controllers/personalTransactionController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Personal History access contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'base list is a bounded recent preview and ignores full-history controls',
    async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'recent-1' }],
      });

      const req = {
        user: { id: 'user-1' },
        query: {
          provider: 'mtn',
          page: '9',
          limit: '100',
          search: 'secret-search',
          status: 'failed',
          sort_by: 'amount',
          sort_order: 'asc',
        },
      };

      const res = makeRes();

      await controller.listRecentTransactions(req, res);

      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain(
        'ORDER BY created_at DESC, id DESC'
      );
      expect(sql).toContain('LIMIT 5');
      expect(sql).not.toContain('OFFSET');
      expect(sql).not.toContain('reference ILIKE');
      expect(sql).not.toContain('status =');
      expect(params).toEqual(['user-1', 'mtn']);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'recent-1' }],
        meta: { limit: 5 },
      });
    },
  );

  test(
    'full-history route is Paid-only and registered before transaction-id route',
    () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/routes/personalTransaction.routes.js'
        ),
        'utf8'
      );

      const normalized = source.replace(/\s+/g, ' ');

      expect(normalized).toContain(
        "router.get('/', personalTransactionController.listRecentTransactions);"
      );

      expect(normalized).toContain(
        "router.get( '/history', requirePaidPersonalPlan, personalTransactionController.listTransactions );"
      );

      expect(
        normalized.indexOf("'/history'")
      ).toBeLessThan(
        normalized.indexOf("'/:transaction_id'")
      );
    },
  );
});
