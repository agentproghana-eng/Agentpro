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

const { query } =
  require('../../src/config/database');

const userController =
  require('../../src/controllers/userController');

const USER_3 =
  '33333333-3333-4333-8333-333333333333';
const USER_2 =
  '22222222-2222-4222-8222-222222222222';
const USER_1 =
  '11111111-1111-4111-8111-111111111111';

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'business_owner',
      company_id:
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    },
    query: {},
    ...overrides,
  };
}

function cursorFor({
  value = '2026-09-16T10:00:00.000Z',
  id = USER_2,
  v = 1,
  kind = 'users',
} = {}) {
  return Buffer.from(
    JSON.stringify({
      v,
      kind,
      value,
      id,
    }),
    'utf8',
  ).toString('base64url');
}

describe(
  'Staff Management cursor pagination',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'uses LIMIT + 1 without OFFSET or COUNT',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            {
              id: USER_3,
              created_at:
                '2026-09-16T12:00:00.000Z',
            },
            {
              id: USER_2,
              created_at:
                '2026-09-16T11:00:00.000Z',
            },
            {
              id: USER_1,
              created_at:
                '2026-09-16T10:00:00.000Z',
            },
          ],
        });

        const req = makeReq({
          query: {
            limit: '2',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        expect(query).toHaveBeenCalledTimes(1);

        const [sql, params] =
          query.mock.calls[0];

        expect(sql).toContain(
          'ORDER BY\n         u.created_at DESC,\n         u.id DESC',
        );
        expect(sql).not.toMatch(/\bOFFSET\b/i);
        expect(sql).not.toMatch(
          /\bCOUNT\s*\(/i,
        );
        expect(params.at(-1)).toBe(3);

        const payload =
          res.json.mock.calls[0][0];

        expect(payload.data).toHaveLength(2);
        expect(payload.meta).toEqual(
          expect.objectContaining({
            limit: 2,
            has_more: true,
          }),
        );
        expect(
          payload.meta.next_cursor,
        ).toEqual(expect.any(String));
      },
    );

    test(
      'rejects malformed cursor before DB access',
      async () => {
        const req = makeReq({
          query: {
            cursor: 'definitely-invalid',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        expect(query).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(
          422,
        );
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          code: 'INVALID_CURSOR',
          message:
            'The pagination cursor is invalid or expired.',
        });
      },
    );

    test.each([
      [
        'wrong version',
        cursorFor({ v: 2 }),
      ],
      [
        'wrong kind',
        cursorFor({
          kind: 'notifications',
        }),
      ],
      [
        'non canonical date',
        cursorFor({
          value:
            '2026-09-16T10:00:00Z',
        }),
      ],
      [
        'bad uuid',
        cursorFor({
          id: 'not-a-uuid',
        }),
      ],
    ])(
      'rejects %s cursor',
      async (_label, cursor) => {
        const req = makeReq({
          query: { cursor },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        expect(query).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(
          422,
        );
      },
    );

    test(
      'adds deterministic created_at/id seek boundary',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        const cursor = cursorFor();
        const req = makeReq({
          query: {
            cursor,
            limit: '20',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        const [sql, params] =
          query.mock.calls[0];

        expect(sql).toContain(
          'u.created_at <',
        );
        expect(sql).toContain(
          'u.id <',
        );
        expect(params).toContain(
          '2026-09-16T10:00:00.000Z',
        );
        expect(params).toContain(USER_2);
        expect(params.at(-1)).toBe(21);
      },
    );

    test(
      'preserves business-owner company scope and filters',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        const req = makeReq({
          query: {
            role: 'agent',
            status: 'active',
            branch_id:
              'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            personal_only: 'true',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        const [sql, params] =
          query.mock.calls[0];

        expect(sql).toContain(
          'u.company_id =',
        );
        expect(sql).toContain(
          'u.role =',
        );
        expect(sql).toContain(
          'u.status =',
        );
        expect(sql).toContain(
          'personal_subscriptions ps_filter',
        );
        expect(sql).toContain(
          'agent_branches ab_filter',
        );

        expect(params).toContain(
          req.user.company_id,
        );
        expect(params).toContain('agent');
        expect(params).toContain('active');
        expect(params).toContain(
          req.query.branch_id,
        );
      },
    );

    test(
      'preserves manager managed-branch scoping',
      async () => {
        query.mockResolvedValueOnce({
          rows: [],
        });

        const req = makeReq({
          user: {
            id:
              'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            role: 'manager',
            company_id:
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        const [sql, params] =
          query.mock.calls[0];

        expect(sql).toContain(
          "u.role = 'agent'",
        );
        expect(sql).toContain(
          'branch_managers',
        );
        expect(params).toContain(
          req.user.id,
        );
        expect(params).toContain(
          req.user.company_id,
        );
      },
    );

    test(
      'emits a versioned canonical next cursor',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            {
              id: USER_3,
              created_at:
                '2026-09-16T12:00:00.000Z',
            },
            {
              id: USER_2,
              created_at:
                '2026-09-16T11:00:00.000Z',
            },
          ],
        });

        const req = makeReq({
          query: {
            limit: '1',
          },
        });
        const res = makeResponse();

        await userController.listUsersCursor(
          req,
          res,
        );

        const payload =
          res.json.mock.calls[0][0];

        const decoded = JSON.parse(
          Buffer.from(
            payload.meta.next_cursor,
            'base64url',
          ).toString('utf8'),
        );

        expect(decoded).toEqual({
          v: 1,
          kind: 'users',
          value:
            '2026-09-16T12:00:00.000Z',
          id: USER_3,
        });
      },
    );
  },
);
