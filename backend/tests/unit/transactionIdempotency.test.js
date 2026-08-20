// ============================================================
// Transaction Idempotency Tests
// ============================================================

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockWithTransaction = jest.fn();

const mockAuditLog = jest.fn();
const mockSendTransactionNotification = jest.fn();
const mockEnqueueOutboxEvent = jest.fn();
const mockGenerateTransactionReceipt = jest.fn();

const mockCalculateAndPostCommission = jest.fn();
const mockPostCommissionTransfer = jest.fn();
const mockPostCashIn = jest.fn();
const mockPostCashOut = jest.fn();
const mockPostSendMoney = jest.fn();
const mockPostAirtime = jest.fn();
const mockPostDataBundle = jest.fn();
const mockPostMerchantPayment = jest.fn();
const mockPostPayToAgent = jest.fn();
const mockPostWorkingFloatTransfer = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock('../../src/services/notificationService', () => ({
  sendTransactionNotification: (...args) =>
    mockSendTransactionNotification(...args),
}));

jest.mock('../../src/services/outboxService', () => ({
  enqueueOutboxEvent: (...args) =>
    mockEnqueueOutboxEvent(...args),
}));

jest.mock('../../src/services/reportService', () => ({
  generateTransactionReceipt: (...args) =>
    mockGenerateTransactionReceipt(...args),
}));

jest.mock('../../src/services/commissionPostingService', () => ({
  calculateAndPostCommission: (...args) =>
    mockCalculateAndPostCommission(...args),
}));

jest.mock('../../src/services/commissionTransferPostingService', () => ({
  postCommissionTransfer: (...args) =>
    mockPostCommissionTransfer(...args),
}));


jest.mock('../../src/services/cashInPostingService', () => ({
  postCashIn: (...args) =>
    mockPostCashIn(...args),
}));


jest.mock('../../src/services/cashOutPostingService', () => ({
  postCashOut: (...args) =>
    mockPostCashOut(...args),
}));

jest.mock('../../src/services/sendMoneyPostingService', () => ({
  postSendMoney: (...args) =>
    mockPostSendMoney(...args),
}));

jest.mock('../../src/services/airtimePostingService', () => ({
  postAirtime: (...args) =>
    mockPostAirtime(...args),
}));

jest.mock('../../src/services/dataBundlePostingService', () => ({
  postDataBundle: (...args) =>
    mockPostDataBundle(...args),
}));

jest.mock('../../src/services/merchantPaymentPostingService', () => ({
  postMerchantPayment: (...args) =>
    mockPostMerchantPayment(...args),
}));

jest.mock('../../src/services/payToAgentPostingService', () => ({
  postPayToAgent: (...args) =>
    mockPostPayToAgent(...args),
}));

jest.mock('../../src/services/workingFloatPostingService', () => ({
  postWorkingFloatTransfer: (...args) =>
    mockPostWorkingFloatTransfer(...args),
}));


jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const transactionController =
  require('../../src/controllers/transactionController');

const operationId = '9a38a665-7b23-4bc4-9338-b8f50bca7d03';

function makeReq(body = {}) {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      role: 'agent',
    },
    body: {
      provider: 'mtn',
      transaction_type: 'cash_in',
      amount: 100,
      customer_phone: '',
      customer_name: '',
      recipient_phone: '',
      recipient_name: '',
      biller_code: '',
      biller_name: '',
      account_number: '',
      notes: '',
      fee: 0,
      payment_reference: '',
      merchant_id: '',
      sim_iccid: 'ICCID-DEFAULT',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10,
      client_operation_id: operationId,
      ...body,
    },
    params: {},
    ip: '127.0.0.1',
    requestId: 'request-1',
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);

  return res;
}

