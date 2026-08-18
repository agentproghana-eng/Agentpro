jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
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
  withTransaction,
} = require('../../src/config/database');

const userController =
  require('../../src/controllers/userController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeRequest(overrides = {}) {
  return {
    user: {
      id: 'manager-1',
      role: 'manager',
      company_id: 'company-1',
    },
    body: {
      first_name: 'Ama',
      last_name: 'Mensah',
      email: 'ama@example.com',
      phone: '0240000000',
      role: 'agent',
      branch_id: 'branch-1',
      password: 'TempPass1',
    },
    ip: '127.0.0.1',
    requestId: 'request-1',
    ...overrides,
  };
}

function mockCommonQueries({
  existingUser = null,
  managerOwnsBranch = false,
} = {}) {
  query.mockImplementation(async (sql, params) => {
    if (
      sql.includes(
        'SELECT id, status, company_id FROM users WHERE email'
      )
    ) {
      return {
        rows: existingUser ? [existingUser] : [],
      };
    }

    if (sql.includes('branch_managers')) {
      return {
        rows: managerOwnsBranch
          ? [{ id: params?.[0] || 'branch-1' }]
          : [],
      };
    }

    if (sql.includes('FROM branches')) {
      return {
        rows: [{ id: params?.[0] || 'branch-1' }],
      };
    }

    if (sql.includes('SELECT name FROM companies')) {
      return {
        rows: [{ name: 'Company One' }],
      };
    }

    return { rows: [] };
  });

  withTransaction.mockResolvedValue({
    id: 'staff-1',
    email: 'ama@example.com',
    role: 'agent',
    status: 'active',
  });
}

describe('Staff Management controller authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    withTransaction.mockReset();
  });

  test.each([
    'manager',
    'auditor',
  ])(
    'manager cannot create a %s account',
    async (targetRole) => {
      mockCommonQueries();

      const req = makeRequest({
        body: {
          ...makeRequest().body,
          role: targetRole,
        },
      });
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(query).not.toHaveBeenCalled();
      expect(withTransaction).not.toHaveBeenCalled();
    }
  );

  test(
    'manager must assign a new agent to a managed branch',
    async () => {
      mockCommonQueries();

      const req = makeRequest({
        body: {
          ...makeRequest().body,
          branch_id: undefined,
        },
      });
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          'Managers must assign agents to a branch they manage',
      });
      expect(query).not.toHaveBeenCalled();
      expect(withTransaction).not.toHaveBeenCalled();
    }
  );

  test(
    'manager cannot create an agent in an unmanaged branch',
    async () => {
      mockCommonQueries({
        managerOwnsBranch: false,
      });

      const req = makeRequest();
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          'You can only add agents to branches you manage',
      });

      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('branch_managers')
        )
      ).toBe(true);

      expect(withTransaction).not.toHaveBeenCalled();
    }
  );

  test(
    'manager can create an agent in a managed branch',
    async () => {
      mockCommonQueries({
        managerOwnsBranch: true,
      });

      const req = makeRequest();
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('branch_managers')
        )
      ).toBe(true);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    }
  );

  test(
    'business owner can still create an auditor without a branch',
    async () => {
      mockCommonQueries();

      const req = makeRequest({
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        body: {
          ...makeRequest().body,
          role: 'auditor',
          branch_id: undefined,
        },
      });
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);

      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('branch_managers')
        )
      ).toBe(false);
    }
  );

  test(
    'manager cannot reactivate an agent into an unmanaged branch',
    async () => {
      mockCommonQueries({
        existingUser: {
          id: 'staff-old',
          status: 'deactivated',
          company_id: 'company-1',
        },
        managerOwnsBranch: false,
      });

      const req = makeRequest();
      const res = makeResponse();

      await userController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          'You can only add agents to branches you manage',
      });

      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('branch_managers')
        )
      ).toBe(true);

      expect(withTransaction).not.toHaveBeenCalled();
    }
  );
});

