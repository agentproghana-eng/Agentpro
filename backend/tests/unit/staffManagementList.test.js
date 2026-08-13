jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(),
  sendNewEmployeeEmail: jest.fn(),
}));

jest.mock('../../src/services/smsService', () => ({
  sendNewEmployeeSMS: jest.fn(),
}));

jest.mock('../../src/services/notificationService', () => ({
  sendEphemeral: jest.fn(),
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

const userController =
  require('../../src/controllers/userController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function primeListQueries() {
  query
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-1',
          role: 'agent',
          first_name: 'Ama',
          last_name: 'Mensah',
          branch_id: 'branch-1',
          branch_name: 'Accra Central',
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [{ count: '1' }],
    });
}

describe('Staff Management list branch contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'staff list exposes a primary branch id and branch name',
    async () => {
      primeListQueries();

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        query: {
          page: '1',
          limit: '20',
        },
      };
      const res = makeResponse();

      await userController.listUsers(req, res);

      const [dataSql] = query.mock.calls[0];

      expect(dataSql).toContain('agent_branches');
      expect(dataSql).toContain('branch_id');
      expect(dataSql).toContain('branch_name');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    }
  );

  test(
    'branch_id filter actually restricts staff by assignment',
    async () => {
      primeListQueries();

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        query: {
          branch_id: 'branch-1',
          page: '1',
          limit: '20',
        },
      };
      const res = makeResponse();

      await userController.listUsers(req, res);

      const [dataSql, dataParams] = query.mock.calls[0];
      const [countSql, countParams] = query.mock.calls[1];

      expect(dataSql).toContain('agent_branches');
      expect(countSql).toContain('agent_branches');

      expect(dataParams).toContain('branch-1');
      expect(countParams).toContain('branch-1');
    }
  );

  test(
    'manager branch filtering remains bounded by managed branches',
    async () => {
      primeListQueries();

      const req = {
        user: {
          id: 'manager-1',
          role: 'manager',
          company_id: 'company-1',
        },
        query: {
          branch_id: 'branch-1',
          page: '1',
          limit: '20',
        },
      };
      const res = makeResponse();

      await userController.listUsers(req, res);

      const [dataSql, dataParams] = query.mock.calls[0];

      expect(dataSql).toContain('branch_managers');
      expect(dataSql).toContain('agent_branches');

      expect(dataParams).toContain('manager-1');
      expect(dataParams).toContain('branch-1');
    }
  );
});

describe('Staff Management manager read role scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'manager staff list is explicitly agent-only',
    async () => {
      primeListQueries();

      const req = {
        user: {
          id: 'manager-1',
          role: 'manager',
          company_id: 'company-1',
        },
        query: {
          page: '1',
          limit: '20',
        },
      };
      const res = makeResponse();

      await userController.listUsers(req, res);

      const [dataSql, dataParams] = query.mock.calls[0];

      expect(dataSql).toContain("u.role = 'agent'");
      expect(dataSql).toContain('branch_managers');
      expect(dataParams).toContain('manager-1');
    }
  );
});

describe('Staff Management list pagination bounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'staff list normalizes page and caps limit',
    async () => {
      primeListQueries();

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        query: {
          page: 'not-a-page',
          limit: '5000',
        },
      };
      const res = makeResponse();

      await userController.listUsers(req, res);

      const [, dataParams] = query.mock.calls[0];

      expect(dataParams.slice(-2)).toEqual([100, 0]);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            page: 1,
            limit: 100,
          }),
        })
      );
    }
  );
});