function existingTransaction(overrides = {}) {
  return {
    id: 'tx-1',
    reference: 'APG-TEST-001',
    status: 'initiated',
    created_at: new Date('2026-08-09T00:00:00Z'),
    provider: 'mtn',
    transaction_type: 'cash_in',
    amount: '100.00',
    customer_phone: '',
    customer_name: '',
    recipient_phone: '',
    recipient_name: '',
    biller_code: '',
    biller_name: '',
    account_number: '',
    notes: '',
    fee: '0.00',
    payment_reference: '',
    merchant_id: '',
    sim_iccid: 'ICCID-DEFAULT',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 10,
    agent_id: 'agent-1',
    branch_id: 'branch-1',
    company_id: 'company-1',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Prevent a transaction-client implementation from leaking between
  // initiation and completion tests.
  mockClientQuery.mockReset();

  mockAuditLog.mockResolvedValue(undefined);
  mockSendTransactionNotification.mockResolvedValue(undefined);

  mockEnqueueOutboxEvent.mockImplementation(
    async (event) => {
      await mockSendTransactionNotification(
        event.payload.agent_id,
        {
          type: event.payload.type,
          transaction:
            event.payload.transaction,
        }
      );

      return {
        id: 'outbox-event-1',
        status: 'pending',
        deduplicated: false,
      };
    }
  );

  mockGenerateTransactionReceipt.mockResolvedValue(null);

  mockCalculateAndPostCommission.mockResolvedValue(null);
  mockPostCommissionTransfer.mockResolvedValue({
    simWalletId: 'sim-wallet-1',
  });

  mockPostCashIn.mockResolvedValue({
    simWalletId: 'sim-wallet-cash-in',
  });

  mockPostCashOut.mockResolvedValue({
    simWalletId: 'sim-wallet-cash-out',
  });

  mockPostSendMoney.mockResolvedValue({
    simWalletId: 'sim-wallet-send-money',
  });

  mockPostAirtime.mockResolvedValue({
    simWalletId: 'sim-wallet-airtime',
  });

  mockPostDataBundle.mockResolvedValue({
    simWalletId: 'sim-wallet-data-bundle',
  });

  mockPostMerchantPayment.mockResolvedValue({
    simWalletId: 'sim-wallet-merchant-payment',
  });

  mockPostPayToAgent.mockResolvedValue({
    simWalletId: 'sim-wallet-pay-to-agent',
    cashBalanceId: 'cash-pay-to-agent',
  });

  mockPostWorkingFloatTransfer.mockResolvedValue({
    simWalletId: 'sim-wallet-working-float',
  });


  mockWithTransaction.mockImplementation(async (callback) => {
    return callback({
      query: mockClientQuery,
    });
  });
});

