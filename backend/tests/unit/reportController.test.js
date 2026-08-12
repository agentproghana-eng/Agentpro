const mockQuery = jest.fn();
const mockGenerateCSV = jest.fn(() => 'csv-output');

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

jest.mock('../../src/services/reportService', () => ({
  generateTransactionReportPDF: jest.fn(),
  generateTransactionReportExcel: jest.fn(),
  generateCommissionReportPDF: jest.fn(),
  generateCommissionReportExcel: jest.fn(),
  generateCSV: (...args) => mockGenerateCSV(...args),
}));

const mockGetCommissionSummary = jest.fn();

jest.mock('../../src/services/commissionService', () => ({
  getCommissionSummary: (...args) =>
    mockGetCommissionSummary(...args),
}));

const reportController =
  require('../../src/controllers/reportController');

const {
  CUSTOMER_VOLUME_TRANSACTION_TYPES,
} = require('../../src/config/reportClassification');

function makeRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('reportController transaction report accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses only successful canonical customer transactions for reported volume', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { transaction_type: 'cash_in', amount: '100.00' },
          { transaction_type: 'float_received', amount: '5000.00' },
          { transaction_type: 'merchant_payment', amount: '300.00' },
          { transaction_type: 'working_to_float', amount: '2000.00' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{
          count: '4',
          total_amount: '100.00',
          total_commission: '1.00',
          success_rate: '100.0',
        }],
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'csv',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-11T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.transactionReport(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [rowSql, rowParams] = mockQuery.mock.calls[0];
    const [summarySql, summaryParams] = mockQuery.mock.calls[1];

    // Transaction-history/report rows themselves remain unfiltered by
    // accounting classification.
    expect(rowSql).not.toContain(
      'CUSTOMER_VOLUME_TRANSACTION_TYPES',
    );
    expect(rowSql).not.toContain(
      'transaction_type::text = ANY',
    );

    expect(rowParams).toEqual([
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-11T23:59:59.999Z',
    ]);

    // Only successful canonical customer-service transactions contribute
    // their principal amount to the volume summary.
    expect(summarySql).toContain(
      "WHEN t.status = 'success'",
    );
    expect(summarySql).toContain(
      't.transaction_type::text = ANY($4::text[])',
    );

    // Commission is recognized only for successful transactions.
    expect(summarySql).toMatch(
      /WHEN t\.status = 'success' THEN cm\.net_commission/
    );

    expect(summaryParams).toEqual([
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-11T23:59:59.999Z',
      CUSTOMER_VOLUME_TRANSACTION_TYPES,
    ]);

    expect(summaryParams[3]).toEqual([
      'cash_in',
      'cash_out',
      'send_money',
      'airtime',
      'data_bundle',
      'bill_payment',
    ]);

    expect(summaryParams[3]).not.toContain('float_received');
    expect(summaryParams[3]).not.toContain('merchant_payment');
    expect(summaryParams[3]).not.toContain('working_to_float');
    expect(summaryParams[3]).not.toContain('float_to_working');

    expect(res.send).toHaveBeenCalledWith('csv-output');
  });
});

describe('reportController dashboard accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns explicit today customer volume, commission, and customer transaction count', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '3',
          customer_volume: '450.00',
          commission: '6.50',
          success_count: '5',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '10',
          customer_volume: '1000.00',
          commission: '20.00',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [todaySql, todayParams] = mockQuery.mock.calls[0];

    expect(todaySql).toContain(
      "t.status = 'success'",
    );
    expect(todaySql).toContain(
      't.transaction_type::text = ANY($2::text[])',
    );

    // Today's commission follows the same settled-transaction rule.
    expect(todaySql).toMatch(
      /WHEN t\.status = 'success' THEN cm\.net_commission/
    );

    expect(todayParams[1]).toEqual(
      CUSTOMER_VOLUME_TRANSACTION_TYPES,
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        today_volume: 450,
        today_commission: 6.5,
        today_transactions: 3,
      }),
    });
  });
});

describe('reportController dashboard treasury scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('agent dashboard does not query or expose business branch treasury float', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
          success_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(
      req,
      res
    );

    expect(mockQuery)
      .toHaveBeenCalledTimes(3);

    for (const [sql] of mockQuery.mock.calls) {
      expect(String(sql)).not.toContain(
        'FROM float_accounts'
      );
    }

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          float_by_provider: [],
        }),
      });
  });

  test('manager dashboard treasury is restricted to managed branches', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
          success_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          total: '900.00',
          provider: 'mtn',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'manager-1',
        company_id: 'company-1',
        role: 'manager',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(
      req,
      res
    );

    expect(mockQuery)
      .toHaveBeenCalledTimes(4);

    const floatCall =
      mockQuery.mock.calls.find(
        ([sql]) =>
          String(sql).includes(
            'FROM float_accounts'
          )
      );

    expect(floatCall).toBeDefined();

    const [floatSql, floatParams] =
      floatCall;

    expect(floatSql).toContain(
      'FROM branch_managers bm'
    );

    expect(floatSql).toContain(
      'bm.manager_id = $2'
    );

    expect(floatParams).toEqual([
      'company-1',
      'manager-1',
    ]);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          float_by_provider: [
            {
              total: '900.00',
              provider: 'mtn',
            },
          ],
        }),
      });
  });

  test('business owner dashboard treasury covers active own-company branches', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
          success_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          total: '1500.00',
          provider: 'telecel',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'owner-1',
        company_id: 'company-1',
        role: 'business_owner',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(
      req,
      res
    );

    const floatCall =
      mockQuery.mock.calls.find(
        ([sql]) =>
          String(sql).includes(
            'FROM float_accounts'
          )
      );

    expect(floatCall).toBeDefined();

    const [floatSql, floatParams] =
      floatCall;

    expect(floatSql).toContain(
      'b.company_id = $1'
    );

    expect(floatSql).not.toContain(
      'FROM branch_managers bm'
    );

    expect(floatParams).toEqual([
      'company-1',
    ]);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          float_by_provider: [
            {
              total: '1500.00',
              provider: 'telecel',
            },
          ],
        }),
      });
  });
});

