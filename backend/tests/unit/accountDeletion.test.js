const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();
const mockDeleteCloudinaryFile =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query: (...args) =>
      mockQuery(...args),
    withTransaction: (...args) =>
      mockWithTransaction(...args),
  }),
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: (...args) =>
      mockAuditLog(...args),
  }),
);

jest.mock(
  '../../src/config/cloudinary',
  () => ({
    deleteFile: (...args) =>
      mockDeleteCloudinaryFile(
        ...args
      ),
  }),
);

const authController =
  require(
    '../../src/controllers/authController'
  );

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath,
    ),
    'utf8',
  );
}

function makeResponse() {
  return {
    status: jest
      .fn()
      .mockReturnThis(),
    json: jest
      .fn()
      .mockReturnThis(),
  };
}

function makeRequest(
  password = 'CorrectPass1',
) {
  return {
    user: {
      id:
        '11111111-1111-4111-8111-111111111111',
      role: 'customer',
      company_id: null,
    },
    body: {
      password,
    },
    ip: '127.0.0.1',
    requestId:
      '22222222-2222-4222-8222-222222222222',
    headers: {
      'user-agent':
        'AgentPro test',
    },
  };
}

async function makeLockedUser(
  overrides = {},
) {
  return {
    id:
      '11111111-1111-4111-8111-111111111111',
    role: 'customer',
    company_id: null,
    password_hash:
      await bcrypt.hash(
        'CorrectPass1',
        4,
      ),
    profile_image_url:
      'https://res.cloudinary.com/demo/image/upload/v1/agentpro/profiles/avatar.jpg',
    account_deleted_at: null,
    ...overrides,
  };
}

function makeClient({
  user,
  openShift = false,
} = {}) {
  const client = {
    query: jest.fn(
      async (sql) => {
        const normalized =
          String(sql);

        if (
          normalized.includes(
            'FROM users'
          ) &&
          normalized.includes(
            'FOR UPDATE'
          )
        ) {
          return {
            rows: user
              ? [user]
              : [],
          };
        }

        if (
          normalized.includes(
            'FROM shifts'
          )
        ) {
          return {
            rows: openShift
              ? [{ id: 'shift-1' }]
              : [],
          };
        }

        if (
          normalized.includes(
            'SELECT' +
              '\n                 image_urls'
          )
        ) {
          return {
            rows: [],
          };
        }

        if (
          normalized.includes(
            'SELECT audio_url'
          )
        ) {
          return {
            rows: [],
          };
        }

        return {
          rows: [],
          rowCount: 1,
        };
      },
    ),
  };

  return client;
}

