jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
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
} = require('../../src/config/database');

const branchController =
  require('../../src/controllers/branchController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Branch staff visibility lifecycle contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'branch list counts exclude deactivated agents and managers',
    async () => {
      query.mockResolvedValueOnce({
        rows: [],
      });

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        query: {},
      };
      const res = makeResponse();

      await branchController.listBranches(req, res);

      const [sql] = query.mock.calls[0];

      expect(sql).toContain('LEFT JOIN users');
      expect(sql).toContain("status <> 'deactivated'");
      expect(sql).toContain('agent_count');
      expect(sql).toContain('manager_count');
    }
  );

  test(
    'branch detail excludes deactivated assigned staff',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'branch-1',
              company_id: 'company-1',
              name: 'Accra Central',
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
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        params: {
          branch_id: 'branch-1',
        },
      };
      const res = makeResponse();

      await branchController.getBranch(req, res);

      const [agentSql] = query.mock.calls[1];
      const [managerSql] = query.mock.calls[2];

      expect(agentSql).toContain("u.status <> 'deactivated'");
      expect(managerSql).toContain("u.status <> 'deactivated'");

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    }
  );
});
