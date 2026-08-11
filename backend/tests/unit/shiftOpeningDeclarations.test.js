jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
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

const {
  auditLog,
} = require('../../src/services/auditService');

const shiftController =
  require('../../src/controllers/shiftController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Shift opening declarations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not open a shift without an explicit opening cash declaration', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        branch_id: 'branch-1',
      }],
    });

    withTransaction.mockResolvedValueOnce({
      id: 'shift-1',
      agent_id: 'agent-1',
      branch_id: 'branch-1',
      company_id: 'company-1',
      opening_cash_expected: '350.00',
      status: 'open',
    });

    auditLog.mockResolvedValue();

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {},
      ip: '127.0.0.1',
      requestId: 'request-1',
    };

    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'opening_cash_declared is required and must be a number',
    });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});

test('stores opening expected, declared, and variance without changing cash at hand', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockResolvedValueOnce({
    rows: [{
      branch_id: 'branch-1',
    }],
  });

  const client = {
    query: jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{
          total: '350.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          branch_id: 'branch-1',
          company_id: 'company-1',
          opening_cash_expected: '350.00',
          opening_cash_declared: '325.00',
          opening_cash_variance: '-25.00',
          status: 'open',
        }],
      }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  auditLog.mockResolvedValue();

  const req = {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      opening_cash_declared: '325.00',
    },
    ip: '127.0.0.1',
    requestId: 'request-2',
  };

  const res = makeRes();

  await shiftController.openShift(req, res);

  expect(client.query).toHaveBeenCalledTimes(2);

  const [cashSql, cashParams] =
    client.query.mock.calls[0];

  expect(cashSql).toContain(
    'FROM agent_cash_balances',
  );
  expect(cashParams).toEqual([
    'agent-1',
  ]);

  const [insertSql, insertParams] =
    client.query.mock.calls[1];

  expect(insertSql).toContain(
    'opening_cash_expected',
  );
  expect(insertSql).toContain(
    'opening_cash_declared',
  );
  expect(insertSql).toContain(
    'opening_cash_variance',
  );

  expect(insertParams).toEqual([
    'agent-1',
    'branch-1',
    'company-1',
    350,
    325,
    -25,
  ]);

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE agent_cash_balances',
  );

  expect(res.status).toHaveBeenCalledWith(201);

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({
      opening_cash_expected: '350.00',
      opening_cash_declared: '325.00',
      opening_cash_variance: '-25.00',
    }),
  });
});

test('rejects a negative opening Cash at Hand declaration before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  const req = {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      opening_cash_declared: '-1.00',
      opening_sim_balances: [],
    },
  };

  const res = makeRes();

  await shiftController.openShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'opening_cash_declared is required and must be a non-negative number',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});
