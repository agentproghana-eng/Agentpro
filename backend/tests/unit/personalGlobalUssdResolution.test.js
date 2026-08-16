'use strict';

const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: jest.fn(),
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

jest.mock('../../src/utils/ussdFlowValidation', () => ({
  validateFlowSteps: jest.fn(() => null),
}));

jest.mock('../../src/utils/ussdFlowMetadataValidation', () => ({
  validateFlowMetadata: jest.fn(() => null),
}));

jest.mock('../../src/utils/ussdFlowCapabilities', () => ({
  getFlowBuilderCapabilities: jest.fn(),
  getFlowBuilderEligibility: jest.fn(),
}));

const controller =
  require('../../src/controllers/personalUssdFlowController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function flow(id, ownerUserId = null) {
  return {
    id,
    provider: 'mtn',
    transaction_type: 'send_money_same_network',
    dial_code: '*170#',
    success_markers: [],
    failure_markers: [],
    company_id: null,
    owner_user_id: ownerUserId,
    is_active: true,
  };
}

describe('Personal Global USSD runtime access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Free Personal resolves Global directly without querying Personal override', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [flow('global-flow')],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['transfer money'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: { id: 'personal-user-1' },
      personalSubscription: {
        plan: 'free',
        expires_at: null,
      },
      query: {
        provider: 'mtn',
        transaction_type: 'send_money_same_network',
      },
    };

    const res = makeRes();

    await controller.resolveFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [globalSql, globalParams] = mockQuery.mock.calls[0];

    expect(globalSql).toContain('owner_user_id IS NULL');
    expect(globalSql).not.toContain('owner_user_id = $1');

    expect(globalParams).toEqual([
      'mtn',
      'send_money_same_network',
      null,
      null,
    ]);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: 'global-flow',
        owner_user_id: null,
      }),
    });
  });

  test('Paid Personal may resolve its own override before Global', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [flow('personal-flow', 'personal-user-1')],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['transfer money'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: { id: 'personal-user-1' },
      personalSubscription: {
        plan: 'paid',
        expires_at: '2099-12-31T23:59:59.999Z',
      },
      query: {
        provider: 'mtn',
        transaction_type: 'send_money_same_network',
      },
    };

    const res = makeRes();

    await controller.resolveFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [personalSql, personalParams] = mockQuery.mock.calls[0];

    expect(personalSql).toContain('owner_user_id = $1');

    expect(personalParams).toEqual([
      'personal-user-1',
      'mtn',
      'send_money_same_network',
      null,
      null,
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: 'personal-flow',
        owner_user_id: 'personal-user-1',
      }),
    });
  });

  test('expired Paid Personal resolves Global only', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [flow('global-flow')],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: { id: 'personal-user-1' },
      personalSubscription: {
        plan: 'paid',
        expires_at: '2000-01-01T00:00:00.000Z',
      },
      query: {
        provider: 'mtn',
        transaction_type: 'send_money_same_network',
      },
    };

    const res = makeRes();

    await controller.resolveFlow(req, res);

    const [sql] = mockQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(sql).not.toContain('owner_user_id = $1');
  });

  test('resolve route is Free-capable while Flow Builder remains Paid-only', () => {
    const routeSource = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/routes/personalUssdFlow.routes.js'
      ),
      'utf8'
    );

    const personalGate = routeSource.indexOf(
      'router.use(authenticate, requirePersonalAccount);'
    );

    const resolveRoute = routeSource.indexOf(
      "router.get('/resolve', personalUssdFlowController.resolveFlow);"
    );

    const paidGate = routeSource.indexOf(
      'router.use(requirePaidPersonalPlan);'
    );

    const capabilities = routeSource.indexOf(
      "router.get('/capabilities'"
    );

    expect(personalGate).toBeGreaterThanOrEqual(0);
    expect(resolveRoute).toBeGreaterThan(personalGate);
    expect(paidGate).toBeGreaterThan(resolveRoute);
    expect(capabilities).toBeGreaterThan(paidGate);
  });
});