describe('Staff Management status session revocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    withTransaction.mockReset();
  });

  test.each([
    'suspended',
    'deactivated',
  ])(
    '%s staff status revokes all active refresh tokens',
    async (newStatus) => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'staff-1',
            company_id: 'company-1',
            role: 'agent',
          },
        ],
      });

      const transactionQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'staff-1',
              email: 'staff@example.com',
              role: 'agent',
              status: newStatus,
              first_name: 'Ama',
              last_name: 'Mensah',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      withTransaction.mockImplementation(
        async (callback) =>
          callback({
            query: transactionQuery,
          }),
      );

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        params: {
          user_id: 'staff-1',
        },
        body: {
          status: newStatus,
        },
        ip: '127.0.0.1',
        requestId: 'request-status-1',
      };

      const res = makeResponse();

      await userController.updateUser(req, res);

      expect(withTransaction).toHaveBeenCalledTimes(1);

      // The authorization lookup may use the pool, but both security
      // writes must use the exact same transaction client.
      expect(transactionQuery).toHaveBeenCalledTimes(2);

      const [statusWrite] =
        transactionQuery.mock.calls[0];

      const [
        revokeSql,
        revokeParams,
      ] = transactionQuery.mock.calls[1];

      expect(statusWrite).toContain(
        'UPDATE users SET'
      );

      expect(revokeSql).toContain(
        'UPDATE refresh_tokens'
      );

      expect(revokeSql).toContain(
        'revoked_at IS NULL'
      );

      expect(revokeParams).toEqual([
        'staff-1',
      ]);

      const poolSecurityWrites = query.mock.calls.filter(
        ([sql]) =>
          sql.includes('UPDATE users SET') ||
          sql.includes('UPDATE refresh_tokens')
      );

      expect(poolSecurityWrites).toHaveLength(0);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    }
  );

  test(
    'reactivating a suspended staff member does not create new refresh-token state',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'staff-1',
              company_id: 'company-1',
              role: 'agent',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'staff-1',
              email: 'staff@example.com',
              role: 'agent',
              status: 'active',
              first_name: 'Ama',
              last_name: 'Mensah',
            },
          ],
        });

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        params: {
          user_id: 'staff-1',
        },
        body: {
          status: 'active',
        },
        ip: '127.0.0.1',
        requestId: 'request-status-2',
      };

      const res = makeResponse();

      await userController.updateUser(req, res);

      const refreshWrites = query.mock.calls.filter(
        ([sql]) =>
          sql.includes('refresh_tokens')
      );

      expect(refreshWrites).toHaveLength(0);
      expect(withTransaction).not.toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    }
  );

  test(
    'does not report suspension success when session revocation transaction fails',
    async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'staff-1',
            company_id: 'company-1',
            role: 'agent',
          },
        ],
      });

      const transactionQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'staff-1',
              email: 'staff@example.com',
              role: 'agent',
              status: 'suspended',
              first_name: 'Ama',
              last_name: 'Mensah',
            },
          ],
        })
        .mockRejectedValueOnce(
          new Error('session revocation failed'),
        );

      withTransaction.mockImplementation(
        async (callback) =>
          callback({
            query: transactionQuery,
          }),
      );

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        params: {
          user_id: 'staff-1',
        },
        body: {
          status: 'suspended',
        },
        ip: '127.0.0.1',
        requestId: 'request-status-failure',
      };

      const res = makeResponse();

      await userController.updateUser(req, res);

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(transactionQuery).toHaveBeenCalledTimes(2);

      expect(res.status).toHaveBeenCalledWith(500);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to update user',
      });

      expect(
        res.json.mock.calls.some(
          ([payload]) => payload?.success === true
        )
      ).toBe(false);
    },
  );

});

describe('Staff Management manager direct-read role scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    withTransaction.mockReset();
  });

  test(
    'manager cannot view another manager through a shared managed branch',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'manager-2',
              role: 'manager',
              first_name: 'Kojo',
              last_name: 'Mensah',
              email: 'kojo@example.com',
              phone: '0241111111',
              status: 'active',
              company_id: 'company-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ allowed: 1 }],
        });

      const req = {
        user: {
          id: 'manager-1',
          role: 'manager',
          company_id: 'company-1',
        },
        params: {
          user_id: 'manager-2',
        },
      };
      const res = makeResponse();

      await userController.getUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied',
      });

      expect(query).toHaveBeenCalledTimes(1);
    }
  );
});

describe('Staff Management manager branch reassignment contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    withTransaction.mockReset();
  });

  test(
    'manager branch reassignment preserves existing managed branches',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'manager-2',
              role: 'manager',
              first_name: 'Kojo',
              last_name: 'Mensah',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'branch-3' }],
        });

      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });

      withTransaction.mockImplementationOnce(
        async (callback) => callback({ query: clientQuery })
      );

      const req = {
        user: {
          id: 'owner-1',
          role: 'business_owner',
          company_id: 'company-1',
        },
        params: {
          user_id: 'manager-2',
        },
        body: {
          branch_id: 'branch-3',
        },
        ip: '127.0.0.1',
        requestId: 'request-reassign-1',
      };
      const res = makeResponse();

      await userController.reassignBranch(req, res);

      const transactionSql = clientQuery.mock.calls
        .map(([sql]) => sql)
        .join('\n');

      expect(transactionSql).not.toContain(
        'DELETE FROM branch_managers WHERE manager_id'
      );

      const managerAssignment = clientQuery.mock.calls.find(
        ([sql]) => sql.includes('INSERT INTO branch_managers')
      );

      expect(managerAssignment).toBeDefined();
      expect(managerAssignment[0]).toContain('ON CONFLICT DO NOTHING');
      expect(managerAssignment[1]).toEqual([
        'manager-2',
        'branch-3',
        'owner-1',
      ]);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    }
  );
});
