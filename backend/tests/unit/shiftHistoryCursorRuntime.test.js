const express = require('express');
const request = require('supertest');

const mockQuery = jest.fn();
const mockAuthorize = jest.fn(
  (...roles) =>
    (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }

      next();
    }
);

jest.mock(
  '../../src/config/database',
  () => ({
    query: (...args) => mockQuery(...args),
    withTransaction: jest.fn(),
  })
);

jest.mock(
  '../../src/middleware/auth',
  () => ({
    authenticate: (req, _res, next) => {
      req.user = {
        id: req.headers['x-user-id'] || 'manager-1',
        company_id:
          req.headers['x-company-id'] || 'company-1',
        role:
          req.headers['x-role'] || 'manager',
      };
      next();
    },
    requireActiveSubscription:
      (_req, _res, next) => next(),
    authorize: (...roles) =>
      mockAuthorize(...roles),
  })
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: jest.fn(),
  })
);

jest.mock(
  '../../src/services/agentWalletService',
  () => ({
    getOrCreateAgentSimWallet: jest.fn(),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  })
);

const shiftRoutes =
  require('../../src/routes/shift.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/shifts', shiftRoutes);
  return app;
}

function shiftRow({
  id,
  closedAt,
  variance = '0',
}) {
  return {
    id,
    agent_id: 'agent-1',
    company_id: 'company-1',
    branch_id: 'branch-1',
    status: 'closed',
    opened_at: '2026-09-15T08:00:00.000Z',
    closed_at: closedAt,
    opening_cash_variance: '0',
    closing_cash_variance: variance,
    variance,
    net_shift_variance: variance,
    first_name: 'Test',
    last_name: 'Agent',
    branch_name: 'Main',
    transaction_count: 3,
  };
}

describe('shift history cursor runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns first page and next cursor', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [
          shiftRow({
            id: '11111111-1111-1111-1111-111111111111',
            closedAt:
              '2026-09-15T10:00:00.000Z',
          }),
          shiftRow({
            id: '22222222-2222-2222-2222-222222222222',
            closedAt:
              '2026-09-15T09:00:00.000Z',
          }),
          shiftRow({
            id: '33333333-3333-3333-3333-333333333333',
            closedAt:
              '2026-09-15T08:00:00.000Z',
          }),
        ],
      });

    const response = await request(buildApp())
      .get('/shifts/cursor?limit=2')
      .set('x-role', 'business_owner')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.pagination.has_more
    ).toBe(true);
    expect(
      typeof response.body.pagination.next_cursor
    ).toBe('string');

    const sql =
      mockQuery.mock.calls[1][0];

    expect(sql).toContain(
      'ORDER BY'
    );
    expect(sql).toContain(
      's.closed_at DESC'
    );
    expect(sql).toContain(
      's.id DESC'
    );
    expect(sql).not.toContain(
      'OFFSET'
    );
    expect(sql).not.toContain(
      'COUNT(*)'
    );

    expect(
      mockQuery.mock.calls[1][1].at(-1)
    ).toBe(3);
  });

  test('uses closed_at/id seek on second page', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        closed_at:
          '2026-09-15T09:00:00.000Z',
        id:
          '22222222-2222-2222-2222-222222222222',
      })
    ).toString('base64url');

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await request(buildApp())
      .get(
        `/shifts/cursor?limit=20&cursor=${cursor}`
      )
      .set('x-role', 'business_owner')
      .expect(200);

    const [sql, params] =
      mockQuery.mock.calls[1];

    expect(sql).toContain(
      '(s.closed_at, s.id) <'
    );

    expect(params).toContain(
      '2026-09-15T09:00:00.000Z'
    );

    expect(params).toContain(
      '22222222-2222-2222-2222-222222222222'
    );
  });

  test('rejects malformed cursor before list query', async () => {
    const response = await request(buildApp())
      .get('/shifts/cursor?cursor=not-a-valid-cursor')
      .set('x-role', 'business_owner')
      .expect(422);

    expect(response.body.code).toBe(
      'INVALID_CURSOR'
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('caps limit at 100', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await request(buildApp())
      .get('/shifts/cursor?limit=9999')
      .set('x-role', 'business_owner')
      .expect(200);

    const params =
      mockQuery.mock.calls[1][1];

    expect(params.at(-1)).toBe(101);
  });

  test('preserves agent branch and flagged filters', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await request(buildApp())
      .get(
        '/shifts/cursor' +
          '?agent_id=agent-x' +
          '&branch_id=branch-x' +
          '&flagged_only=true'
      )
      .set('x-role', 'business_owner')
      .expect(200);

    const [sql, params] =
      mockQuery.mock.calls[1];

    expect(sql).toContain(
      's.agent_id'
    );
    expect(sql).toContain(
      's.branch_id'
    );
    expect(sql).toContain(
      'ABS('
    );

    expect(params).toContain(
      'agent-x'
    );
    expect(params).toContain(
      'branch-x'
    );
    expect(params).toContain(20);
  });

  test('manager query keeps company and manager scope', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await request(buildApp())
      .get('/shifts/cursor')
      .set('x-role', 'manager')
      .set('x-user-id', 'manager-9')
      .set('x-company-id', 'company-9')
      .expect(200);

    const [sql, params] =
      mockQuery.mock.calls[1];

    expect(sql).toContain(
      's.company_id'
    );
    expect(sql).toContain(
      'branch_managers'
    );
    expect(sql).toContain(
      'bm.manager_id'
    );

    expect(params).toContain(
      'company-9'
    );
    expect(params).toContain(
      'manager-9'
    );
  });

  test('superuser does not receive company scope', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await request(buildApp())
      .get('/shifts/cursor')
      .set('x-role', 'superuser')
      .expect(200);

    const [sql] =
      mockQuery.mock.calls[1];

    expect(sql).not.toContain(
      's.company_id ='
    );
  });

  test('unauthorized role is rejected', async () => {
    await request(buildApp())
      .get('/shifts/cursor')
      .set('x-role', 'agent')
      .expect(403);

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