describe('Transaction initiation idempotency', () => {
  beforeEach(() => {
    // Initiation now performs only its INSERT through the transaction
    // client. Delegate that client to the suite's existing query mock so
    // all idempotency/preflight fixtures retain their original behavior.
    mockClientQuery.mockImplementation(
      (...args) => mockQuery(...args)
    );
  });

  it('returns the existing transaction for the same client operation', async () => {
    const existing = existingTransaction();

    mockQuery.mockResolvedValueOnce({
      rows: [existing],
    });

    const req = makeReq();
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transaction_id: 'tx-1',
          reference: 'APG-TEST-001',
          idempotent_replay: true,
        }),
      }),
    );

    // A replay must not continue into preflight or INSERT.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of the operation ID for different transaction data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [existingTransaction()],
    });

    const req = makeReq({
      amount: 250,
    });

    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message:
          'client_operation_id has already been used for a different transaction',
      }),
    );
  });

  it('replays safely for the same identified ICCID and slot', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: 'ICCID-A',
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: 'ICCID-A',
      sim_slot: 1,

      // Fallback metadata must not override a real ICCID identity.
      installation_id: '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 99,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse when the identified ICCID changes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: 'ICCID-A',
          sim_slot: 1,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: 'ICCID-B',
      sim_slot: 1,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('replays safely for the same unresolved installation subscription and slot', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects unresolved replay when the installation changes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '22222222-2222-4222-8222-222222222222',
      sim_subscription_id: 10,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects unresolved replay when the subscription changes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 1,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 11,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects unresolved replay when the SIM slot changes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          sim_iccid: null,
          sim_slot: 1,
          installation_id: '11111111-1111-4111-8111-111111111111',
          sim_subscription_id: 10,
        }),
      ],
    });

    const req = makeReq({
      sim_iccid: null,
      sim_slot: 0,
      installation_id: '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10,
    });
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('still replays a historical Telecel canonical Cash Out before enforcing the manual-path guard', async () => {
  const existing = existingTransaction({
    provider: 'telecel',
    transaction_type: 'cash_out',
  });

  mockQuery.mockResolvedValueOnce({
    rows: [existing],
  });

  const req = makeReq({
    provider: 'telecel',
    transaction_type: 'cash_out',
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );

  // Historical replay must return before the new-operation guard/preflight.
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it.each(['telecel', 'at_money'])(
  'rejects a new %s canonical Cash Out and requires the manual path',
  async (provider) => {
    const req = makeReq({
      provider,
      transaction_type: 'cash_out',
      client_operation_id: null,
    });

    const res = makeRes();

    await transactionController.initiateTransaction(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'CASH_OUT_MANUAL_REQUIRED',
      }),
    );

    // Must reject before branch/template/flow preflight or INSERT.
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('still replays a historical non-Telecel Working to Float before enforcing the Telecel-only guard', async () => {
  const existing = existingTransaction({
    provider: 'mtn',
    transaction_type: 'working_to_float',
  });

  mockQuery.mockResolvedValueOnce({
    rows: [existing],
  });

  const req = makeReq({
    provider: 'mtn',
    transaction_type: 'working_to_float',
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );

  // Historical replay must return before the new-operation provider guard.
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it.each([
  ['working_to_float', 'mtn'],
  ['working_to_float', 'at_money'],
  ['float_to_working', 'mtn'],
  ['float_to_working', 'at_money'],
])(
  'rejects new %s for %s before preflight',
  async (transactionType, provider) => {
    const req = makeReq({
      provider,
      transaction_type: transactionType,
      client_operation_id: null,
    });

    const res = makeRes();

    await transactionController.initiateTransaction(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'WORKING_FLOAT_TELECEL_ONLY',
      }),
    );

    // Reject before SIM identity, branch/template/flow preflight or INSERT.
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('still replays a historical Telecel Agent Pay to Agent before enforcing the MTN-only guard', async () => {
  const existing = existingTransaction({
    provider: 'telecel',
    transaction_type: 'bill_payment',
  });

  mockQuery.mockResolvedValueOnce({
    rows: [existing],
  });

  const req = makeReq({
    provider: 'telecel',
    transaction_type: 'bill_payment',
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );

  // Historical replay must return before the new-operation provider guard.
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it.each([
  'telecel',
  'at_money',
])(
  'rejects a new %s Agent Pay to Agent before preflight',
  async (provider) => {
    const req = makeReq({
      provider,
      transaction_type: 'bill_payment',
      client_operation_id: null,
    });

    const res = makeRes();

    await transactionController.initiateTransaction(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PAY_TO_AGENT_MTN_ONLY',
      }),
    );

    // Reject before SIM identity, branch/template/flow preflight or INSERT.
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('still replays a historical Telecel Agent Merchant Payment before enforcing the MTN-only guard', async () => {
  const existing = existingTransaction({
    provider: 'telecel',
    transaction_type: 'merchant_payment',
  });

  mockQuery.mockResolvedValueOnce({
    rows: [existing],
  });

  const req = makeReq({
    provider: 'telecel',
    transaction_type: 'merchant_payment',
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );

  // Historical replay must return before the new-operation provider guard.
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it.each([
  'telecel',
  'at_money',
])(
  'rejects a new %s Agent Merchant Payment before preflight',
  async (provider) => {
    const req = makeReq({
      provider,
      transaction_type: 'merchant_payment',
      client_operation_id: null,
    });

    const res = makeRes();

    await transactionController.initiateTransaction(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'MERCHANT_PAYMENT_MTN_ONLY',
      }),
    );

    // Reject before SIM identity, branch/template/flow preflight or INSERT.
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('still replays a historical operation that has no SIM identity', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [
      existingTransaction({
        sim_iccid: null,
        sim_slot: null,
        installation_id: null,
        sim_subscription_id: null,
      }),
    ],
  });

  const req = makeReq({
    sim_iccid: null,
    sim_slot: null,
    installation_id: null,
    sim_subscription_id: null,
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );

  // Historical replay resolves before the new identity invariant.
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it('rejects a new transaction with provider and slot only', async () => {
  const req = makeReq({
    client_operation_id: null,
    sim_iccid: null,
    sim_slot: 0,
    installation_id: null,
    sim_subscription_id: null,
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      code: 'SIM_IDENTITY_REQUIRED',
    }),
  );

  // Must fail before branch/template/flow preflight.
  expect(mockQuery).not.toHaveBeenCalled();
});

it('rejects a new identified SIM when its slot is missing', async () => {
  const req = makeReq({
    client_operation_id: null,
    sim_iccid: 'ICCID-A',
    sim_slot: null,
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      code: 'SIM_IDENTITY_REQUIRED',
    }),
  );

  expect(mockQuery).not.toHaveBeenCalled();
});

it('rejects a partial unresolved SIM identity', async () => {
  const req = makeReq({
    client_operation_id: null,
    sim_iccid: null,
    sim_slot: 1,
    installation_id:
      '22222222-2222-4222-8222-222222222222',
    sim_subscription_id: null,
  });

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  expect(res.status).toHaveBeenCalledWith(422);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      code: 'SIM_IDENTITY_REQUIRED',
    }),
  );

  expect(mockQuery).not.toHaveBeenCalled();
});

it('accepts a complete unresolved SIM identity for a new transaction', async () => {
  let operationLookupCount = 0;

  const unresolvedIdentity = {
    sim_iccid: null,
    sim_slot: 1,
    installation_id:
      '22222222-2222-4222-8222-222222222222',
    sim_subscription_id: 22,
  };

  mockQuery.mockImplementation(async (sql) => {
    if (
      sql.includes('FROM transactions') &&
      sql.includes('client_operation_id')
    ) {
      operationLookupCount += 1;

      if (operationLookupCount === 1) {
        return { rows: [] };
      }

      return {
        rows: [
          existingTransaction(
            unresolvedIdentity
          ),
        ],
      };
    }

    if (sql.includes('FROM system_config')) {
      return { rows: [] };
    }

    if (sql.includes('FROM branches')) {
      return {
        rows: [{ id: 'branch-1' }],
      };
    }

    if (sql.includes('FROM ussd_templates')) {
      return {
        rows: [{ id: 'template-1' }],
      };
    }

    if (sql.includes('FROM ussd_flows')) {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO transactions')) {
      const error = new Error('duplicate key');
      error.code = '23505';
      error.constraint =
        'idx_transactions_agent_client_operation';
      throw error;
    }

    throw new Error(
      `Unexpected SQL in test: ${sql}`
    );
  });

  const req = makeReq(
    unresolvedIdentity
  );

  const res = makeRes();

  await transactionController.initiateTransaction(
    req,
    res
  );

  // Reaching the concurrent INSERT recovery proves the complete
  // unresolved identity passed the new identity invariant.
  expect(res.status).toHaveBeenCalledWith(200);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      message:
        'Existing transaction returned for concurrent retry.',
      data: expect.objectContaining({
        transaction_id: 'tx-1',
        idempotent_replay: true,
      }),
    }),
  );
});

it('accepts identified ICCID and slot and returns the winning concurrent transaction', async () => {
    let operationLookupCount = 0;

    mockQuery.mockImplementation(async (sql) => {
      if (
        sql.includes('FROM transactions') &&
        sql.includes('client_operation_id')
      ) {
        operationLookupCount += 1;

        if (operationLookupCount === 1) {
          return { rows: [] };
        }

        return {
          rows: [existingTransaction()],
        };
      }

      if (sql.includes('FROM system_config')) {
        return { rows: [] };
      }

      if (sql.includes('FROM branches')) {
        return {
          rows: [{ id: 'branch-1' }],
        };
      }

      if (sql.includes('FROM ussd_templates')) {
        return {
          rows: [{ id: 'template-1' }],
        };
      }

      if (sql.includes('FROM ussd_flows')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO transactions')) {
        const error = new Error('duplicate key');
        error.code = '23505';
        error.constraint =
          'idx_transactions_agent_client_operation';
        throw error;
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    const req = makeReq();
    const res = makeRes();

    await transactionController.initiateTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message:
          'Existing transaction returned for concurrent retry.',
        data: expect.objectContaining({
          transaction_id: 'tx-1',
          idempotent_replay: true,
        }),
      }),
    );
  });
});

describe('Transaction completion idempotency', () => {
  it('routes successful Commission Transfer only to exact-SIM posting', async () => {
    const initiated = existingTransaction({
      status: 'initiated',
      transaction_type: 'commission_transfer',
      amount: '25.00',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference: 'NETWORK-COMMISSION-001',
      sim_wallet_id: 'sim-wallet-1',
    };

    // 1. Lock canonical transaction.
    // 2. Update final transaction status.
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    // Success completion reloads the transaction for receipt generation
    // and once more for the final API response.
    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();
    req.params = {
      transaction_id: 'tx-1',
    };
    req.body = {
      status: 'success',
      network_reference: 'NETWORK-COMMISSION-001',
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(req, res);

    expect(mockPostCommissionTransfer).toHaveBeenCalledTimes(1);

    expect(mockPostCommissionTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    // Commission Transfer is movement of existing commission into
    // e-Float. It must not earn another commission.
    expect(mockCalculateAndPostCommission).not.toHaveBeenCalled();

    // It is also not branch treasury float activity.
    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id: 'sim-wallet-1',
        }),
      }),
    );
  });

  it('posts Cash In principal balances before earned commission', async () => {
  const initiated = existingTransaction({
    status: 'initiated',
    transaction_type: 'cash_in',
    amount: '100.00',
    sim_iccid: '8901000000000000001',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 7,
    sim_wallet_id: null,
  });

  const completed = {
    ...initiated,
    status: 'success',
    network_reference: 'NETWORK-CASH-IN-001',
    sim_wallet_id: 'sim-wallet-cash-in',
  };

  // 1. Lock canonical transaction.
  // 2. Persist final successful status.
  mockClientQuery
    .mockResolvedValueOnce({
      rows: [initiated],
    })
    .mockResolvedValueOnce({
      rows: [],
    });

  mockQuery.mockResolvedValue({
    rows: [completed],
  });

  const req = makeReq();

  req.params = {
    transaction_id: 'tx-1',
  };

  req.body = {
    status: 'success',
    network_reference: 'NETWORK-CASH-IN-001',
    failure_reason: null,
    ussd_session_log: [],
  };

  const res = makeRes();

  await transactionController.completeTransaction(
    req,
    res
  );

  expect(mockPostCashIn).toHaveBeenCalledTimes(1);

  expect(mockPostCashIn).toHaveBeenCalledWith(
    expect.objectContaining({
      query: mockClientQuery,
    }),
    initiated,
    'agent-1',
  );

  expect(
    mockCalculateAndPostCommission
  ).toHaveBeenCalledTimes(1);

  expect(
    mockCalculateAndPostCommission
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      query: mockClientQuery,
    }),
    initiated,
    'agent-1',
  );

  // Principal posting must happen before earned commission.
  expect(
    mockPostCashIn.mock.invocationCallOrder[0]
  ).toBeLessThan(
    mockCalculateAndPostCommission.mock.invocationCallOrder[0]
  );

  expect(
    mockPostCommissionTransfer
  ).not.toHaveBeenCalled();

  // Cash In is agent SIM/cash-drawer activity, never branch treasury.
  const clientSql = mockClientQuery.mock.calls
    .map(([sql]) => String(sql))
    .join('\n');

  expect(clientSql).not.toContain('float_accounts');
  expect(clientSql).not.toContain('float_movements');

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'tx-1',
        status: 'success',
        sim_wallet_id: 'sim-wallet-cash-in',
      }),
    }),
  );
});

