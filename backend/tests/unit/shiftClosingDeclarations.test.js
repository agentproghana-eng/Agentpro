jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/agentWalletService', () => ({
  getOrCreateAgentSimWallet: jest.fn(),
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

const {
  auditLog,
} = require('../../src/services/auditService');

const shiftController =
  require('../../src/controllers/shiftController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Shift closing declarations', () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
    auditLog.mockReset();
  });

  test('reconciles explicit closing Cash at Hand declaration without changing the cash ledger', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          value: '20.00',
        }],
      });

    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            total: '410.00',
          }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{
            count: '3',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'shift-1',
            status: 'closed',
            closing_cash_expected: '410.00',
            closing_cash_actual: '425.00',
            variance: '15.00',
            transaction_count: 3,
          }],
        }),
    };

    withTransaction.mockImplementation(
      async (callback) => callback(client),
    );

    auditLog.mockResolvedValue();

    const req = {
      params: {
        shift_id: 'shift-1',
      },
      user: {
        id: 'agent-1',
        company_id: 'company-1',
      },
      body: {
        closing_cash_declared: '425.00',
        notes: 'Counted at close',
      },
      ip: '127.0.0.1',
      requestId: 'request-close-1',
    };

    const res = makeRes();

    await shiftController.closeShift(req, res);

    expect(withTransaction).toHaveBeenCalledTimes(1);

    expect(client.query).toHaveBeenCalledTimes(4);

    const [cashSql, cashParams] =
      client.query.mock.calls[0];

    expect(cashSql).toContain(
      'FROM agent_cash_balances',
    );

    expect(cashParams).toEqual([
      'agent-1',
    ]);

    const [updateSql, updateParams] =
      client.query.mock.calls[3];

    expect(updateSql).toContain(
      'closing_cash_expected',
    );

    expect(updateSql).toContain(
      'closing_cash_actual',
    );

    expect(updateSql).toContain(
      'variance',
    );

    expect(updateParams).toEqual([
      410,
      425,
      15,
      425,
      15,
      3,
      'Counted at close',
      'shift-1',
    ]);

    const allSql = client.query.mock.calls
      .map(([sql]) => sql)
      .join('\n');

    expect(allSql).not.toContain(
      'UPDATE agent_cash_balances',
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        closing_cash_expected: '410.00',
        closing_cash_actual: '425.00',
        variance: '15.00',
        flagged: false,
        threshold: 20,
      }),
    });
  });
});

test('rejects a negative closing Cash at Hand declaration before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '-1.00',
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'closing_cash_declared is required and must be a non-negative number',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});

test('reconciles closing electronic balances against the same exact SIM wallets captured at opening', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM shifts') &&
      sql.includes("status = 'open'")
    ) {
      return {
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      };
    }

    if (sql.includes('FROM system_config')) {
      return {
        rows: [{
          value: '20.00',
        }],
      };
    }

    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM agent_cash_balances')) {
        return {
          rows: [{
            total: '410.00',
          }],
        };
      }

      if (
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [
            {
              snapshot_id: 'snap-mtn-float',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'e_float',
              closing_expected: '990.00',
            },
            {
              snapshot_id: 'snap-mtn-commission',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'commission',
              closing_expected: '42.00',
            },
            {
              snapshot_id: 'snap-telecel-float',
              sim_wallet_id: 'wallet-telecel-2',
              provider: 'telecel',
              balance_type: 'e_float',
              closing_expected: '615.00',
            },
            {
              snapshot_id: 'snap-telecel-commission',
              sim_wallet_id: 'wallet-telecel-2',
              provider: 'telecel',
              balance_type: 'commission',
              closing_expected: '26.00',
            },
            {
              snapshot_id: 'snap-telecel-working',
              sim_wallet_id: 'wallet-telecel-2',
              provider: 'telecel',
              balance_type: 'working_balance',
              closing_expected: '400.00',
            },
          ],
        };
      }

      if (
        sql.includes(
          'UPDATE shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [],
        };
      }

      if (
        sql.includes('SELECT COUNT(*)') &&
        sql.includes('FROM transactions')
      ) {
        return {
          rows: [{
            count: '3',
          }],
        };
      }

      if (sql.includes('UPDATE shifts SET')) {
        return {
          rows: [{
            id: 'shift-1',
            status: 'closed',
            closing_cash_expected: '410.00',
            closing_cash_actual: '425.00',
            variance: '15.00',
            transaction_count: 3,
          }],
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  auditLog.mockResolvedValue();

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [
        {
          sim_wallet_id: 'wallet-mtn-1',
          e_float_declared: '980.00',
          commission_declared: '41.00',
        },
        {
          sim_wallet_id: 'wallet-telecel-2',
          e_float_declared: '610.00',
          commission_declared: '25.00',
          working_declared: '405.00',
        },
      ],
      notes: 'Counted at close',
    },
    ip: '127.0.0.1',
    requestId: 'request-close-sim-1',
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  const snapshotSelectCall =
    client.query.mock.calls.find(
      ([sql]) =>
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        ),
    );

  expect(snapshotSelectCall).toBeDefined();

  const [snapshotSql, snapshotParams] =
    snapshotSelectCall;

  expect(snapshotSql).toContain(
    'JOIN agent_sim_wallets',
  );

  expect(snapshotParams).toEqual([
    'shift-1',
  ]);

  const snapshotUpdateCalls =
    client.query.mock.calls.filter(
      ([sql]) =>
        sql.includes(
          'UPDATE shift_sim_balance_snapshots',
        ),
    );

  expect(
    snapshotUpdateCalls.map(([, params]) => params),
  ).toEqual([
    [
      990,
      980,
      -10,
      'snap-mtn-float',
    ],
    [
      42,
      41,
      -1,
      'snap-mtn-commission',
    ],
    [
      615,
      610,
      -5,
      'snap-telecel-float',
    ],
    [
      26,
      25,
      -1,
      'snap-telecel-commission',
    ],
    [
      400,
      405,
      5,
      'snap-telecel-working',
    ],
  ]);

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE agent_sim_wallets',
  );

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({
      closing_cash_expected: '410.00',
      closing_cash_actual: '425.00',
      variance: '15.00',
      flagged: false,
      threshold: 20,
    }),
  });
});

