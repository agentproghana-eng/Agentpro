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

jest.mock('../../src/utils/ussdFlowCapabilities', () => ({
  getRegisteredProviders: jest.fn(),
}));

const {
  query,
  withTransaction,
} = require('../../src/config/database');

const {
  auditLog,
} = require('../../src/services/auditService');

const {
  getRegisteredProviders,
} = require('../../src/utils/ussdFlowCapabilities');

const branchController =
  require('../../src/controllers/branchController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Branch Management controller contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    query.mockReset();
    withTransaction.mockReset();
    auditLog.mockReset();
    getRegisteredProviders.mockReset();

    auditLog.mockResolvedValue();
  });

  test(
    'manager direct branch read requires an actual branch_managers assignment',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'branch-1',
              company_id: 'company-1',
              name: 'Accra Central',
              status: 'active',
            },
          ],
        })
        // The manager has an agent_branches operating/default assignment.
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'manager-1',
              first_name: 'Test',
              last_name: 'Manager',
              status: 'active',
            },
          ],
        })
        // But the manager does NOT manage this branch.
        .mockResolvedValueOnce({
          rows: [],
        });

      const req = {
        user: {
          id: 'manager-1',
          role: 'manager',
          company_id: 'company-1',
        },
        params: {
          branch_id: 'branch-1',
        },
      };

      const res = makeResponse();

      await branchController.getBranch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    }
  );

  test(
    'branch creation is atomic and initializes every registered provider dynamically',
    async () => {
      const createdBranch = {
        id: 'branch-1',
        company_id: 'company-1',
        name: 'Kumasi Central',
        location: 'Adum',
        phone: '0240000000',
        status: 'active',
      };

      // Allows the current non-transactional implementation to execute far
      // enough to expose the regression instead of failing for mock setup.
      query.mockImplementation(async (sql) => {
        const text = String(sql);

        if (text.includes('INSERT INTO branches')) {
          return { rows: [createdBranch] };
        }

        if (text.includes('SELECT id FROM agent_branches')) {
          return { rows: [] };
        }

        return { rows: [] };
      });

      const clientQuery = jest.fn(async (sql) => {
        const text = String(sql);

        if (text.includes('INSERT INTO branches')) {
          return { rows: [createdBranch] };
        }

        if (text.includes('SELECT id FROM agent_branches')) {
          return { rows: [] };
        }

        return { rows: [] };
      });

      withTransaction.mockImplementation(
        async (callback) => callback({ query: clientQuery })
      );

      getRegisteredProviders.mockResolvedValue([
        'mtn',
        'telecel',
        'at_money',
        'future_money',
      ]);

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        body: {
          name: 'Kumasi Central',
          location: 'Adum',
          phone: '0240000000',
        },
        ip: '127.0.0.1',
        requestId: 'request-1',
      };

      const res = makeResponse();

      await branchController.createBranch(req, res);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(getRegisteredProviders).toHaveBeenCalledTimes(1);

      const floatProviderParams = clientQuery.mock.calls
        .filter(([sql]) =>
          String(sql).includes('INSERT INTO float_accounts')
        )
        .map(([, params]) => params[1]);

      expect(floatProviderParams).toEqual([
        'mtn',
        'telecel',
        'at_money',
        'future_money',
      ]);

      expect(query).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdBranch,
      });
    }
  );

  test(
    'branch update writes a BRANCH_UPDATED audit event',
    async () => {
      const updatedBranch = {
        id: 'branch-1',
        company_id: 'company-1',
        name: 'Accra Central Updated',
        location: 'Osu',
        phone: '0241111111',
        status: 'active',
      };

      query.mockResolvedValueOnce({
        rows: [updatedBranch],
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
        body: {
          name: 'Accra Central Updated',
          location: 'Osu',
          phone: '0241111111',
          status: 'active',
        },
        ip: '127.0.0.1',
        requestId: 'request-2',
      };

      const res = makeResponse();

      await branchController.updateBranch(req, res);

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-1',
          companyId: 'company-1',
          action: 'BRANCH_UPDATED',
          entityType: 'branch',
          entityId: 'branch-1',
          newValues: expect.objectContaining({
            name: 'Accra Central Updated',
            location: 'Osu',
            phone: '0241111111',
            status: 'active',
          }),
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedBranch,
      });
    }
  );

  test(
    'superuser branch update is global and does not require a company-scoped user',
    async () => {
      const updatedBranch = {
        id: 'branch-2',
        company_id: 'company-2',
        name: 'Takoradi Central',
        location: 'Market Circle',
        phone: '0242222222',
        status: 'active',
      };

      query.mockResolvedValueOnce({
        rows: [updatedBranch],
      });

      const req = {
        user: {
          id: 'superuser-1',
          role: 'superuser',
        },
        params: {
          branch_id: 'branch-2',
        },
        body: {
          name: 'Takoradi Central',
        },
        ip: '127.0.0.1',
        requestId: 'request-superuser-update',
      };

      const res = makeResponse();

      await branchController.updateBranch(req, res);

      expect(query).toHaveBeenCalledTimes(1);

      const [sql, params] = query.mock.calls[0];

      expect(String(sql)).not.toContain(
        'AND company_id ='
      );

      expect(params).toEqual([
        'Takoradi Central',
        undefined,
        undefined,
        undefined,
        'branch-2',
      ]);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedBranch,
      });

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'superuser-1',
          companyId: 'company-2',
          action: 'BRANCH_UPDATED',
          entityType: 'branch',
          entityId: 'branch-2',
        })
      );
    }
  );

});