it('posts MTN Cash Out principal balances before earned commission', async () => {
  const initiated = existingTransaction({
    status: 'initiated',
    provider: 'mtn',
    transaction_type: 'cash_out',
    amount: '100.00',
    sim_iccid: '8901000000000000001',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 7,
    sim_wallet_id: null,
  });

  const completed = {
    ...initiated,
    status: 'success',
    network_reference: 'NETWORK-CASH-OUT-001',
    sim_wallet_id: 'sim-wallet-cash-out',
  };

  mockClientQuery
    .mockResolvedValueOnce({
      rows: [initiated],
    })
    .mockResolvedValueOnce({
      rows: [],
    });

  mockQuery.mockResolvedValue({
    rows: [completed],
  });

  const req = makeReq();

  req.params = {
    transaction_id: 'tx-1',
  };

  req.body = {
    status: 'success',
    network_reference: 'NETWORK-CASH-OUT-001',
    failure_reason: null,
    ussd_session_log: [],
  };

  const res = makeRes();

  await transactionController.completeTransaction(
    req,
    res
  );

  expect(mockPostCashOut).toHaveBeenCalledTimes(1);

  expect(mockPostCashOut).toHaveBeenCalledWith(
    expect.objectContaining({
      query: mockClientQuery,
    }),
    initiated,
    'agent-1',
  );

  expect(
    mockCalculateAndPostCommission
  ).toHaveBeenCalledTimes(1);

  expect(
    mockPostCashOut.mock.invocationCallOrder[0]
  ).toBeLessThan(
    mockCalculateAndPostCommission.mock.invocationCallOrder[0]
  );

  expect(mockPostCashIn).not.toHaveBeenCalled();
  expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

  const clientSql = mockClientQuery.mock.calls
    .map(([sql]) => String(sql))
    .join('\n');

  expect(clientSql).not.toContain('float_accounts');
  expect(clientSql).not.toContain('float_movements');

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'tx-1',
        status: 'success',
        sim_wallet_id: 'sim-wallet-cash-out',
      }),
    }),
  );
});

