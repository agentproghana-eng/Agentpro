const { EventEmitter } = require('events');

const mockQuery = jest.fn();
const mockStreamQueryBatches = jest.fn();
const mockGenerateTransactionReportPDFStream =
  jest.fn();
const mockGenerateTransactionReportExcelStream =
  jest.fn();
const mockGenerateCSV = jest.fn(() => 'csv-output');

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  streamQueryBatches: (...args) =>
    mockStreamQueryBatches(...args),
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
  generateTransactionReportPDFStream:
    (...args) =>
      mockGenerateTransactionReportPDFStream(
        ...args
      ),
  generateTransactionReportExcel: jest.fn(),
  generateTransactionReportExcelStream:
    (...args) =>
      mockGenerateTransactionReportExcelStream(
        ...args
      ),
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

function resetReportMocks() {
  jest.resetAllMocks();

  // resetAllMocks intentionally clears implementations as well as
  // call history. Restore shared baseline behavior required by tests
  // that exercise the legacy Commission CSV generator.
  mockGenerateCSV.mockReturnValue('csv-output');
}

function makeRes() {
  const res = new EventEmitter();

  res.setHeader = jest.fn();
  res.send = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn();
  res.write = jest.fn(() => true);
  res.end = jest.fn();
  res.destroy = jest.fn();
  res.headersSent = false;
  res.writableEnded = false;

  return res;
}

describe('reportController transaction report accounting', () => {
  beforeEach(() => {
    resetReportMocks();

    mockGenerateTransactionReportPDFStream
      .mockImplementation(
        async ({
          writeTransactions,
        }) => {
          await writeTransactions(
            async () => {}
          );
        }
      );

    mockStreamQueryBatches
      .mockResolvedValue();
  });

  test('uses only successful canonical customer transactions for reported volume', async () => {
    mockQuery.mockResolvedValueOnce({
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
        format: 'pdf',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-11T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.transactionReport(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [
      summarySql,
      summaryParams,
    ] = mockQuery.mock.calls[0];

    // Only successful canonical customer-service transactions contribute
    // their principal amount to the volume summary.
    expect(summarySql).toContain(
      "WHEN t.status = 'success'",
    );
    expect(summarySql).toMatch(
      /t\.transaction_type::text\s*=\s*ANY\(\$4::text\[\]\)/
    );

    // Commission is recognized only for successful transactions.
    expect(summarySql).toMatch(
      /WHEN\s+t\.status\s*=\s*'success'\s+THEN\s+cm\.net_commission/
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

    expect(
      mockGenerateTransactionReportPDFStream
    ).toHaveBeenCalledTimes(1);
  });
});


describe('reportController transaction CSV streaming', () => {
  beforeEach(() => {
    resetReportMocks();
  });

  function makeTransaction(index) {
    return {
      id: `tx-id-${index}`,
      created_at: '2026-08-12T10:00:00.000Z',
      reference: `REF-${index}`,
      network_reference: `NET-${index}`,
      transaction_type: 'cash_in',
      provider: 'mtn',
      customer_phone: '0240000000',
      customer_name: `Customer ${index}`,
      amount: '100.00',
      fee: '1.00',
      net_commission: '0.50',
      status: 'success',
      agent_name: 'Agent One',
      branch_name: 'Main Branch',
    };
  }

  test('streams more than 5000 transactions without the legacy export cap', async () => {
    mockStreamQueryBatches.mockImplementation(
      async (sql, params, options) => {
        expect(options.batchSize).toBe(500);

        let nextIndex = 1;

        for (let batch = 0; batch < 10; batch++) {
          const rows = Array.from(
            { length: 500 },
            () => makeTransaction(nextIndex++)
          );

          await options.onRows(rows);
        }

        await options.onRows([
          makeTransaction(nextIndex++),
        ]);
      }
    );

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'csv',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.transactionReport(req, res);

    expect(mockQuery).not.toHaveBeenCalled();

    expect(mockStreamQueryBatches)
      .toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
      options,
    ] = mockStreamQueryBatches.mock.calls[0];

    expect(sql).not.toMatch(
      /LIMIT\s+5000/i
    );

    expect(sql).toContain(
      'ORDER BY'
    );

    expect(sql).toContain(
      't.id DESC'
    );

    expect(params).toEqual([
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);

    expect(options.batchSize).toBe(500);

    // Header + 11 data chunks:
    // 10 x 500 rows + 1 final row = 5,001 rows.
    expect(res.write).toHaveBeenCalledTimes(12);

    const output = res.write.mock.calls
      .map(([chunk]) => String(chunk))
      .join('');

    expect(output).toContain(
      '"REF-1"'
    );

    expect(output).toContain(
      '"REF-5000"'
    );

    expect(output).toContain(
      '"REF-5001"'
    );

    const dataLineCount =
      output.trim().split('\n').length - 1;

    expect(dataLineCount).toBe(5001);

    expect(res.setHeader)
      .toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('waits for response drain when CSV backpressure is applied', async () => {
    mockStreamQueryBatches.mockImplementation(
      async (sql, params, options) => {
        await options.onRows([
          makeTransaction(1),
        ]);
      }
    );

    // Header writes immediately. The first data chunk fills the
    // response buffer and must wait for a drain event.
    const res = makeRes();

    res.write
      .mockImplementationOnce(() => true)
      .mockImplementationOnce(() => {
        setImmediate(() => {
          res.emit('drain');
        });

        return false;
      });

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'csv',
        period: 'today',
      },
    };

    await reportController.transactionReport(req, res);

    expect(res.write).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.destroy).not.toHaveBeenCalled();
  });
});


describe('reportController transaction Excel streaming', () => {
  beforeEach(() => {
    resetReportMocks();
  });

  function makeTransaction(index) {
    return {
      id: `tx-excel-${index}`,
      created_at: '2026-08-12T10:00:00.000Z',
      reference: `XLSX-REF-${index}`,
      transaction_type: 'cash_in',
      provider: 'mtn',
      amount: '100.00',
      fee: '1.00',
      net_commission: '0.50',
      status: 'success',
      agent_name: 'Agent One',
      branch_name: 'Main Branch',
    };
  }

  test('streams more than 5000 Excel transaction rows without the legacy cap', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        count: '5001',
        total_amount: '500100.00',
        total_commission: '2500.50',
        success_rate: '100.0',
      }],
    });

    mockStreamQueryBatches.mockImplementation(
      async (sql, params, options) => {
        expect(options.batchSize).toBe(500);

        let nextIndex = 1;

        for (let batch = 0; batch < 10; batch++) {
          const rows = Array.from(
            { length: 500 },
            () => makeTransaction(nextIndex++)
          );

          await options.onRows(rows);
        }

        await options.onRows([
          makeTransaction(nextIndex++),
        ]);
      }
    );

    const writtenRows = [];

    mockGenerateTransactionReportExcelStream
      .mockImplementation(
        async ({
          summary,
          writeTransactions,
        }) => {
          expect(summary).toEqual(
            expect.objectContaining({
              count: '5001',
            })
          );

          await writeTransactions(
            async (row) => {
              writtenRows.push(row);
            }
          );
        }
      );

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'excel',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.transactionReport(
      req,
      res
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockStreamQueryBatches)
      .toHaveBeenCalledTimes(1);

    const [
      rowSql,
      rowParams,
      options,
    ] = mockStreamQueryBatches.mock.calls[0];

    expect(rowSql).not.toMatch(
      /LIMIT\s+5000/i
    );

    expect(rowSql).toContain(
      't.id DESC'
    );

    expect(rowParams).toEqual([
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);

    expect(options.batchSize).toBe(500);

    expect(writtenRows).toHaveLength(5001);

    expect(writtenRows[0].reference)
      .toBe('XLSX-REF-1');

    expect(writtenRows[4999].reference)
      .toBe('XLSX-REF-5000');

    expect(writtenRows[5000].reference)
      .toBe('XLSX-REF-5001');

    expect(
      mockGenerateTransactionReportExcelStream
    ).toHaveBeenCalledTimes(1);

    expect(res.setHeader)
      .toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.send).not.toHaveBeenCalled();
  });
});