describe('reportController dashboard treasury remaining roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('auditor dashboard treasury is limited to active own-company branches', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
          success_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          total: '725.00',
          provider: 'at_money',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'auditor-1',
        company_id: 'company-1',
        role: 'auditor',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(
      req,
      res
    );

    expect(mockQuery)
      .toHaveBeenCalledTimes(4);

    const floatCall =
      mockQuery.mock.calls.find(
        ([sql]) =>
          String(sql).includes(
            'FROM float_accounts'
          )
      );

    expect(floatCall).toBeDefined();

    const [floatSql, floatParams] =
      floatCall;

    expect(floatSql).toContain(
      'b.company_id = $1'
    );

    expect(floatSql).toContain(
      "b.status = 'active'"
    );

    expect(floatSql).not.toContain(
      'FROM branch_managers bm'
    );

    expect(floatParams).toEqual([
      'company-1',
    ]);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          float_by_provider: [
            {
              total: '725.00',
              provider: 'at_money',
            },
          ],
        }),
      });
  });

  test('superuser dashboard does not expose treasury without explicit company context', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
          success_count: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '0',
          customer_volume: '0',
          commission: '0',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'super-1',
        company_id: null,
        role: 'superuser',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(
      req,
      res
    );

    expect(mockQuery)
      .toHaveBeenCalledTimes(3);

    for (const [sql] of mockQuery.mock.calls) {
      expect(String(sql)).not.toContain(
        'FROM float_accounts'
      );
    }

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          float_by_provider: [],
        }),
      });
  });
});

describe('reportController monthly dashboard accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses only successful customer transactions for this-month count and volume', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '2',
          customer_volume: '250.00',
          commission: '4.00',
          success_count: '4',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          customer_transaction_count: '7',
          customer_volume: '1250.00',
          commission: '18.50',
        }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
    };

    const res = makeRes();

    await reportController.dashboardSummary(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [monthSql, monthParams] = mockQuery.mock.calls[1];

    expect(monthSql).toContain(
      "t.status = 'success'",
    );
    expect(monthSql).toContain(
      't.transaction_type::text = ANY($2::text[])',
    );

    expect(monthParams).toHaveLength(2);
    expect(monthParams[1]).toEqual(
      CUSTOMER_VOLUME_TRANSACTION_TYPES,
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        this_month: {
          transaction_count: 7,
          total_amount: 1250,
          net_commission: 18.5,
        },
      }),
    });
  });
});


describe('reportController commission report security and periods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockGetCommissionSummary.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('forces an agent commission report to the authenticated agent', async () => {
    const req = {
      user: {
        id: 'agent-authenticated',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'csv',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T10:00:00.000Z',
        agent_id: 'agent-other',
      },
    };

    const res = makeRes();

    await reportController.commissionReport(req, res);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledTimes(1);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-1',
          agent_id: 'agent-authenticated',
          from_date: '2026-08-01T00:00:00.000Z',
          to_date: '2026-08-12T10:00:00.000Z',
        })
      );

    expect(mockGetCommissionSummary)
      .not.toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-other',
        })
      );

    expect(res.send)
      .toHaveBeenCalledWith('csv-output');
  });

  test('allows owner commission reports to use an explicit agent filter', async () => {
    const req = {
      user: {
        id: 'owner-1',
        company_id: 'company-1',
        role: 'business_owner',
      },
      query: {
        format: 'csv',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T10:00:00.000Z',
        agent_id: 'agent-selected',
      },
    };

    const res = makeRes();

    await reportController.commissionReport(req, res);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-1',
          agent_id: 'agent-selected',
        })
      );
  });

  test.each([
    ['today'],
    ['week'],
    ['month'],
    ['year'],
  ])(
    'uses the shared %s period range for commission reports',
    async (period) => {
      const fixedNow =
        new Date('2026-08-12T10:34:00.000Z');

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      const req = {
        user: {
          id: 'owner-1',
          company_id: 'company-1',
          role: 'business_owner',
        },
        query: {
          format: 'csv',
          period,
        },
      };

      const res = makeRes();

      await reportController.commissionReport(req, res);

      expect(mockGetCommissionSummary)
        .toHaveBeenCalledTimes(1);

      const params =
        mockGetCommissionSummary.mock.calls[0][0];

      expect(params.to_date)
        .toBe(fixedNow.toISOString());

      expect(params.from_date)
        .toEqual(expect.any(String));

      const actualFrom =
        new Date(params.from_date);

      const expectedFrom =
        new Date(fixedNow);

      if (period === 'today') {
        expectedFrom.setHours(0, 0, 0, 0);
      }

      if (period === 'week') {
        expectedFrom.setDate(
          expectedFrom.getDate() - 7
        );
      }

      if (period === 'month') {
        expectedFrom.setDate(1);
        expectedFrom.setHours(0, 0, 0, 0);
      }

      if (period === 'year') {
        expectedFrom.setMonth(0, 1);
        expectedFrom.setHours(0, 0, 0, 0);
      }

      expect(actualFrom.toISOString())
        .toBe(expectedFrom.toISOString());
    }
  );
});
