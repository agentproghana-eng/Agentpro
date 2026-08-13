const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/services/commissionPostingService', () => ({
  calculateAndPostCommission: jest.fn(),
}));

jest.mock('../../src/services/commissionTransferPostingService', () => ({
  postCommissionTransfer: jest.fn(),
}));

jest.mock('../../src/services/cashInPostingService', () => ({
  postCashIn: jest.fn(),
}));

jest.mock('../../src/services/cashOutPostingService', () => ({
  postCashOut: jest.fn(),
}));

jest.mock('../../src/services/sendMoneyPostingService', () => ({
  postSendMoney: jest.fn(),
}));

jest.mock('../../src/services/airtimePostingService', () => ({
  postAirtime: jest.fn(),
}));

jest.mock('../../src/services/dataBundlePostingService', () => ({
  postDataBundle: jest.fn(),
}));

jest.mock('../../src/services/merchantPaymentPostingService', () => ({
  postMerchantPayment: jest.fn(),
}));

jest.mock('../../src/services/payToAgentPostingService', () => ({
  postPayToAgent: jest.fn(),
}));

jest.mock('../../src/services/workingFloatPostingService', () => ({
  postWorkingFloatTransfer: jest.fn(),
}));

jest.mock('../../src/services/notificationService', () => ({
  sendTransactionNotification: jest.fn(),
}));

jest.mock('../../src/services/reportService', () => ({
  generateTransactionReceipt: jest.fn(),
}));

jest.mock('../../src/services/financialBranchService', () => ({
  resolveAgentFinancialBranch: jest.fn(),
}));

const transactionController =
  require('../../src/controllers/transactionController');

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('Transaction list pagination bounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });
  });

  test(
    'transaction list normalizes page and caps limit',
    async () => {
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

      await transactionController.listTransactions(req, res);

      const [, dataParams] = mockQuery.mock.calls[0];

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