describe('reportController transaction PDF streaming', () => {
  beforeEach(() => {
    resetReportMocks();
  });

  function makeTransaction(index) {
    return {
      id: `tx-pdf-${index}`,
      created_at:
        '2026-08-12T10:00:00.000Z',
      reference:
        `PDF-REF-${index}`,
      transaction_type:
        'cash_in',
      provider:
        'mtn',
      customer_phone:
        '0240000000',
      amount:
        '100.00',
      fee:
        '1.00',
      net_commission:
        '0.50',
      status:
        'success',
      agent_name:
        'Agent One',
      branch_name:
        'Main Branch',
    };
  }

  test('streams more than 5000 PDF transaction rows without a legacy cap', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        count: '5001',
        total_amount:
          '500100.00',
        total_commission:
          '2500.50',
        success_rate:
          '100.0',
      }],
    });

    mockStreamQueryBatches
      .mockImplementation(
        async (
          sql,
          params,
          options
        ) => {
          let nextIndex = 1;

          for (
            let batch = 0;
            batch < 10;
            batch++
          ) {
            const rows =
              Array.from(
                {
                  length: 500,
                },
                () =>
                  makeTransaction(
                    nextIndex++
                  )
              );

            await options.onRows(
              rows
            );
          }

          await options.onRows([
            makeTransaction(
              nextIndex++
            ),
          ]);
        }
      );

    const writtenRows = [];

    mockGenerateTransactionReportPDFStream
      .mockImplementation(
        async ({
          summary,
          writeTransactions,
        }) => {
          expect(summary).toEqual(
            expect.objectContaining({
              count: '5001',
            })
          );

          await writeTransactions(
            async (row) => {
              writtenRows.push(
                row
              );
            }
          );
        }
      );

    const req = {
      user: {
        id: 'agent-1',
        company_id: 'company-1',
        role: 'agent',
      },
      query: {
        format: 'pdf',
        from_date:
          '2026-08-01T00:00:00.000Z',
        to_date:
          '2026-08-12T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController
      .transactionReport(
        req,
        res
      );

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

    expect(
      mockStreamQueryBatches
    ).toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
      options,
    ] =
      mockStreamQueryBatches
        .mock.calls[0];

    expect(sql).not.toMatch(
      /LIMIT\s+5000/i
    );

    expect(sql).toContain(
      't.id DESC'
    );

    expect(params).toEqual([
      'agent-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);

    expect(options.batchSize)
      .toBe(500);

    expect(writtenRows)
      .toHaveLength(5001);

    expect(
      writtenRows[4999]
        .reference
    ).toBe(
      'PDF-REF-5000'
    );

    expect(
      writtenRows[5000]
        .reference
    ).toBe(
      'PDF-REF-5001'
    );

    expect(
      mockGenerateTransactionReportPDFStream
    ).toHaveBeenCalledTimes(1);

    expect(res.setHeader)
      .toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf'
      );

    expect(res.end)
      .toHaveBeenCalledTimes(1);

    expect(res.send)
      .not.toHaveBeenCalled();
  });
});


