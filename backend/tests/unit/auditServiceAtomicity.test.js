const mockGlobalQuery = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockGlobalQuery(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: (...args) => mockLoggerError(...args),
  },
}));

const {
  auditLog,
} = require('../../src/services/auditService');

describe('atomic audit service contract', () => {
  beforeEach(() => {
    mockGlobalQuery.mockReset();
    mockLoggerError.mockReset();
  });

  test(
    'ordinary audit remains best-effort on the global query path',
    async () => {
      mockGlobalQuery.mockRejectedValueOnce(
        new Error('audit unavailable')
      );

      await expect(
        auditLog({
          userId: 'user-1',
          action: 'ORDINARY_EVENT',
        })
      ).resolves.toBeUndefined();

      expect(mockGlobalQuery).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    }
  );

  test(
    'transaction-scoped audit uses the supplied PostgreSQL client',
    async () => {
      const client = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [],
        }),
      };

      await auditLog({
        userId: 'user-1',
        companyId: 'company-1',
        action: 'TRANSACTION_SUCCESS',
        entityType: 'transaction',
        entityId: 'transaction-1',
        dbClient: client,
        strict: true,
      });

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(
        client.query.mock.calls[0][0]
      ).toContain('INSERT INTO audit_logs');

      expect(mockGlobalQuery).not.toHaveBeenCalled();
    }
  );

  test(
    'strict transaction-scoped audit propagates failure for rollback',
    async () => {
      const auditFailure =
        new Error('audit insert failed');

      const client = {
        query: jest.fn().mockRejectedValueOnce(
          auditFailure
        ),
      };

      await expect(
        auditLog({
          userId: 'user-1',
          action: 'TRANSACTION_SUCCESS',
          dbClient: client,
          strict: true,
        })
      ).rejects.toBe(auditFailure);

      expect(mockGlobalQuery).not.toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    }
  );

  test(
    'non-strict supplied-client audit remains best-effort',
    async () => {
      const client = {
        query: jest.fn().mockRejectedValueOnce(
          new Error('audit insert failed')
        ),
      };

      await expect(
        auditLog({
          userId: 'user-1',
          action: 'OPTIONAL_EVENT',
          dbClient: client,
        })
      ).resolves.toBeUndefined();

      expect(mockGlobalQuery).not.toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    }
  );
});

describe('transaction completion outbox boundary', () => {
  test(
    'enqueues completion intent after strict audit inside the owning DB transaction',
    () => {
      const fs = require('fs');
      const path = require('path');

      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/controllers/transactionController.js'
        ),
        'utf8'
      );

      const start = source.indexOf(
        'exports.completeTransaction = async'
      );

      const end = source.indexOf(
        'exports.getTransaction = async',
        start
      );

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const completionSource =
        source.slice(start, end);

      const strictAudit =
        completionSource.indexOf(
          'strict: true'
        );

      const outboxEnqueue =
        completionSource.indexOf(
          'await enqueueOutboxEvent('
        );

      const afterTransaction =
        completionSource.indexOf(
          'if (transactionNotFound)'
        );

      expect(strictAudit)
        .toBeGreaterThanOrEqual(0);

      expect(outboxEnqueue)
        .toBeGreaterThan(strictAudit);

      expect(afterTransaction)
        .toBeGreaterThan(outboxEnqueue);

      const outboxSection =
        completionSource.slice(
          outboxEnqueue,
          afterTransaction
        );

      expect(outboxSection).toContain(
        'dbClient: client'
      );

      expect(outboxSection).toContain(
        "'notification.transaction.completed'"
      );

      expect(outboxSection).not.toContain(
        'ussd_session_log'
      );

      expect(
        completionSource.indexOf(
          'await sendTransactionNotification('
        )
      ).toBe(-1);

      expect(
        completionSource.indexOf(
          'completionNotification'
        )
      ).toBe(-1);
    }
  );
});

