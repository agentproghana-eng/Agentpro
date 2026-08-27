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
const { auditLog } = require('../../src/services/auditService');
const shiftController = require('../../src/controllers/shiftController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Shift canonical cash drawer accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('openShift reads opening cash only from agent_cash_balances', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ total: '350.00' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'shift-1',
            agent_id: 'agent-1',
            branch_id: 'branch-1',
            company_id: 'company-1',
            opening_cash_expected: '350.00',
            status: 'open',
          }],
        }),
    };

    query.mockResolvedValueOnce({
      rows: [{ branch_id: 'branch-1' }],
    });

    withTransaction.mockImplementation(async (callback) => callback(client));
    auditLog.mockResolvedValue();

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        opening_cash_declared: '350.00',
      },
      ip: '127.0.0.1',
      requestId: 'request-1',
    };
    const res = makeRes();

    await shiftController.openShift(req, res);

    expect(client.query).toHaveBeenCalledTimes(2);

    const [cashSql, cashParams] = client.query.mock.calls[0];

    expect(cashSql).toContain('FROM agent_cash_balances');
    expect(cashSql).not.toContain('FROM agent_balances');
    expect(cashParams).toEqual(['agent-1']);

    const [insertSql, insertParams] = client.query.mock.calls[1];

    expect(insertSql).toContain('INSERT INTO shifts');
    expect(insertParams).toEqual([
      'agent-1',
      'branch-1',
      'company-1',
      350,
      350,
      0,
    ]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  test('closeShift reads closing expected cash only from agent_cash_balances', async () => {
    const openShift = {
      id: 'shift-1',
      agent_id: 'agent-1',
      company_id: 'company-1',
      status: 'open',
      opened_at: '2026-08-10T05:00:00.000Z',
      opening_cash_variance: '10.00',
    };

    query
      .mockResolvedValueOnce({
        rows: [openShift],
      })
      .mockResolvedValueOnce({
        rows: [{ value: '20.00' }],
      });

    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ total: '410.00' }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '3' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            ...openShift,
            status: 'closed',
            closing_cash_expected: '410.00',
            closing_cash_actual: '425.00',
            variance: '15.00',
            transaction_count: 3,
          }],
        }),
    };

    withTransaction.mockImplementation(async (callback) => callback(client));
    auditLog.mockResolvedValue();

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      params: {
        shift_id: 'shift-1',
      },
      body: {
        closing_cash_actual: '425.00',
        notes: 'Counted at close',
      },
      ip: '127.0.0.1',
      requestId: 'request-2',
    };
    const res = makeRes();

    await shiftController.closeShift(req, res);

    const [cashSql, cashParams] = client.query.mock.calls[0];

    expect(cashSql).toContain('FROM agent_cash_balances');
    expect(cashSql).not.toContain('FROM agent_balances');
    expect(cashParams).toEqual(['agent-1']);

    const [updateSql, updateParams] = client.query.mock.calls[3];

    expect(updateSql).toContain('UPDATE shifts SET');
    expect(updateParams).toEqual([
      410,
      425,
      15,
      425,
      15,
      3,
      'Counted at close',
      'shift-1',
    ]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        closing_cash_expected: '410.00',
        closing_cash_actual: '425.00',
        variance: '15.00',
        opening_ledger_variance: 10,
        closing_ledger_variance: 15,
        net_shift_variance: 5,
        flagged: false,
        threshold: 20,
      }),
    });

    expect(auditLog).toHaveBeenCalledTimes(1);
  });
});
