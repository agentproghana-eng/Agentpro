const mockQuery = jest.fn();
const mockGenerateCSV = jest.fn(() => 'csv-output');
const mockGeneratePersonalTransactionReportPDF = jest.fn(
  async () => Buffer.from('pdf-output'),
);

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
  generatePersonalTransactionReportPDF: (...args) =>
    mockGeneratePersonalTransactionReportPDF(...args),
  generateCSV: (...args) => mockGenerateCSV(...args),
}));

const personalReportController =
  require('../../src/controllers/personalReportController');

function makeRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('personalReportController activity reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reports all filtered app-performed Personal transactions without accounting classification', async () => {
    const rows = [
      {
        transaction_type: 'send_money_same_network',
        amount: '100.00',
        status: 'success',
      },
      {
        transaction_type: 'buy_airtime',
        amount: '50.00',
        status: 'failed',
      },
      {
        transaction_type: 'check_momo_balance',
        amount: null,
        status: 'success',
      },
      {
        transaction_type: 'withdraw_cash',
        amount: '200.00',
        status: 'pending_confirmation',
      },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({
        rows: [{
          count: '4',
          success_count: '2',
          failed_count: '1',
          pending_count: '1',
          success_rate: '50.0',
        }],
      });

    const req = {
      user: { id: 'personal-user-1' },
      query: {
        format: 'csv',
        from_date: '2026-08-01T00:00:00.000Z',
        to_date: '2026-08-11T23:59:59.999Z',
      },
    };

    const res = makeRes();

    await personalReportController.transactionReport(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [rowSql, rowParams] = mockQuery.mock.calls[0];
    const [summarySql, summaryParams] = mockQuery.mock.calls[1];

    expect(rowSql).toContain('FROM personal_transactions');
    expect(rowSql).not.toContain('transaction_type::text = ANY');
    expect(summarySql).not.toContain('SUM(amount)');
    expect(summarySql).not.toContain('transaction_type::text = ANY');

    expect(summarySql).toContain(
      "COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count",
    );
    expect(summarySql).toContain(
      "COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count",
    );
    expect(summarySql).toContain(
      "COUNT(CASE WHEN status = 'pending_confirmation' THEN 1 END) as pending_count",
    );

    expect(rowParams).toEqual([
      'personal-user-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-11T23:59:59.999Z',
    ]);

    expect(summaryParams).toEqual(rowParams);

    expect(mockGenerateCSV).toHaveBeenCalledWith(
      rows,
      expect.any(Array),
    );

    expect(res.send).toHaveBeenCalledWith('csv-output');
  });

  test('keeps provider, transaction type and status filters as activity filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          count: '0',
          success_count: '0',
          failed_count: '0',
          pending_count: '0',
          success_rate: null,
        }],
      });

    const req = {
      user: { id: 'personal-user-1' },
      query: {
        format: 'csv',
        provider: 'telecel',
        transaction_type: 'withdraw_cash',
        status: 'success',
      },
    };

    const res = makeRes();

    await personalReportController.transactionReport(req, res);

    const [rowSql, rowParams] = mockQuery.mock.calls[0];
    const [summarySql, summaryParams] = mockQuery.mock.calls[1];

    expect(rowSql).toContain('provider = $2');
    expect(rowSql).toContain('transaction_type = $3');
    expect(rowSql).toContain('status = $4');

    expect(summarySql).toContain('provider = $2');
    expect(summarySql).toContain('transaction_type = $3');
    expect(summarySql).toContain('status = $4');

    expect(rowParams).toEqual([
      'personal-user-1',
      'telecel',
      'withdraw_cash',
      'success',
      expect.any(String),
    ]);

    // The controller supplies a current-time upper bound when the caller
    // does not provide an explicit report date range.
    expect(Number.isNaN(Date.parse(rowParams[4]))).toBe(false);

    // Row and summary queries must use the exact same activity scope.
    expect(summaryParams).toEqual(rowParams);
  });

  test('passes activity counts to the Personal PDF generator', async () => {
    const rows = [
      {
        transaction_type: 'buy_data',
        amount: '10.00',
        status: 'success',
      },
    ];

    const summary = {
      count: '1',
      success_count: '1',
      failed_count: '0',
      pending_count: '0',
      success_rate: '100.0',
    };

    mockQuery
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [summary] });

    const req = {
      user: { id: 'personal-user-1' },
      query: {
        format: 'pdf',
        period: 'month',
      },
    };

    const res = makeRes();

    await personalReportController.transactionReport(req, res);

    expect(mockGeneratePersonalTransactionReportPDF)
      .toHaveBeenCalledWith({
        transactions: rows,
        summary,
        title: 'My Transaction Report — month',
      });

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );

    expect(res.send).toHaveBeenCalledWith(
      Buffer.from('pdf-output'),
    );
  });
});