describe('balance financial audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/balanceController.js'
    ),
    'utf8'
  );

  const section = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(
      endMarker,
      start
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
  };

  test(
    'Manual Cash Out uses strict audit on its owning DB client',
    () => {
      const body = section(
        'exports.recordCashOutManual = async',
        'exports.recordFloatReceived = async'
      );

      expect(body).toContain(
        'action: "CASH_OUT_MANUAL_RECORDED"'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          'action: "CASH_OUT_MANUAL_RECORDED"'
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO agent_balance_movements'
        )
      );
    }
  );

  test(
    'Float Received uses strict audit on its owning DB client',
    () => {
      const body = section(
        'exports.recordFloatReceived = async',
        'exports.submitCashAdjustment = async'
      );

      expect(body).toContain(
        'action: "FLOAT_RECEIVED_RECORDED"'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          'action: "FLOAT_RECEIVED_RECORDED"'
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO agent_balance_movements'
        )
      );
    }
  );

  test(
    'Cash Set and adjustment submission require strict atomic audit',
    () => {
      const body = section(
        'exports.submitCashAdjustment = async',
        'exports.reviewCashAdjustment = async'
      );

      expect(body).toContain(
        'action: "CASH_BALANCE_SET"'
      );

      expect(body).toContain(
        'action: "CASH_ADJUSTMENT_SUBMITTED"'
      );

      expect(
        body.match(/dbClient: client/g)
      ).toHaveLength(2);

      expect(
        body.match(/strict: true/g)
      ).toHaveLength(2);
    }
  );

  test(
    'cash-adjustment approval and rejection require strict atomic audit',
    () => {
      const body = section(
        'exports.reviewCashAdjustment = async',
        'exports.listPendingAdjustments = async'
      );

      expect(body).toContain(
        '"CASH_ADJUSTMENT_APPROVED"'
      );

      expect(body).toContain(
        '"CASH_ADJUSTMENT_REJECTED"'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          'await auditLog({'
        )
      ).toBeGreaterThan(
        body.indexOf(
          'UPDATE agent_balance_movements'
        )
      );
    }
  );
});

describe('branch Float and shift audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  const readController = (name) =>
    fs.readFileSync(
      path.join(
        __dirname,
        '../../src/controllers',
        name
      ),
      'utf8'
    );

  const exportSection = (
    source,
    marker
  ) => {
    const start = source.indexOf(marker);

    expect(start).toBeGreaterThanOrEqual(0);

    const next = source.indexOf(
      '\nexports.',
      start + marker.length
    );

    return source.slice(
      start,
      next === -1 ? source.length : next
    );
  };

  test(
    'branch Float top-up audit is strict and transaction-scoped',
    () => {
      const source =
        readController('floatController.js');

      const body = exportSection(
        source,
        'exports.topUpFloat = async'
      );

      expect(
        body.match(/action: 'FLOAT_TOP_UP'/g)
      ).toHaveLength(1);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'FLOAT_TOP_UP'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO float_movements'
        )
      );

      expect(
        body.indexOf(
          "action: 'FLOAT_TOP_UP'"
        )
      ).toBeLessThan(
        body.indexOf(
          'idempotentReplay: false'
        )
      );
    }
  );

  test(
    'shift opening audit is strict and inside the opening transaction',
    () => {
      const source =
        readController('shiftController.js');

      const body = exportSection(
        source,
        'exports.openShift = async'
      );

      expect(
        body.match(/action: 'SHIFT_OPENED'/g)
      ).toHaveLength(1);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'SHIFT_OPENED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO shifts'
        )
      );

      expect(
        body.indexOf(
          "action: 'SHIFT_OPENED'"
        )
      ).toBeLessThan(
        body.indexOf(
          'return openedShift'
        )
      );
    }
  );

  test(
    'shift closing audit is strict and inside the closing transaction',
    () => {
      const source =
        readController('shiftController.js');

      const body = exportSection(
        source,
        'exports.closeShift = async'
      );

      expect(
        body.match(/action: 'SHIFT_CLOSED'/g)
      ).toHaveLength(1);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'SHIFT_CLOSED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'UPDATE shifts SET'
        )
      );

      expect(
        body.indexOf(
          "action: 'SHIFT_CLOSED'"
        )
      ).toBeLessThan(
        body.indexOf(
          'return closedShift'
        )
      );
    }
  );
});