it('still replays an already-final historical Telecel canonical Cash Out', async () => {
  const completed = existingTransaction({
    status: 'success',
    provider: 'telecel',
    transaction_type: 'cash_out',
    amount: '100.00',
    sim_iccid: '8902000000000000001',
    sim_slot: 1,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 8,
  });

  mockClientQuery.mockResolvedValueOnce({
    rows: [completed],
  });

  const req = makeReq();

  req.params = {
    transaction_id: 'tx-1',
  };

  req.body = {
    status: 'success',
    network_reference: 'NETWORK-TELECEL-HISTORICAL-001',
    failure_reason: null,
    ussd_session_log: [],
  };

  const res = makeRes();

  await transactionController.completeTransaction(
    req,
    res
  );

  expect(mockClientQuery).toHaveBeenCalledTimes(1);

  expect(
    mockClientQuery.mock.calls[0][0]
  ).toContain('FOR UPDATE');

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'tx-1',
        status: 'success',
        idempotent_replay: true,
      }),
    }),
  );

  expect(mockPostCashOut).not.toHaveBeenCalled();
  expect(mockPostCashIn).not.toHaveBeenCalled();
  expect(mockPostCommissionTransfer).not.toHaveBeenCalled();
  expect(mockCalculateAndPostCommission).not.toHaveBeenCalled();

  expect(mockQuery).not.toHaveBeenCalled();
});