test('does not close a shift when a required SIM balance declaration is missing', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM shifts') &&
      sql.includes("status = 'open'")
    ) {
      return {
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      };
    }

    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM agent_cash_balances')) {
        return {
          rows: [{
            total: '410.00',
          }],
        };
      }

      if (
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [
            {
              snapshot_id: 'snap-mtn-float',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'e_float',
              closing_expected: '990.00',
            },
            {
              snapshot_id: 'snap-mtn-commission',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'commission',
              closing_expected: '42.00',
            },
          ],
        };
      }

      if (
        sql.includes(
          'UPDATE shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [],
        };
      }

      if (
        sql.includes('SELECT COUNT(*)') &&
        sql.includes('FROM transactions')
      ) {
        return {
          rows: [{
            count: '3',
          }],
        };
      }

      if (sql.includes('UPDATE shifts SET')) {
        return {
          rows: [{
            id: 'shift-1',
            status: 'closed',
          }],
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [{
        sim_wallet_id: 'wallet-mtn-1',

        // Float intentionally omitted.
        commission_declared: '41.00',
      }],
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'e_float_declared is required for every closing SIM balance and must be a non-negative number',
  });

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE shifts SET',
  );

  expect(auditLog).not.toHaveBeenCalled();
});

test('does not close a shift with electronic snapshots when closing SIM declarations are omitted', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM shifts') &&
      sql.includes("status = 'open'")
    ) {
      return {
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      };
    }

    if (sql.includes('FROM system_config')) {
      return {
        rows: [{
          value: '20.00',
        }],
      };
    }

    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM agent_cash_balances')) {
        return {
          rows: [{
            total: '410.00',
          }],
        };
      }

      if (
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [{
            snapshot_id: 'snap-mtn-float',
            sim_wallet_id: 'wallet-mtn-1',
            provider: 'mtn',
            balance_type: 'e_float',
            closing_expected: '990.00',
          }],
        };
      }

      if (
        sql.includes('SELECT COUNT(*)') &&
        sql.includes('FROM transactions')
      ) {
        return {
          rows: [{
            count: '3',
          }],
        };
      }

      if (sql.includes('UPDATE shifts SET')) {
        return {
          rows: [{
            id: 'shift-1',
            status: 'closed',
          }],
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',

      // Entire electronic declaration intentionally omitted.
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'closing_sim_balances is required because this shift has electronic balance snapshots',
  });

  const snapshotSelectCall =
    client.query.mock.calls.find(
      ([sql]) =>
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        ),
    );

  expect(snapshotSelectCall).toBeDefined();

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE shifts SET',
  );

  expect(auditLog).not.toHaveBeenCalled();
});

test('rejects non-array closing SIM declarations before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: {
        sim_wallet_id: 'wallet-mtn-1',
        e_float_declared: '980.00',
        commission_declared: '41.00',
      },
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'closing_sim_balances must be an array',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});

