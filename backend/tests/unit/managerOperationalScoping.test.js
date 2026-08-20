const mockQuery =
  jest.fn();

const mockClientQuery =
  jest.fn();

const mockWithTransaction =
  jest.fn();

const mockAuditLog =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),

    withTransaction:
      (...args) =>
        mockWithTransaction(
          ...args
        ),
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
  '../../src/services/auditService',
  () => ({
    auditLog:
      (...args) =>
        mockAuditLog(...args),
  })
);

jest.mock(
  '../../src/services/financialBranchService',
  () => ({
    resolveAgentFinancialBranch:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/agentWalletService',
  () => ({
    getOrCreateAgentCashBalance:
      jest.fn(),
    getOrCreateAgentSimWallet:
      jest.fn(),
  })
);

const balanceController =
  require(
    '../../src/controllers/balanceController'
  );

const shiftController =
  require(
    '../../src/controllers/shiftController'
  );

function makeRes() {
  return {
    status:
      jest.fn()
        .mockReturnThis(),
    json:
      jest.fn(),
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
  'manager operational branch scoping',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockWithTransaction
        .mockImplementation(
          async (callback) =>
            callback({
              query:
                (...args) =>
                  mockClientQuery(
                    ...args
                  ),
            })
        );

      mockAuditLog
        .mockResolvedValue(
          undefined
        );
    });

    test(
      'pending cash adjustments include only agents in managed branches',
      async () => {
        mockQuery
          .mockResolvedValue({
            rows: [],
          });

        const req = {
          user: manager(),
        };

        const res =
          makeRes();

        await balanceController
          .listPendingAdjustments(
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
            'FROM agent_branches ab'
          );

        expect(sql)
          .toContain(
            'INNER JOIN branch_managers bm'
          );

        expect(sql)
          .toContain(
            'bm.manager_id = $3'
          );

        expect(params)
          .toEqual([
            'pending',
            'company-1',
            'manager-1',
          ]);
      }
    );

    test(
      'manager cannot review an adjustment without managed-branch overlap',
      async () => {
        mockClientQuery
          .mockResolvedValueOnce({
            rows: [],
          });

        const req = {
          user: manager(),
          params: {
            movement_id:
              'movement-1',
          },
          body: {
            action:
              'reject',
            review_notes:
              'reviewed',
          },
          ip:
            '198.51.100.10',
          requestId:
            'request-1',
        };

        const res =
          makeRes();

        await balanceController
          .reviewCashAdjustment(
            req,
            res
          );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(1);

        const [
          sql,
          params,
        ] =
          mockClientQuery.mock.calls[0];

        expect(sql)
          .toContain(
            'FROM agent_branches ab'
          );

        expect(sql)
          .toContain(
            'INNER JOIN branch_managers bm'
          );

        expect(sql)
          .toContain(
            'bm.manager_id = $3'
          );

        expect(params)
          .toEqual([
            'movement-1',
            'company-1',
            'manager-1',
          ]);

        expect(res.status)
          .toHaveBeenCalledWith(
            404
          );
      }
    );

    test(
      'manager closed-shift history is limited to managed branches',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                value: '20.00',
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                count: '0',
              },
            ],
          });

        const req = {
          user: manager(),
          query: {},
        };

        const res =
          makeRes();

        await shiftController
          .listShifts(
            req,
            res
          );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(3);

        const [
          dataSql,
          dataParams,
        ] =
          mockQuery.mock.calls[1];

        const [
          countSql,
          countParams,
        ] =
          mockQuery.mock.calls[2];

        for (
          const sql
          of [
            dataSql,
            countSql,
          ]
        ) {
          expect(sql)
            .toContain(
              "s.status = 'closed'"
            );

          expect(sql)
            .toContain(
              's.company_id = $1'
            );

          expect(sql)
            .toContain(
              'FROM branch_managers bm'
            );

          expect(sql)
            .toContain(
              'bm.manager_id = $2'
            );
        }

        expect(
          dataParams.slice(
            0,
            2
          )
        ).toEqual([
          'company-1',
          'manager-1',
        ]);

        expect(countParams)
          .toEqual([
            'company-1',
            'manager-1',
          ]);
      }
    );
  }
);
