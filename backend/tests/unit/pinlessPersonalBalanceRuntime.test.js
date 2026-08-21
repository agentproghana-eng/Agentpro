jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const { query } = require('../../src/config/database');
const {
  validateFlowSteps,
} = require('../../src/utils/ussdFlowValidation');
const {
  resolveFlow,
} = require('../../src/controllers/personalUssdFlowController');

const pulseSteps = [
  {
    match_all: [
      'welcome to mtn pulse',
      'proceed to buy bundle',
      '99. more',
    ],
    action: 'send_digit',
    action_value: '1',
  },
  {
    match_all: [
      'mashup for self',
      'mashup for others',
      '99. more',
    ],
    action: 'send_digit',
    action_value: '99',
  },
  {
    match_all: [
      'download app',
      'check balance',
    ],
    action: 'send_digit',
    action_value: '7',
  },
];

const makeResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const globalPulseFlow = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'mtn',
  transaction_type: 'check_airtime_balance',
  dial_code: '*567#',
  success_markers: ['your pulse balance'],
  failure_markers: [],
  owner_user_id: null,
  company_id: null,
  is_active: true,
  ...overrides,
});


const airtimeDataSteps = [
  {
    match_all: ['proceed to buy bundle'],
    action: 'send_digit',
    action_value: '1',
  },
  {
    match_all: ['choose payment mode', 'mobile money'],
    action: 'send_digit',
    action_value: '1',
  },
];

const globalAirtimeDataFlow = (overrides = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  provider: 'mtn',
  transaction_type: 'buy_data',
  dial_code: '*138#',
  bundle_category: 'flexi_airtime',
  recipient_mode: 'self',
  success_markers: [],
  failure_markers: [],
  owner_user_id: null,
  company_id: null,
  is_active: true,
  ...overrides,
});