it.each([
  ['telecel', 'initiated'],
  ['telecel', 'processing'],
  ['at_money', 'initiated'],
  ['at_money', 'processing'],
])(
  'rejects historical %s canonical Cash Out completion from %s status',
  async (provider, currentStatus) => {
    const pending = existingTransaction({
      status: currentStatus,
      provider,
      transaction_type: 'cash_out',
      amount: '100.00',
      sim_iccid:
        provider === 'telecel'
          ? '8902000000000000001'
          : '8903000000000000001',
      sim_slot: 1,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 8,
    });

    mockClientQuery.mockResolvedValueOnce({
      rows: [pending],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        'NETWORK-UNSUPPORTED-CASH-OUT-001',
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'CASH_OUT_MANUAL_REQUIRED',
      }),
    );

    // Only the row lock is allowed. No final-status UPDATE may occur.
    expect(mockClientQuery).toHaveBeenCalledTimes(1);

    expect(
      mockClientQuery.mock.calls[0][0]
    ).toContain('FOR UPDATE');

    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();
    expect(mockCalculateAndPostCommission).not.toHaveBeenCalled();

    expect(
      mockSendTransactionNotification
    ).not.toHaveBeenCalled();

    expect(mockAuditLog).not.toHaveBeenCalled();

    // No receipt/final transaction reload outside the DB transaction.
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it.each([
  'mtn',
  'telecel',
  'at_money',
])(
  'posts %s Send Money principal balances before earned commission',
  async (provider) => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider,
      transaction_type: 'send_money',
      amount: '100.00',
      fee: '1.00',
      recipient_phone: '0240000000',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        `NETWORK-SEND-MONEY-${provider}`,
      sim_wallet_id: 'sim-wallet-send-money',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        `NETWORK-SEND-MONEY-${provider}`,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(mockPostSendMoney).toHaveBeenCalledTimes(1);

    expect(mockPostSendMoney).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    expect(
      mockCalculateAndPostCommission
    ).toHaveBeenCalledTimes(1);

    // Principal accounting must happen before earned commission.
    expect(
      mockPostSendMoney.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockCalculateAndPostCommission.mock.invocationCallOrder[0]
    );

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id: 'sim-wallet-send-money',
        }),
      }),
    );
  },
);

it.each([
  'mtn',
  'telecel',
  'at_money',
])(
  'posts %s Airtime principal balances before earned commission',
  async (provider) => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider,
      transaction_type: 'airtime',
      amount: '100.00',
      customer_phone: '0240000000',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        `NETWORK-AIRTIME-${provider}`,
      sim_wallet_id: 'sim-wallet-airtime',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        `NETWORK-AIRTIME-${provider}`,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(mockPostAirtime).toHaveBeenCalledTimes(1);

    expect(mockPostAirtime).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    expect(
      mockCalculateAndPostCommission
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostAirtime.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockCalculateAndPostCommission.mock.invocationCallOrder[0]
    );

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostSendMoney).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id: 'sim-wallet-airtime',
        }),
      }),
    );
  },
);

it.each([
  'mtn',
  'telecel',
])(
  'posts %s Data Bundle principal balances before earned commission',
  async (provider) => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider,
      transaction_type: 'data_bundle',
      amount: '100.00',
      customer_phone: '0240000000',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        `NETWORK-DATA-BUNDLE-${provider}`,
      sim_wallet_id: 'sim-wallet-data-bundle',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        `NETWORK-DATA-BUNDLE-${provider}`,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(
      mockPostDataBundle
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostDataBundle
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    expect(
      mockCalculateAndPostCommission
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostDataBundle.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockCalculateAndPostCommission.mock.invocationCallOrder[0]
    );

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostSendMoney).not.toHaveBeenCalled();
    expect(mockPostAirtime).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id: 'sim-wallet-data-bundle',
        }),
      }),
    );
  },
);