describe('reportController manager report scope', () => {
  beforeEach(() => {
    resetReportMocks();
  });

  test('transaction report intersects an explicit branch with manager assignments', async () => {
    mockStreamQueryBatches.mockResolvedValue();

    const req = {
      user: {
        id: 'manager-1',
        company_id: 'company-1',
        role: 'manager',
      },
      query: {
        format: 'csv',
        branch_id: 'branch-requested',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.transactionReport(
      req,
      res
    );

    expect(mockStreamQueryBatches)
      .toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
    ] = mockStreamQueryBatches.mock.calls[0];

    expect(sql).toContain(
      't.company_id = $1'
    );

    expect(sql).toContain(
      'FROM branch_managers'
    );

    expect(sql).toContain(
      'WHERE manager_id = $2'
    );

    expect(sql).toContain(
      't.branch_id = $3'
    );

    expect(params).toEqual([
      'company-1',
      'manager-1',
      'branch-requested',
      '2026-08-01T00:00:00.000Z',
      '2026-08-12T23:59:59.999Z',
    ]);
  });

  test('transaction count uses the same manager branch scope', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        count: 0,
      }],
    });

    const req = {
      user: {
        id: 'manager-1',
        company_id: 'company-1',
        role: 'manager',
      },
      query: {
        branch_id: 'branch-unmanaged',
      },
    };

    const res = makeRes();

    await reportController.transactionCount(
      req,
      res
    );

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

    const [
      sql,
      params,
    ] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      't.company_id = $1'
    );

    expect(sql).toContain(
      'FROM branch_managers'
    );

    expect(sql).toContain(
      'WHERE manager_id = $2'
    );

    expect(sql).toContain(
      't.branch_id = $3'
    );

    expect(params).toHaveLength(4);

    expect(params.slice(0, 3)).toEqual([
      'company-1',
      'manager-1',
      'branch-unmanaged',
    ]);

    expect(
      new Date(params[3]).toString()
    ).not.toBe('Invalid Date');

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        data: {
          count: 0,
        },
      });
  });

  test('commission report passes manager identity with explicit branch filter', async () => {
    mockGetCommissionSummary
      .mockResolvedValue([]);

    // The requested branch is intentionally unresolved. The title lookup
    // must still be scoped to the authenticated manager so an unmanaged
    // branch name cannot leak through the report title.
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = {
      user: {
        id: 'manager-1',
        company_id: 'company-1',
        role: 'manager',
      },
      query: {
        format: 'csv',
        branch_id: 'branch-unmanaged',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-12T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await reportController.commissionReport(
      req,
      res
    );

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledTimes(1);

    expect(mockGetCommissionSummary)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-1',
          manager_id: 'manager-1',
          branch_id: 'branch-unmanaged',
        })
      );

    expect(mockQuery)
      .toHaveBeenCalledTimes(1);

    const [
      branchSql,
      branchParams,
    ] = mockQuery.mock.calls[0];

    expect(branchSql).toContain(
      'b.id = $1'
    );

    expect(branchSql).toContain(
      'b.company_id = $2'
    );

    expect(branchSql).toContain(
      'FROM branch_managers bm'
    );

    expect(branchSql).toContain(
      'bm.branch_id = b.id'
    );

    expect(branchSql).toContain(
      'bm.manager_id = $3'
    );

    expect(branchParams).toEqual([
      'branch-unmanaged',
      'company-1',
      'manager-1',
    ]);
  });
});

describe('reportController dashboard accounting', () => {
  beforeEach(() => {
    resetReportMocks();
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
    resetReportMocks();
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
    resetReportMocks();
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
    resetReportMocks();
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
    resetReportMocks();
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
