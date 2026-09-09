const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();
const mockVerifyBusinessSimRoleAssignment =
  jest.fn();
const mockResolveAgentFinancialBranch =
  jest.fn();
const mockDecideOfflineAuthorization =
  jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query: (...args) =>
      mockQuery(...args),
    withTransaction: (...args) =>
      mockWithTransaction(...args),
  })
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: (...args) =>
      mockAuditLog(...args),
  })
);

jest.mock(
  '../../src/services/simRoleTrustService',
  () => ({
    verifyBusinessSimRoleAssignment:
      (...args) =>
        mockVerifyBusinessSimRoleAssignment(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/financialBranchService',
  () => ({
    resolveAgentFinancialBranch:
      (...args) =>
        mockResolveAgentFinancialBranch(
          ...args
        ),
  })
);

jest.mock(
  '../../src/utils/offlineAuthorizationDecision',
  () => ({
    decideOfflineAuthorization:
      (...args) =>
        mockDecideOfflineAuthorization(
          ...args
        ),
  })
);

jest.mock(
  '../../src/services/commissionPostingService',
  () => ({
    calculateAndPostCommission:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/commissionTransferPostingService',
  () => ({
    postCommissionTransfer:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/cashInPostingService',
  () => ({
    postCashIn:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/cashOutPostingService',
  () => ({
    postCashOut:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/sendMoneyPostingService',
  () => ({
    postSendMoney:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/airtimePostingService',
  () => ({
    postAirtime:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/dataBundlePostingService',
  () => ({
    postDataBundle:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/merchantPaymentPostingService',
  () => ({
    postMerchantPayment:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/payToAgentPostingService',
  () => ({
    postPayToAgent:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/workingFloatPostingService',
  () => ({
    postWorkingFloatTransfer:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/outboxService',
  () => ({
    enqueueOutboxEvent:
      jest.fn(),
  })
);

jest.mock(
  '../../src/services/reportService',
  () => ({
    generateTransactionReceipt:
      jest.fn(),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  })
);

const transactionController =
  require(
    '../../src/controllers/transactionController'
  );

function makeReq(overrides = {}) {
  return {
    user: {
      id: 'agent-1',
      company_id: 'company-1',
      session_id: 'session-1',
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
      sim_iccid: 'ICCID-1',
      sim_slot: 0,
      installation_id:
        '11111111-1111-4111-8111-111111111111',
      sim_subscription_id: 10,
      sim_role: 'agent',
      client_operation_id:
        '9a38a665-7b23-4bc4-9338-b8f50bca7d03',
      ...overrides,
    },
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

function existingTransaction() {
  return {
    id: 'tx-existing',
    reference: 'APG-EXISTING',
    status: 'initiated',
    created_at:
      new Date(
        '2026-09-01T00:00:00Z'
      ),
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
    sim_iccid: 'ICCID-1',
    sim_slot: 0,
    installation_id:
      '11111111-1111-4111-8111-111111111111',
    sim_subscription_id: 10,
    sim_role: 'agent',
    ussd_template: null,
  };
}

function arrangeNewTransactionPreflight({
  disabled,
}) {
  mockQuery
    .mockResolvedValueOnce({
      rows: [],
    });

  mockVerifyBusinessSimRoleAssignment
    .mockResolvedValue({
      ok: true,
      role: 'agent',
      sim_slot: 0,
    });

  mockResolveAgentFinancialBranch
    .mockResolvedValue({
      ok: true,
      branchId: 'branch-1',
    });

  mockQuery.mockImplementation(
    async (sql) => {
      if (
        String(sql).includes(
          'FROM system_config'
        )
      ) {
        return {
          rows: [
            {
              value:
                JSON.stringify(
                  disabled
                ),
            },
          ],
        };
      }

      if (
        String(sql).includes(
          'FROM ussd_templates'
        )
      ) {
        return {
          rows: [
            {
              id: 'template-1',
            },
          ],
        };
      }

      if (
        String(sql).includes(
          'FROM ussd_flows'
        )
      ) {
        return {
          rows: [
            {
              exists: 1,
            },
          ],
        };
      }

      return {
        rows: [],
      };
    }
  );

  mockWithTransaction
    .mockImplementation(
      async (callback) => {
        const client = {
          query: jest
            .fn()
            .mockResolvedValue({
              rows: [
                {
                  id: 'tx-new',
                  reference:
                    'APG-NEW',
                  status:
                    'initiated',
                  sim_role:
                    'agent',
                  created_at:
                    new Date(),
                },
              ],
            }),
        };

        mockAuditLog
          .mockResolvedValue(
            undefined
          );

        return callback(client);
      }
    );
}

describe(
  'Business offline authorization integration',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test(
      'idempotent replay returns before offline authorization evaluation',
      async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            existingTransaction(),
          ],
        });

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.old.signature',
          });

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            200
          );

        expect(
          mockDecideOfflineAuthorization
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'disabled operation without receipt remains blocked',
      async () => {
        arrangeNewTransactionPreflight({
          disabled: [
            'mtn:cash_in',
          ],
        });

        mockDecideOfflineAuthorization
          .mockReturnValue({
            allowed: false,
            decision:
              'feature_disabled',
            receipt_claims:
              null,
          });

        const req =
          makeReq();

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).toHaveBeenCalledWith({
          currentlyDisabled:
            true,
          receipt:
            undefined,
          user:
            req.user,
          mode:
            'business',
          provider:
            'mtn',
          transactionType:
            'cash_in',
        });

        expect(res.status)
          .toHaveBeenCalledWith(
            403
          );

        expect(res.json)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              code:
                'TRANSACTION_TYPE_DISABLED',
            })
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'valid receipt may cross a disabled operation boundary',
      async () => {
        arrangeNewTransactionPreflight({
          disabled: [
            'mtn:cash_in',
          ],
        });

        mockDecideOfflineAuthorization
          .mockReturnValue({
            allowed: true,
            decision:
              'receipt_allowed',
            receipt_claims: {
              receipt_id:
                'receipt-1',
            },
          });

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.payload.signature',
          });

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).toHaveBeenCalledWith({
          currentlyDisabled:
            true,
          receipt:
            'apr1.payload.signature',
          user:
            req.user,
          mode:
            'business',
          provider:
            'mtn',
          transactionType:
            'cash_in',
        });

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );

        expect(res.status)
          .toHaveBeenCalledWith(
            201
          );
      }
    );

    test(
      'invalid receipt cannot bypass disabled operation',
      async () => {
        arrangeNewTransactionPreflight({
          disabled: [
            'mtn:cash_in',
          ],
        });

        const error =
          Object.assign(
            new Error(
              'bad receipt'
            ),
            {
              code:
                'OFFLINE_RECEIPT_SIGNATURE_INVALID',
            }
          );

        mockDecideOfflineAuthorization
          .mockImplementation(
            () => {
              throw error;
            }
          );

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.bad.signature',
          });

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            403
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'missing server receipt secret fails unavailable rather than bypassing',
      async () => {
        arrangeNewTransactionPreflight({
          disabled: [
            'mtn:cash_in',
          ],
        });

        const error =
          Object.assign(
            new Error(
              'secret unavailable'
            ),
            {
              code:
                'OFFLINE_RECEIPT_SECRET_INVALID',
            }
          );

        mockDecideOfflineAuthorization
          .mockImplementation(
            () => {
              throw error;
            }
          );

        const req =
          makeReq({
            offline_authorization_receipt:
              'apr1.payload.signature',
          });

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(
            503
          );

        expect(res.json)
          .toHaveBeenCalledWith(
            expect.objectContaining({
              code:
                'OFFLINE_AUTHORIZATION_UNAVAILABLE',
            })
          );

        expect(
          mockWithTransaction
        ).not.toHaveBeenCalled();
      }
    );

    test(
      'enabled operation never evaluates optional receipt',
      async () => {
        arrangeNewTransactionPreflight({
          disabled: [],
        });

        const req =
          makeReq({
            offline_authorization_receipt:
              'malformed-but-irrelevant',
          });

        const res =
          makeRes();

        await transactionController
          .initiateTransaction(
            req,
            res
          );

        expect(
          mockDecideOfflineAuthorization
        ).not.toHaveBeenCalled();

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);