test('rejects a closing SIM wallet that was not captured when the shift opened', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM shifts') &&
      sql.includes("status = 'open'")
    ) {
      return {
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      };
    }

    if (sql.includes('FROM system_config')) {
      return {
        rows: [{
          value: '20.00',
        }],
      };
    }

    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM agent_cash_balances')) {
        return {
          rows: [{
            total: '410.00',
          }],
        };
      }

      if (
        sql.includes(
          'FROM shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [
            {
              snapshot_id: 'snap-mtn-float',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'e_float',
              closing_expected: '990.00',
            },
            {
              snapshot_id: 'snap-mtn-commission',
              sim_wallet_id: 'wallet-mtn-1',
              provider: 'mtn',
              balance_type: 'commission',
              closing_expected: '42.00',
            },
          ],
        };
      }

      if (
        sql.includes(
          'UPDATE shift_sim_balance_snapshots',
        )
      ) {
        return {
          rows: [],
        };
      }

      if (
        sql.includes('SELECT COUNT(*)') &&
        sql.includes('FROM transactions')
      ) {
        return {
          rows: [{
            count: '3',
          }],
        };
      }

      if (sql.includes('UPDATE shifts SET')) {
        return {
          rows: [{
            id: 'shift-1',
            status: 'closed',
          }],
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client),
  );

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [
        {
          sim_wallet_id: 'wallet-mtn-1',
          e_float_declared: '980.00',
          commission_declared: '41.00',
        },
        {
          // This wallet did not exist in this shift's opening snapshots.
          sim_wallet_id: 'wallet-unknown',
          e_float_declared: '500.00',
          commission_declared: '10.00',
        },
      ],
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'closing_sim_balances contains a SIM wallet that was not captured when this shift opened',
  });

  const snapshotUpdates =
    client.query.mock.calls.filter(
      ([sql]) =>
        sql.includes(
          'UPDATE shift_sim_balance_snapshots',
        ),
    );

  expect(snapshotUpdates).toHaveLength(0);

  const allSql = client.query.mock.calls
    .map(([sql]) => sql)
    .join('\n');

  expect(allSql).not.toContain(
    'UPDATE shifts SET',
  );

  expect(auditLog).not.toHaveBeenCalled();
});

test('rejects duplicate closing declarations for the same SIM wallet before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [
        {
          sim_wallet_id: 'wallet-mtn-1',
          e_float_declared: '980.00',
          commission_declared: '41.00',
        },
        {
          sim_wallet_id: 'wallet-mtn-1',
          e_float_declared: '970.00',
          commission_declared: '40.00',
        },
      ],
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'closing_sim_balances must not contain duplicate sim_wallet_id values',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});

test('rejects malformed closing SIM declaration entries before database work', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [
        null,
      ],
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message:
      'every closing SIM balance must include a valid sim_wallet_id',
  });

  expect(query).not.toHaveBeenCalled();
  expect(withTransaction).not.toHaveBeenCalled();
  expect(auditLog).not.toHaveBeenCalled();
});

test('persists canonical closing cash declaration and variance alongside legacy compatibility fields', async () => {
  query.mockReset();
  withTransaction.mockReset();
  auditLog.mockReset();

  query.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM shifts') &&
      sql.includes("status = 'open'")
    ) {
      return {
        rows: [{
          id: 'shift-1',
          agent_id: 'agent-1',
          company_id: 'company-1',
          status: 'open',
          opened_at: '2026-08-11T08:00:00.000Z',
        }],
      };
    }

    if (sql.includes('FROM system_config')) {
      return {
        rows: [{
          value: '20.00',
        }],
      };
    }

    throw new Error(`Unexpected outer query: ${sql}`);
  });

  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM agent_cash_balances')) {
        return {
          rows: [{
            total: '410.00',
          }],
        };
      }

      if (sql.includes('FROM shift_sim_balance_snapshots')) {
        return {
          rows: [],
        };
      }

      if (
        sql.includes('SELECT COUNT(*)') &&
        sql.includes('FROM transactions')
      ) {
        return {
          rows: [{
            count: '3',
          }],
        };
      }

      if (sql.includes('UPDATE shifts SET')) {
        expect(sql).toContain(
          'closing_cash_declared = $2'
        );
        expect(sql).toContain(
          'closing_cash_variance = $3'
        );
        expect(sql).toContain(
          'closing_cash_actual = $4'
        );
        expect(sql).toContain(
          'variance = $5'
        );

        return {
          rows: [{
            id: 'shift-1',
            status: 'closed',
            closing_cash_expected: '410.00',
            closing_cash_declared: '425.00',
            closing_cash_variance: '15.00',
            closing_cash_actual: '425.00',
            variance: '15.00',
          }],
        };
      }

      throw new Error(`Unexpected client query: ${sql}`);
    }),
  };

  withTransaction.mockImplementation(
    async (callback) => callback(client)
  );

  const req = {
    params: {
      shift_id: 'shift-1',
    },
    user: {
      id: 'agent-1',
      company_id: 'company-1',
    },
    body: {
      closing_cash_declared: '425.00',
      closing_sim_balances: [],
    },
  };

  const res = makeRes();

  await shiftController.closeShift(req, res);

  expect(res.status).not.toHaveBeenCalledWith(500);

  const updateCall = client.query.mock.calls.find(
    ([sql]) => sql.includes('UPDATE shifts SET')
  );

  expect(updateCall).toBeDefined();

  const [, params] = updateCall;

  expect(params).toEqual([
    410,
    425,
    15,
    425,
    15,
    3,
    null,
    'shift-1',
  ]);
});
