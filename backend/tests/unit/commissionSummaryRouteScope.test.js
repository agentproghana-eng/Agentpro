const express = require('express');
const request = require('supertest');

const mockGetCommissionSummary = jest.fn();

jest.mock('../../src/services/commissionService', () => ({
  getCommissionSummary: (...args) =>
    mockGetCommissionSummary(...args),
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: req.headers['x-test-user-id'],
      company_id: req.headers['x-test-company-id'],
      role: req.headers['x-test-role'],
    };
    next();
  },
  authorize: () => (req, res, next) => next(),
}));

const commissionRoutes =
  require('../../src/routes/commission.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/commission', commissionRoutes);
  return app;
}

describe('commission summary route manager scope', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetCommissionSummary.mockResolvedValue([]);
  });

  test('passes authenticated manager identity into commission summary scope', async () => {
    const app = makeApp();

    const response = await request(app)
      .get('/commission/summary')
      .set('x-test-user-id', 'manager-1')
      .set('x-test-company-id', 'company-1')
      .set('x-test-role', 'manager')
      .query({
        branch_id: 'branch-unmanaged',
        agent_id: 'agent-selected',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
        group_by: 'month',
      });

    expect(response.status).toBe(200);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledTimes(1);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith({
        company_id: 'company-1',
        manager_id: 'manager-1',
        agent_id: 'agent-selected',
        branch_id: 'branch-unmanaged',
        provider: undefined,
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
        group_by: 'month',
      });
  });

  test('does not pass manager scope for a business owner', async () => {
    const app = makeApp();

    const response = await request(app)
      .get('/commission/summary')
      .set('x-test-user-id', 'owner-1')
      .set('x-test-company-id', 'company-1')
      .set('x-test-role', 'business_owner')
      .query({
        branch_id: 'branch-1',
      });

    expect(response.status).toBe(200);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-1',
          manager_id: undefined,
          branch_id: 'branch-1',
        })
      );
  });

  test('forces an agent to their authenticated agent id', async () => {
    const app = makeApp();

    const response = await request(app)
      .get('/commission/summary')
      .set('x-test-user-id', 'agent-auth')
      .set('x-test-company-id', 'company-1')
      .set('x-test-role', 'agent')
      .query({
        agent_id: 'agent-other',
      });

    expect(response.status).toBe(200);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-1',
          manager_id: undefined,
          agent_id: 'agent-auth',
        })
      );
  });
});
