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
    'resolver accepts only the verified Global MTN Pulse balance shape',
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
});