it.each([
  'working_to_float',
  'float_to_working',
])(
  'posts Telecel %s through exact-SIM Working/Float accounting without commission',
  async (transactionType) => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider: 'telecel',
      transaction_type: transactionType,
      amount: '100.00',
      sim_iccid: '8902000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        `NETWORK-${transactionType}`,
      sim_wallet_id:
        'sim-wallet-working-float',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        `NETWORK-${transactionType}`,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(
      mockPostWorkingFloatTransfer
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostWorkingFloatTransfer
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    // Internal Working/Float movement earns no commission.
    expect(
      mockCalculateAndPostCommission
    ).not.toHaveBeenCalled();

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostSendMoney).not.toHaveBeenCalled();
    expect(mockPostAirtime).not.toHaveBeenCalled();
    expect(mockPostDataBundle).not.toHaveBeenCalled();
    expect(mockPostPayToAgent).not.toHaveBeenCalled();
    expect(mockPostMerchantPayment).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id:
            'sim-wallet-working-float',
        }),
      }),
    );
  },
);

it(
  'posts MTN Pay to Agent principal balances without commission',
  async () => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider: 'mtn',
      transaction_type: 'bill_payment',
      amount: '100.00',
      customer_phone: '0240000000',
      payment_reference: 'FLOAT EXCHANGE',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        'NETWORK-PAY-AGENT-MTN',
      sim_wallet_id:
        'sim-wallet-pay-to-agent',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        'NETWORK-PAY-AGENT-MTN',
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(
      mockPostPayToAgent
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostPayToAgent
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    // Pay to Agent earns no commission.
    expect(
      mockCalculateAndPostCommission
    ).not.toHaveBeenCalled();

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostSendMoney).not.toHaveBeenCalled();
    expect(mockPostAirtime).not.toHaveBeenCalled();
    expect(mockPostDataBundle).not.toHaveBeenCalled();
    expect(mockPostMerchantPayment).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id:
            'sim-wallet-pay-to-agent',
        }),
      }),
    );
  },
);

it(
  'posts MTN Merchant Payment as an exact-SIM expense without commission',
  async () => {
    const initiated = existingTransaction({
      status: 'initiated',
      provider: 'mtn',
      transaction_type: 'merchant_payment',
      amount: '100.00',
      merchant_id: '123456',
      payment_reference: 'SHOP STOCK',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
      sim_wallet_id: null,
    });

    const completed = {
      ...initiated,
      status: 'success',
      network_reference:
        'NETWORK-MERCHANT-MTN',
      sim_wallet_id:
        'sim-wallet-merchant-payment',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [completed],
    });

    const req = makeReq();

    req.params = {
      transaction_id: 'tx-1',
    };

    req.body = {
      status: 'success',
      network_reference:
        'NETWORK-MERCHANT-MTN',
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(
      req,
      res
    );

    expect(
      mockPostMerchantPayment
    ).toHaveBeenCalledTimes(1);

    expect(
      mockPostMerchantPayment
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockClientQuery,
      }),
      initiated,
      'agent-1',
    );

    // Merchant Payment is a business expense and earns no commission.
    expect(
      mockCalculateAndPostCommission
    ).not.toHaveBeenCalled();

    expect(mockPostCashIn).not.toHaveBeenCalled();
    expect(mockPostCashOut).not.toHaveBeenCalled();
    expect(mockPostSendMoney).not.toHaveBeenCalled();
    expect(mockPostAirtime).not.toHaveBeenCalled();
    expect(mockPostDataBundle).not.toHaveBeenCalled();
    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          sim_wallet_id:
            'sim-wallet-merchant-payment',
        }),
      }),
    );
  },
);

it('posts ordinary non-Cash-In earned commission without mutating branch treasury float', async () => {
  const initiated = existingTransaction({
    status: 'initiated',
    transaction_type: 'airtime',
    amount: '100.00',
    sim_iccid: '8901000000000000001',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 7,
    sim_wallet_id: null,
  });

  const completed = {
    ...initiated,
    status: 'success',
    network_reference: 'NETWORK-AIRTIME-001',
  };

  mockClientQuery
    .mockResolvedValueOnce({
      rows: [initiated],
    })
    .mockResolvedValueOnce({
      rows: [],
    });

  mockQuery.mockResolvedValue({
    rows: [completed],
  });

  const req = makeReq();

  req.params = {
    transaction_id: 'tx-1',
  };

  req.body = {
    status: 'success',
    network_reference: 'NETWORK-AIRTIME-001',
    failure_reason: null,
    ussd_session_log: [],
  };

  const res = makeRes();

  await transactionController.completeTransaction(
    req,
    res
  );

  expect(
    mockCalculateAndPostCommission
  ).toHaveBeenCalledTimes(1);

  expect(
    mockCalculateAndPostCommission
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      query: mockClientQuery,
    }),
    initiated,
    'agent-1',
  );

  expect(
    mockPostCommissionTransfer
  ).not.toHaveBeenCalled();

  const clientSql = mockClientQuery.mock.calls
    .map(([sql]) => String(sql))
    .join('\n');

  expect(clientSql).not.toContain('float_accounts');
  expect(clientSql).not.toContain('float_movements');

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'tx-1',
        status: 'success',
      }),
    }),
  );
});

