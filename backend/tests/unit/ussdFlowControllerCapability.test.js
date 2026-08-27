'use strict';

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();
const mockGetFlowBuilderCapabilities = jest.fn();
const mockGetFlowBuilderEligibility = jest.fn();
const mockGetGlobalFlowBuilderEligibility = jest.fn();

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
  auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock('../../src/utils/ussdFlowCapabilities', () => ({
  getFlowBuilderCapabilities: (...args) =>
    mockGetFlowBuilderCapabilities(...args),
  getFlowBuilderEligibility: (...args) =>
    mockGetFlowBuilderEligibility(...args),
  getGlobalFlowBuilderEligibility: (...args) =>
    mockGetGlobalFlowBuilderEligibility(...args),
}));

const ussdFlowController =
  require('../../src/controllers/ussdFlowController');
const personalUssdFlowController =
  require('../../src/controllers/personalUssdFlowController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function validBody() {
  return {
    provider: 'future_provider',
    transaction_type: 'future_type',
    dial_code: '*123#',
    success_markers: ['successful'],
    failure_markers: ['failed'],
    bundle_category: null,
    recipient_mode: null,
    steps: [
      {
        match_all: ['enter pin'],
        action: 'pin_prompt',
      },
    ],
  };
}

describe('USSD Flow Builder capability enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: true,
      transaction_type_builder_enabled: true,
    });

    mockGetGlobalFlowBuilderEligibility.mockResolvedValue({
      provider_registered: true,
      transaction_type_builder_enabled: true,
    });

    mockWithTransaction.mockResolvedValue({
      id: 'flow-1',
    });

    mockAuditLog.mockResolvedValue(undefined);
  });

  test('Business list excludes Personal-owned rows even for superuser', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
        company_id: null,
      },
    };
    const res = makeRes();

    await ussdFlowController.listFlows(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];

    expect(sql).toContain('f.owner_user_id IS NULL');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
  });

  test('Business owner list excludes Personal Global seed rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
    };
    const res = makeRes();

    await ussdFlowController.listFlows(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain(
      'f.business_sim_role IS NOT NULL'
    );
    expect(sql).toContain(
      'f.company_id = $1'
    );
    expect(params).toEqual(['company-1']);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
  });

  test('Business get cannot expose a Personal-owned row to superuser', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
      },
      params: {
        id: 'personal-flow-1',
      },
    };
    const res = makeRes();

    await ussdFlowController.getFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(params).toEqual(['personal-flow-1']);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Flow not found',
    });
  });

  test('Business update cannot mutate a Personal-owned row through superuser', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
      },
      params: {
        id: 'personal-flow-1',
      },
      body: {
        dial_code: '*124#',
      },
    };
    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(params).toEqual(['personal-flow-1']);
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('Business delete cannot deactivate a Personal-owned row through superuser', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
      },
      params: {
        id: 'personal-flow-1',
      },
    };
    const res = makeRes();

    await ussdFlowController.deleteFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(params).toEqual(['personal-flow-1']);
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('Superuser Global create uses any-mode eligibility instead of Business eligibility', async () => {
    const body = validBody();
    body.transaction_type = 'personal_only_type';

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
        company_id: null,
      },
      body,
    };
    const res = makeRes();

    await ussdFlowController.createFlow(req, res);

    expect(mockGetGlobalFlowBuilderEligibility).toHaveBeenCalledWith(
      'future_provider',
      'personal_only_type'
    );
    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  test('Business create rejects an unregistered provider before persistence', async () => {
    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: false,
      transaction_type_builder_enabled: true,
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      body: validBody(),
    };
    const res = makeRes();

    await ussdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'business',
      'future_provider',
      'future_type'
    );
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_PROVIDER_NOT_REGISTERED',
      })
    );
  });

  test('Business create rejects a type not enabled for Business Flow Builder', async () => {
    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      body: validBody(),
    };
    const res = makeRes();

    await ussdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'business',
      'future_provider',
      'future_type'
    );
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('Business owner create fails closed without company identity', async () => {
    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: null,
      },
      body: validBody(),
    };
    const res = makeRes();

    await ussdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'BUSINESS_IDENTITY_REQUIRED',
      })
    );
  });

  test('Personal delete soft-deactivates only the authenticated owner flow', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'personal-flow-1' }],
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      params: {
        id: 'personal-flow-1',
      },
      ip: '127.0.0.1',
      requestId: 'request-1',
    };
    const res = makeRes();

    await personalUssdFlowController.deleteFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('UPDATE ussd_flows');
    expect(sql).toContain('SET is_active = false');
    expect(sql).toContain('WHERE id = $1 AND owner_user_id = $2');
    expect(sql).not.toContain('DELETE FROM ussd_flows');
    expect(params).toEqual([
      'personal-flow-1',
      'personal-user-1',
    ]);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'personal-user-1',
        companyId: null,
        action: 'PERSONAL_USSD_FLOW_DEACTIVATED',
        entityType: 'ussd_flow',
        entityId: 'personal-flow-1',
      })
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Flow deactivated',
    });
  });

  test('Personal delete does not expose whether another user owns the flow', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      params: {
        id: 'other-users-flow',
      },
    };
    const res = makeRes();

    await personalUssdFlowController.deleteFlow(req, res);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND owner_user_id = $2'),
      [
        'other-users-flow',
        'personal-user-1',
      ]
    );

    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Flow not found',
    });
  });

  test('Personal create rejects a type not enabled for Personal Flow Builder', async () => {
    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      body: validBody(),
    };
    const res = makeRes();

    await personalUssdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'personal',
      'future_provider',
      'future_type'
    );
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('Personal create rejects an unregistered provider before persistence', async () => {
    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: false,
      transaction_type_builder_enabled: true,
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      body: validBody(),
    };
    const res = makeRes();

    await personalUssdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'personal',
      'future_provider',
      'future_type'
    );
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_PROVIDER_NOT_REGISTERED',
      })
    );
  });

  test('Business reactivation rejects a type that is no longer enabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'company-flow-1',
          company_id: 'company-1',
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          is_active: false,
        },
      ],
    });

    mockGetFlowBuilderEligibility.mockResolvedValueOnce({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      params: {
        id: 'company-flow-1',
      },
      body: {
        is_active: true,
      },
    };
    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'business',
      'mtn',
      'cash_in'
    );

    expect(mockGetGlobalFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('Global reactivation uses any-mode Global eligibility', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'global-flow-1',
          company_id: null,
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          is_active: false,
        },
      ],
    });

    mockGetGlobalFlowBuilderEligibility.mockResolvedValueOnce({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const req = {
      user: {
        id: 'superuser-1',
        role: 'superuser',
        company_id: null,
      },
      params: {
        id: 'global-flow-1',
      },
      body: {
        is_active: true,
      },
    };
    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockGetGlobalFlowBuilderEligibility).toHaveBeenCalledWith(
      'mtn',
      'cash_in'
    );

    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('Personal reactivation rejects a type that is no longer enabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'personal-flow-1',
          owner_user_id: 'personal-user-1',
          company_id: null,
          provider: 'telecel',
          transaction_type: 'cash_in',
          is_active: false,
        },
      ],
    });

    mockGetFlowBuilderEligibility.mockResolvedValueOnce({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      params: {
        id: 'personal-flow-1',
      },
      body: {
        is_active: true,
      },
    };
    const res = makeRes();

    await personalUssdFlowController.updateFlow(req, res);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'personal',
      'telecel',
      'cash_in'
    );

    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('deactivation does not require a Flow Builder capability check', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'company-flow-1',
          company_id: 'company-1',
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          is_active: true,
        },
      ],
    });

    mockWithTransaction.mockResolvedValueOnce({
      id: 'company-flow-1',
      is_active: false,
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      params: {
        id: 'company-flow-1',
      },
      body: {
        is_active: false,
      },
    };
    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockGetGlobalFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });



  test('Business execution-mode update revalidates persisted metadata before write', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'company-flow-invalid-metadata',
          company_id: 'company-1',
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          dial_code: 'tel:*170#',
          success_markers: ['successful'],
          failure_markers: ['failed'],
          execution_mode: 'interactive',
          is_active: true,
        },
      ],
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      params: {
        id: 'company-flow-invalid-metadata',
      },
      body: {
        execution_mode: 'direct',
      },
    };

    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_INVALID_METADATA',
      }),
    );
  });

  test('Personal execution-mode update revalidates persisted metadata before write', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'personal-flow-invalid-metadata',
          owner_user_id: 'personal-user-1',
          company_id: null,
          provider: 'telecel',
          transaction_type: 'buy_airtime',
          dial_code: 'tel:*110#',
          success_markers: ['successful'],
          failure_markers: ['failed'],
          execution_mode: 'interactive',
          is_active: true,
        },
      ],
    });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      params: {
        id: 'personal-flow-invalid-metadata',
      },
      body: {
        execution_mode: 'direct',
      },
    };

    const res = makeRes();

    await personalUssdFlowController.updateFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_INVALID_METADATA',
      }),
    );
  });

  test('Business reactivation rejects unsafe persisted steps', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'company-flow-unsafe',
            company_id: 'company-1',
            owner_user_id: null,
            provider: 'mtn',
            transaction_type: 'cash_in',
            is_active: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['menu'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      params: {
        id: 'company-flow-unsafe',
      },
      body: {
        is_active: true,
      },
    };

    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
      })
    );
  });

  test('Personal reactivation rejects unsafe persisted steps', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'personal-flow-unsafe',
            owner_user_id: 'personal-user-1',
            company_id: null,
            provider: 'telecel',
            transaction_type: 'buy_airtime',
            is_active: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['menu'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      params: {
        id: 'personal-flow-unsafe',
      },
      body: {
        is_active: true,
      },
    };

    const res = makeRes();

    await personalUssdFlowController.updateFlow(req, res);

    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
      })
    );
  });

  test('Business resolver refuses an unsafe active stored flow', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'company-active-unsafe',
            company_id: 'company-1',
            owner_user_id: null,
            provider: 'mtn',
            transaction_type: 'cash_in',
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['menu'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: {
        id: 'business-user-1',
        company_id: 'company-1',
      },
      query: {
        provider: 'mtn',
        transaction_type: 'cash_in',
      },
    };

    const res = makeRes();

    await ussdFlowController.resolveFlow(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
      })
    );
  });

  test('Personal resolver refuses an unsafe active stored flow', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'personal-active-unsafe',
            owner_user_id: 'personal-user-1',
            company_id: null,
            provider: 'telecel',
            transaction_type: 'buy_airtime',
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            match_all: ['menu'],
            action: 'send_digit',
            action_value: '1',
          },
        ],
      });

    const req = {
      user: {
        id: 'personal-user-1',
      },
      query: {
        provider: 'telecel',
        transaction_type: 'buy_airtime',
      },
    };

    const res = makeRes();

    await personalUssdFlowController.resolveFlow(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
      })
    );
  });



  test('Business create rejects an unsafe dial code', async () => {
    const body = validBody();
    body.dial_code = 'tel:*170#';

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      body,
    };

    const res = makeRes();

    await ussdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_METADATA',
      })
    );
  });

  test('Personal create rejects ambiguous outcome markers', async () => {
    const body = validBody();
    body.success_markers = ['completed'];
    body.failure_markers = ['COMPLETED'];

    const req = {
      user: {
        id: 'personal-user-1',
      },
      body,
    };

    const res = makeRes();

    await personalUssdFlowController.createFlow(req, res);

    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_METADATA',
      })
    );
  });

  test('Business update rejects conflicting effective markers', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'company-flow-metadata',
          company_id: 'company-1',
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          dial_code: '*170#',
          success_markers: ['successful'],
          failure_markers: ['failed'],
          is_active: true,
        },
      ],
    });

    const req = {
      user: {
        id: 'business-user-1',
        role: 'business_owner',
        company_id: 'company-1',
      },
      params: {
        id: 'company-flow-metadata',
      },
      body: {
        success_markers: ['FAILED'],
      },
    };

    const res = makeRes();

    await ussdFlowController.updateFlow(req, res);

    expect(mockWithTransaction).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_METADATA',
      })
    );
  });

  test('Business resolver refuses unsafe stored metadata', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'company-flow-bad-metadata',
          company_id: 'company-1',
          owner_user_id: null,
          provider: 'mtn',
          transaction_type: 'cash_in',
          dial_code: 'tel:*170#',
          success_markers: ['successful'],
          failure_markers: ['failed'],
          is_active: true,
        },
      ],
    });

    const req = {
      user: {
        id: 'business-user-1',
        company_id: 'company-1',
      },
      query: {
        provider: 'mtn',
        transaction_type: 'cash_in',
      },
    };

    const res = makeRes();

    await ussdFlowController.resolveFlow(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
      })
    );
  });


});
