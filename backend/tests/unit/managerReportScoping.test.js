const mockQuery =
  jest.fn();

const mockGetCommissionSummary =
  jest.fn();

const mockGenerateCSV =
  jest.fn(() => 'csv-output');

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  })
);

jest.mock(
  '../../src/services/reportService',
  () => ({
    generateTransactionReportPDF:
      jest.fn(),
    generateTransactionReportExcel:
      jest.fn(),
    generateCommissionReportPDF:
      jest.fn(),
    generateCommissionReportExcel:
      jest.fn(),
    generateCSV:
      (...args) =>
        mockGenerateCSV(...args),
  })
);

jest.mock(
  '../../src/services/commissionService',
  () => ({
    getCommissionSummary:
      (...args) =>
        mockGetCommissionSummary(
          ...args
        ),
  })
);

const reportController =
  require(
    '../../src/controllers/reportController'
  );

function makeRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
    status:
      jest.fn()
        .mockReturnThis(),
    json: jest.fn(),
  };
}

function manager() {
  return {
    id: 'manager-1',
    company_id: 'company-1',
    role: 'manager',
  };
}

describe(
  'manager report branch scoping',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'transaction count is limited to managed branches',
      async () => {
        mockQuery
          .mockResolvedValue({
            rows: [
              {
                count: 0,
              },
            ],
          });

        const req = {
          user: manager(),
          query: {
            to_date:
              '2026-08-20T00:00:00.000Z',
          },
        };

        const res =
          makeRes();

        await reportController
          .transactionCount(
            req,
            res
          );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(1);

        const [
          sql,
          params,
        ] =
          mockQuery.mock.calls[0];

        expect(sql)
          .toContain(
            't.company_id = $1'
          );

        expect(sql)
          .toContain(
            'FROM branch_managers bm'
          );

        expect(sql)
          .toContain(
            'bm.manager_id = $2'
          );

        expect(params)
          .toEqual([
            'company-1',
            'manager-1',
            '2026-08-20T00:00:00.000Z',
          ]);

        expect(sql)
          .toContain(
            't.created_at <= $3'
          );
      }
    );

    test(
      'manager dashboard transaction metrics and recent activity use managed branches',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                customer_transaction_count:
                  '0',
                customer_volume:
                  '0',
                commission:
                  '0',
                success_count:
                  '0',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                customer_transaction_count:
                  '0',
                customer_volume:
                  '0',
                commission:
                  '0',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const req = {
          user: manager(),
        };

        const res =
          makeRes();

        await reportController
          .dashboardSummary(
            req,
            res
          );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(4);

        const [
          todaySql,
          todayParams,
        ] =
          mockQuery.mock.calls[0];

        const [
          monthSql,
          monthParams,
        ] =
          mockQuery.mock.calls[1];

        const [
          floatSql,
          floatParams,
        ] =
          mockQuery.mock.calls[2];

        const [
          recentSql,
          recentParams,
        ] =
          mockQuery.mock.calls[3];

        for (
          const sql
          of [
            todaySql,
            monthSql,
            recentSql,
          ]
        ) {
          expect(sql)
            .toContain(
              'FROM branch_managers bm'
            );
        }

        expect(todaySql)
          .toContain(
            'bm.manager_id = $4'
          );

        expect(monthSql)
          .toContain(
            'bm.manager_id = $4'
          );

        expect(
          todayParams.slice(-2)
        ).toEqual([
          'company-1',
          'manager-1',
        ]);

        expect(
          monthParams.slice(-2)
        ).toEqual([
          'company-1',
          'manager-1',
        ]);

        expect(recentSql)
          .toContain(
            'bm.manager_id = $2'
          );

        expect(recentParams)
          .toEqual([
            'company-1',
            'manager-1',
          ]);

        expect(floatSql)
          .toContain(
            'FROM branch_managers bm'
          );

        expect(floatParams)
          .toEqual([
            'company-1',
            'manager-1',
          ]);
      }
    );

    test(
      'commission report passes manager identity to commission service',
      async () => {
        mockGetCommissionSummary
          .mockResolvedValue([]);

        const req = {
          user: manager(),
          query: {
            format: 'csv',
          },
        };

        const res =
          makeRes();

        await reportController
          .commissionReport(
            req,
            res
          );

        expect(
          mockGetCommissionSummary
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            company_id:
              'company-1',
            manager_id:
              'manager-1',
          })
        );
      }
    );

    test(
      'manager cannot resolve an unmanaged branch name for report titles',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                count: '0',
                total_amount:
                  '0',
                total_commission:
                  '0',
                success_rate:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          });

        const req = {
          user: manager(),
          query: {
            format: 'csv',
            branch_id:
              'branch-foreign',
          },
        };

        const res =
          makeRes();

        await reportController
          .transactionReport(
            req,
            res
          );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(3);

        const [
          branchSql,
          branchParams,
        ] =
          mockQuery.mock.calls[2];

        expect(branchSql)
          .toContain(
            'FROM branch_managers bm'
          );

        expect(branchSql)
          .toContain(
            'bm.manager_id = $3'
          );

        expect(branchParams)
          .toEqual([
            'branch-foreign',
            'company-1',
            'manager-1',
          ]);
      }
    );
  }
);