it('does not post Commission Transfer balances while outcome is pending confirmation', async () => {
    const initiated = existingTransaction({
      status: 'initiated',
      transaction_type: 'commission_transfer',
      amount: '25.00',
      sim_iccid: '8901000000000000001',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 7,
    });

    const pending = {
      ...initiated,
      status: 'pending_confirmation',
    };

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [initiated],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    mockQuery.mockResolvedValue({
      rows: [pending],
    });

    const req = makeReq();
    req.params = {
      transaction_id: 'tx-1',
    };
    req.body = {
      status: 'pending_confirmation',
      network_reference: null,
      failure_reason: 'Network outcome inconclusive',
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(req, res);

    expect(mockPostCommissionTransfer).not.toHaveBeenCalled();
    expect(mockCalculateAndPostCommission).not.toHaveBeenCalled();

    const clientSql = mockClientQuery.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(clientSql).not.toContain('float_accounts');
    expect(clientSql).not.toContain('float_movements');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'pending_confirmation',
        }),
      }),
    );
  });

  it(
    'atomically enqueues a minimal sanitized completion event',
    async () => {
      const initiated = existingTransaction({
        status: 'initiated',
        transaction_type: 'cash_in',
        amount: '100.00',
      });

      const failed = {
        ...initiated,
        status: 'failed',
        failure_reason: 'failed',
      };

      mockClientQuery
        .mockResolvedValueOnce({
          rows: [initiated],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      mockQuery.mockResolvedValue({
        rows: [failed],
      });

      const req = makeReq();

      req.params = {
        transaction_id: 'tx-1',
      };

      req.body = {
        status: 'failed',
        network_reference: null,
        failure_reason: 'failed',
        ussd_session_log: [
          {
            step: 'result',
            response:
              'unsafe provider response',
          },
        ],
      };

      const res = makeRes();

      await transactionController.completeTransaction(
        req,
        res
      );

      expect(
        mockEnqueueOutboxEvent
      ).toHaveBeenCalledTimes(1);

      const event =
        mockEnqueueOutboxEvent
          .mock.calls[0][0];

      expect(event).toEqual(
        expect.objectContaining({
          dbClient:
            expect.objectContaining({
              query:
                mockClientQuery,
            }),
          eventType:
            'notification.transaction.completed',
          aggregateType:
            'transaction',
          aggregateId:
            'tx-1',
          dedupeKey:
            'transaction:tx-1:completion:failed',
        })
      );

      expect(event.payload).toEqual({
        agent_id: 'agent-1',
        type:
          'transaction_failed',
        transaction: {
          id: 'tx-1',
          amount: '100.00',
          transaction_type:
            'cash_in',
          reference:
            'APG-TEST-001',
          failure_reason:
            expect.anything(),
        },
      });

      expect(
        event.payload.transaction
      ).not.toHaveProperty(
        'ussd_session_log'
      );

      expect(
        event.payload
      ).not.toHaveProperty(
        'network_reference'
      );

      expect(
        mockAuditLog
          .mock.invocationCallOrder[0]
      ).toBeLessThan(
        mockEnqueueOutboxEvent
          .mock.invocationCallOrder[0]
      );
    }
  );

  it('returns success when the same final completion is retried', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          status: 'success',
        }),
      ],
    });

    const req = makeReq();
    req.params = {
      transaction_id: 'tx-1',
    };
    req.body = {
      status: 'success',
      network_reference: 'NETWORK-001',
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(req, res);

    expect(mockClientQuery).toHaveBeenCalledTimes(1);

    expect(mockClientQuery.mock.calls[0][0]).toContain(
      'FOR UPDATE',
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'tx-1',
          status: 'success',
          idempotent_replay: true,
        }),
      }),
    );

    // Replaying a committed completion must not perform another
    // financial UPDATE/posting cycle.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a conflicting completion replay', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [
        existingTransaction({
          status: 'failed',
        }),
      ],
    });

    const req = makeReq();
    req.params = {
      transaction_id: 'tx-1',
    };
    req.body = {
      status: 'success',
      network_reference: null,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      }),
    );

    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the locked transaction does not exist', async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = makeReq();
    req.params = {
      transaction_id: 'missing-tx',
    };
    req.body = {
      status: 'success',
      network_reference: null,
      failure_reason: null,
      ussd_session_log: [],
    };

    const res = makeRes();

    await transactionController.completeTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockClientQuery.mock.calls[0][0]).toContain(
      'FOR UPDATE',
    );
  });
});