describe(
  'self-service account deletion',
  () => {
    beforeAll(() => {
      process.env.BCRYPT_ROUNDS =
        '4';
    });

    beforeEach(() => {
      jest.clearAllMocks();

      mockAuditLog
        .mockResolvedValue(
          undefined
        );

      mockDeleteCloudinaryFile
        .mockResolvedValue({
          result: 'ok',
        });
    });

    test(
      'permanently anonymizes the account while retaining technical financial identity',
      async () => {
        const user =
          await makeLockedUser();

        const client =
          makeClient({
            user,
          });

        mockWithTransaction
          .mockImplementation(
            async (callback) =>
              callback(client),
          );

        const req =
          makeRequest();

        const res =
          makeResponse();

        await authController
          .deleteAccount(
            req,
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          200
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            code:
              'ACCOUNT_DELETED',
          }),
        );

        const sql =
          client.query.mock.calls
            .map(
              ([statement]) =>
                String(statement),
            )
            .join('\n');

        expect(sql).toContain(
          'UPDATE personal_trial_entitlements'
        );

        expect(sql).toContain(
          'UPDATE personal_transactions'
        );

        expect(sql).toContain(
          'UPDATE personal_subscription_payments'
        );

        expect(sql).toContain(
          'DELETE FROM\n               refresh_tokens'
        );

        expect(sql).toContain(
          'DELETE FROM\n               password_reset_tokens'
        );

        expect(sql).toContain(
          'DELETE FROM\n               marketplace_conversations'
        );

        expect(sql).toContain(
          'UPDATE advertisements'
        );

        expect(sql).toContain(
          "first_name = 'Deleted'"
        );

        expect(sql).toContain(
          "last_name = 'User'"
        );

        expect(sql).toContain(
          "status = 'deactivated'"
        );

        expect(sql).toContain(
          'account_deleted_at = NOW()'
        );

        expect(sql).toContain(
          'ghana_card_number = NULL'
        );

        expect(sql).toContain(
          'fcm_token = NULL'
        );

        expect(sql).toContain(
          'mfa_totp_secret_enc = NULL'
        );

        expect(
          mockAuditLog
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'ACCOUNT_DELETED',
            dbClient: client,
            strict: true,
          }),
        );

        expect(
          mockDeleteCloudinaryFile
        ).toHaveBeenCalledWith(
          'agentpro/profiles/avatar',
          expect.objectContaining({
            resource_type:
              'image',
            invalidate: true,
          }),
        );
      },
    );

    test(
      'rejects an incorrect current password before any deletion mutation',
      async () => {
        const user =
          await makeLockedUser();

        const client =
          makeClient({
            user,
          });

        mockWithTransaction
          .mockImplementation(
            async (callback) =>
              callback(client),
          );

        const res =
          makeResponse();

        await authController
          .deleteAccount(
            makeRequest(
              'WrongPass1'
            ),
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          401
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'ACCOUNT_DELETION_PASSWORD_INVALID',
          }),
        );

        const sql =
          client.query.mock.calls
            .map(
              ([statement]) =>
                String(statement),
            )
            .join('\n');

        expect(sql).not.toContain(
          'UPDATE personal_transactions'
        );

        expect(
          mockAuditLog
        ).not.toHaveBeenCalled();
      },
    );

    test(
      'refuses deletion while an AgentPro shift is still open',
      async () => {
        const user =
          await makeLockedUser({
            role: 'agent',
          });

        const client =
          makeClient({
            user,
            openShift: true,
          });

        mockWithTransaction
          .mockImplementation(
            async (callback) =>
              callback(client),
          );

        const res =
          makeResponse();

        await authController
          .deleteAccount(
            makeRequest(),
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          409
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'ACCOUNT_DELETION_OPEN_SHIFT',
          }),
        );

        expect(
          mockAuditLog
        ).not.toHaveBeenCalled();
      },
    );

    test(
      'never permits consumer self-deletion of a superuser account',
      async () => {
        const user =
          await makeLockedUser({
            role: 'superuser',
          });

        const client =
          makeClient({
            user,
          });

        mockWithTransaction
          .mockImplementation(
            async (callback) =>
              callback(client),
          );

        const res =
          makeResponse();

        await authController
          .deleteAccount(
            makeRequest(),
            res,
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          403
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'SUPERUSER_SELF_DELETION_FORBIDDEN',
          }),
        );

        expect(
          mockAuditLog
        ).not.toHaveBeenCalled();
      },
    );

    test(
      'the durable migration prevents a deleted account from becoming active again',
      () => {
        const migration =
          readSource(
            'migrations/105_account_deletion.sql'
          );

        expect(
          migration
        ).toContain(
          'account_deleted_at TIMESTAMPTZ'
        );

        expect(
          migration
        ).toContain(
          "OR status = 'deactivated'"
        );

        expect(
          migration
        ).toContain(
          'chk_users_deleted_account_deactivated'
        );
      },
    );

    test(
      'the authenticated route requires the current password',
      () => {
        const routes =
          readSource(
            'src/routes/auth.routes.js'
          );

        expect(routes).toContain(
          "router.delete("
        );

        expect(routes).toContain(
          "'/account'"
        );

        expect(routes).toContain(
          "body('password')"
        );

        expect(routes).toContain(
          'authController.deleteAccount'
        );
      },
    );

    test(
      'staff administration cannot reactivate a permanently deleted identity',
      () => {
        const source =
          readSource(
            'src/controllers/userController.js'
          );

        expect(source).toContain(
          'ACCOUNT_PERMANENTLY_DELETED'
        );

        expect(source).toContain(
          'account_deleted_at FROM users WHERE email = $1'
        );

        expect(source).toContain(
          'role, account_deleted_at FROM users WHERE id = $1'
        );
      },
    );
  },
);