describe('Business subscription financial audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/subscriptionController.js'
    ),
    'utf8'
  );

  const section = (
    startMarker,
    endMarker
  ) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(
      endMarker,
      start
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
  };

  test(
    'payment submission audit is strict and transaction-scoped',
    () => {
      const body = section(
        'exports.submitPayment = async',
        'exports.verifyPayment = async'
      );

      expect(
        body.match(
          /action: 'SUBSCRIPTION_PAYMENT_SUBMITTED'/g
        )
      ).toHaveLength(1);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'SUBSCRIPTION_PAYMENT_SUBMITTED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO subscription_payments'
        )
      );

      expect(
        body.indexOf(
          "action: 'SUBSCRIPTION_PAYMENT_SUBMITTED'"
        )
      ).toBeLessThan(
        body.indexOf(
          'Notification delivery is post-commit'
        )
      );
    }
  );

  test(
    'payment verification uses canonical approved/rejected audit labels',
    () => {
      const body = section(
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async'
      );

      expect(body).toContain(
        "'SUBSCRIPTION_PAYMENT_APPROVED'"
      );

      expect(body).toContain(
        "'SUBSCRIPTION_PAYMENT_REJECTED'"
      );

      expect(body).not.toContain(
        '`${action.toUpperCase()}ED`'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );
    }
  );

  test(
    'verification audit occurs before post-commit external side effects',
    () => {
      const body = section(
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async'
      );

      const audit = body.indexOf(
        'const verificationAuditAction'
      );

      const postCommit = body.indexOf(
        'External side effects happen only after'
      );

      expect(audit).toBeGreaterThanOrEqual(0);
      expect(postCommit).toBeGreaterThan(audit);
    }
  );
});

describe('Personal transaction financial audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/personalTransactionController.js'
    ),
    'utf8'
  );

  const section = (
    startMarker,
    endMarker
  ) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(
      endMarker,
      start
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
  };

  test(
    'Personal initiation INSERT and audit share one transaction client',
    () => {
      const body = section(
        'exports.initiateTransaction = async',
        'exports.completeTransaction = async'
      );

      expect(body).toContain(
        'withTransaction(async (client)'
      );

      expect(
        body.match(
          /action:\s*'PERSONAL_TRANSACTION_INITIATED'/g
        )
      ).toHaveLength(1);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "'PERSONAL_TRANSACTION_INITIATED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO personal_transactions'
        )
      );
    }
  );

  test(
    'Personal completion locks the row and audits before commit',
    () => {
      const body = section(
        'exports.completeTransaction = async',
        'exports.listRecentTransactions = async'
      );

      expect(body).toContain(
        'withTransaction(async (client)'
      );

      expect(body).toContain(
        'FOR UPDATE'
      );

      expect(body).toContain(
        'status = $1::transaction_status'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          'await auditLog({'
        )
      ).toBeGreaterThan(
        body.indexOf(
          'UPDATE personal_transactions'
        )
      );
    }
  );
});

describe('Agent transaction initiation audit boundary', () => {
  const fs = require('fs');
  const path = require('path');

  test(
    'Agent transaction INSERT and initiation audit share one DB transaction',
    () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/controllers/transactionController.js'
        ),
        'utf8'
      );

      const start = source.indexOf(
        'exports.initiateTransaction = async'
      );

      const end = source.indexOf(
        'exports.completeTransaction = async',
        start
      );

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const body = source.slice(start, end);

      expect(
        body.match(/action: 'TRANSACTION_INITIATED'/g)
      ).toHaveLength(1);

      expect(body).toContain(
        'withTransaction(async (client)'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'TRANSACTION_INITIATED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO transactions'
        )
      );

      expect(
        body.indexOf(
          "action: 'TRANSACTION_INITIATED'"
        )
      ).toBeLessThan(
        body.indexOf(
          'return insertResult'
        )
      );
    }
  );
});