const makeAirtimeDataRequest = ({
  bundleCategory = 'flexi_airtime',
  recipientMode = 'self',
  plan = 'free',
} = {}) => ({
  query: {
    provider: 'mtn',
    transaction_type: 'buy_data',
    bundle_category: bundleCategory,
    recipient_mode: recipientMode,
  },
  user: {
    id: '22222222-2222-4222-8222-222222222222',
  },
  personalSubscription: {
    plan,
    expires_at: null,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PIN-less Personal runtime flow safety', () => {
  test(
    'generic validator remains fail-closed without explicit opt-in',
    () => {
      expect(validateFlowSteps(pulseSteps)).toMatch(
        /no pin_prompt/i,
      );
    },
  );

  test(
    'explicit PIN-less validation accepts the verified Pulse steps',
    () => {
      expect(
        validateFlowSteps(
          pulseSteps,
          { allowPinless: true },
        ),
      ).toBeNull();
    },
  );

  test(
    'PIN-less validation still rejects auto_confirm_once',
    () => {
      const unsafe = [
        ...pulseSteps,
        {
          match_all: ['confirm'],
          action: 'auto_confirm_once',
          action_value: '1',
        },
      ];

      expect(
        validateFlowSteps(
          unsafe,
          { allowPinless: true },
        ),
      ).toMatch(/requires a pin_prompt/i);
    },
  );

  test(
    'resolver accepts the verified Global MTN Pulse balance shape',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [globalPulseFlow()],
        })
        .mockResolvedValueOnce({
          rows: pulseSteps,
        });

      const req = {
        query: {
          provider: 'mtn',
          transaction_type:
            'check_airtime_balance',
        },
        user: {
          id: '22222222-2222-4222-8222-222222222222',
        },
        personalSubscription: {
          plan: 'free',
          expires_at: null,
        },
      };

      const res = makeResponse();

      await resolveFlow(req, res);

      expect(res.status).not.toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            provider: 'mtn',
            transaction_type:
              'check_airtime_balance',
            dial_code: '*567#',
            steps: pulseSteps,
          }),
        }),
      );
    },
  );

  test(
    'resolver still rejects a different PIN-less dial code',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalPulseFlow({
              dial_code: '*123#',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: pulseSteps,
        });

      const req = {
        query: {
          provider: 'mtn',
          transaction_type:
            'check_airtime_balance',
        },
        user: {
          id: '22222222-2222-4222-8222-222222222222',
        },
        personalSubscription: {
          plan: 'free',
          expires_at: null,
        },
      };

      const res = makeResponse();

      await resolveFlow(req, res);

      expect(res.status).toHaveBeenCalledWith(409);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'USSD_FLOW_INVALID_CONFIGURATION',
        }),
      );
    },
  );

  test(
    'resolver never grants PIN-less exception to Personal-owned override',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalPulseFlow({
              owner_user_id:
                '22222222-2222-4222-8222-222222222222',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: pulseSteps,
        });

      const req = {
        query: {
          provider: 'mtn',
          transaction_type:
            'check_airtime_balance',
        },
        user: {
          id: '22222222-2222-4222-8222-222222222222',
        },
        personalSubscription: {
          plan: 'paid',
          expires_at: null,
        },
      };

      const res = makeResponse();

      await resolveFlow(req, res);

      expect(res.status).toHaveBeenCalledWith(409);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'USSD_FLOW_INVALID_CONFIGURATION',
        }),
      );
    },
  );

  test.each([
    ['flexi_airtime', 'self'],
    ['flexi_airtime', 'other'],
    ['fixed_page1_airtime', 'self'],
    ['fixed_page1_airtime', 'other'],
    ['fixed_page2_airtime', 'self'],
    ['fixed_page2_airtime', 'other'],
  ])(
    'resolver accepts verified Global MTN Airtime data %s/%s',
    async (bundleCategory, recipientMode) => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalAirtimeDataFlow({
              bundle_category: bundleCategory,
              recipient_mode: recipientMode,
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: airtimeDataSteps,
        });

      const res = makeResponse();

      await resolveFlow(
        makeAirtimeDataRequest({
          bundleCategory,
          recipientMode,
        }),
        res,
      );

      expect(res.status).not.toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            provider: 'mtn',
            transaction_type: 'buy_data',
            bundle_category: bundleCategory,
            recipient_mode: recipientMode,
          }),
        }),
      );
    },
  );

  test(
    'resolver rejects Airtime metadata when payment step selects Mobile Money',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [globalAirtimeDataFlow()],
        })
        .mockResolvedValueOnce({
          rows: [
            airtimeDataSteps[0],
            {
              match_all: [
                'choose payment mode',
                'mobile money',
              ],
              action: 'send_digit',
              action_value: '2',
            },
          ],
        });

      const res = makeResponse();

      await resolveFlow(
        makeAirtimeDataRequest(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'USSD_FLOW_INVALID_CONFIGURATION',
        }),
      );
    },
  );

  test(
    'resolver keeps Mobile Money data variants PIN-bound',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalAirtimeDataFlow({
              bundle_category: 'flexi_momo',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: airtimeDataSteps,
        });

      const res = makeResponse();

      await resolveFlow(
        makeAirtimeDataRequest({
          bundleCategory: 'flexi_momo',
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
    },
  );

  test(
    'resolver never grants Airtime PIN-less exception to Personal override',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalAirtimeDataFlow({
              owner_user_id:
                '22222222-2222-4222-8222-222222222222',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: airtimeDataSteps,
        });

      const res = makeResponse();

      await resolveFlow(
        makeAirtimeDataRequest({
          plan: 'paid',
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
    },
  );

  test(
    'resolver never grants Airtime PIN-less exception to company flow',
    async () => {
      query
        .mockResolvedValueOnce({
          rows: [
            globalAirtimeDataFlow({
              company_id:
                '44444444-4444-4444-8444-444444444444',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: airtimeDataSteps,
        });

      const res = makeResponse();

      await resolveFlow(
        makeAirtimeDataRequest(),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
    },
  );

});
