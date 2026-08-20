const mockQuery =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),
  })
);

const {
  getCommissionSummary,
} = require(
  '../../src/services/commissionService'
);

describe(
  'commission manager branch scope',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockQuery
        .mockResolvedValue({
          rows: [],
        });
    });

    test(
      'manager summary requires a branch_managers relationship',
      async () => {
        await getCommissionSummary({
          company_id:
            'company-1',
          manager_id:
            'manager-1',
          group_by:
            'month',
        });

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
            'c.company_id = $1'
          );

        expect(sql)
          .toContain(
            'FROM branch_managers bm'
          );

        expect(sql)
          .toContain(
            'bm.branch_id = c.branch_id'
          );

        expect(sql)
          .toContain(
            'bm.manager_id = $2'
          );

        expect(params)
          .toEqual([
            'company-1',
            'manager-1',
          ]);
      }
    );

    test(
      'business owner summary remains company-wide',
      async () => {
        await getCommissionSummary({
          company_id:
            'company-1',
          group_by:
            'month',
        });

        const [
          sql,
          params,
        ] =
          mockQuery.mock.calls[0];

        expect(sql)
          .toContain(
            'c.company_id = $1'
          );

        expect(sql)
          .not.toContain(
            'FROM branch_managers bm'
          );

        expect(params)
          .toEqual([
            'company-1',
          ]);
      }
    );

    test(
      'commission HTTP summary forwards manager identity',
      () => {
        const fs =
          require('fs');

        const path =
          require('path');

        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../src/routes/commission.routes.js'
            ),
            'utf8'
          );

        expect(source)
          .toContain(
            "req.user.role === 'manager'"
          );

        expect(source)
          .toContain(
            'manager_id:'
          );

        expect(source)
          .toContain(
            '? req.user.id'
          );
      }
    );
  }
);