describe('Personal subscription financial audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/controllers/personalSubscriptionController.js'
    ),
    'utf8'
  );

  const section = (
    startMarker,
    endMarker
  ) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(
      endMarker,
      start
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    return source.slice(start, end);
  };

  test(
    'Personal subscription submission INSERT and audit share one transaction',
    () => {
      const body = section(
        'exports.submitPayment = async',
        'exports.verifyPayment = async'
      );

      expect(
        body.match(
          /action: 'PERSONAL_SUBSCRIPTION_PAYMENT_SUBMITTED'/g
        )
      ).toHaveLength(1);

      expect(body).toContain(
        'withTransaction(async (client)'
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "'PERSONAL_SUBSCRIPTION_PAYMENT_SUBMITTED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'INSERT INTO personal_subscription_payments'
        )
      );
    }
  );

  test(
    'Personal subscription verification audit is strict and transactional',
    () => {
      const body = section(
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async'
      );

      expect(body).toContain(
        "'PERSONAL_SUBSCRIPTION_PAYMENT_VERIFIED'"
      );

      expect(body).toContain(
        "'PERSONAL_SUBSCRIPTION_PAYMENT_REJECTED'"
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          'await auditLog({'
        )
      ).toBeGreaterThan(
        body.indexOf(
          'UPDATE personal_subscription_payments'
        )
      );
    }
  );

  test(
    'Personal subscription notification remains post-commit',
    () => {
      const body = section(
        'exports.verifyPayment = async',
        'exports.listPendingPayments = async'
      );

      const audit = body.indexOf(
        'await auditLog({'
      );

      const notification = body.indexOf(
        'Notification is an external post-commit side effect'
      );

      expect(audit).toBeGreaterThanOrEqual(0);
      expect(notification).toBeGreaterThan(audit);
    }
  );
});

describe('scheduled subscription audit boundaries', () => {
  const fs = require('fs');
  const path = require('path');

  test(
    'production scheduler atomically expires Personal subscriptions',
    () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/jobs/scheduler.js'
        ),
        'utf8'
      );

      const start = source.indexOf(
        'async function expirePersonalSubscriptions()'
      );

      const end = source.indexOf(
        'async function sendSubscriptionReminders()',
        start
      );

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const body = source.slice(start, end);

      expect(body).toContain(
        'withTransaction(async (client)'
      );

      expect(body).toContain(
        'UPDATE personal_subscriptions'
      );

      expect(body).toContain(
        "action: 'PERSONAL_SUBSCRIPTION_EXPIRED'"
      );

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );

      expect(
        body.indexOf(
          "action: 'PERSONAL_SUBSCRIPTION_EXPIRED'"
        )
      ).toBeGreaterThan(
        body.indexOf(
          'UPDATE personal_subscriptions'
        )
      );
    }
  );

  test(
    'Business expiry suspends subscription and staff before strict audit',
    () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/jobs/scheduler.js'
        ),
        'utf8'
      );

      const start = source.indexOf(
        'async function suspendExpiredSubscriptions()'
      );

      const end = source.indexOf(
        'async function expireOldAds()',
        start
      );

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const body = source.slice(start, end);

      const subscriptionUpdate =
        body.indexOf(
          'UPDATE subscriptions'
        );

      const userUpdate =
        body.indexOf(
          'UPDATE users'
        );

      const audit =
        body.indexOf(
          "action: 'SUBSCRIPTION_SUSPENDED_EXPIRED'"
        );

      const notification =
        body.indexOf(
          'await sendSubscriptionSuspended('
        );

      expect(subscriptionUpdate)
        .toBeGreaterThanOrEqual(0);

      expect(userUpdate)
        .toBeGreaterThan(subscriptionUpdate);

      expect(audit)
        .toBeGreaterThan(userUpdate);

      expect(notification)
        .toBeGreaterThan(audit);

      expect(body).toContain(
        'dbClient: client'
      );

      expect(body).toContain(
        'strict: true'
      );
    }
  );

  test(
    'duplicate controller renewal mutator has been removed',
    () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../src/controllers/subscriptionController.js'
        ),
        'utf8'
      );

      expect(source).not.toContain(
        'exports.sendRenewalReminders = async'
      );
    }
  );
});
