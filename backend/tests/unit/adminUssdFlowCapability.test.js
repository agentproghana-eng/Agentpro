'use strict';

const request = require('supertest');
const express = require('express');

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
const mockAuditLog = jest.fn();
const mockGetFlowBuilderEligibility = jest.fn();
const mockGetGlobalFlowBuilderEligibility = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (...args) => mockWithTransaction(...args),
  pool: {},
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'superuser-1',
      role: 'superuser',
    };
    next();
  },
  authorize: () => (_req, _res, next) => next(),
}));

jest.mock('../../src/utils/ussdFlowCapabilities', () => ({
  getFlowBuilderEligibility: (...args) =>
    mockGetFlowBuilderEligibility(...args),
  getGlobalFlowBuilderEligibility: (...args) =>
    mockGetGlobalFlowBuilderEligibility(...args),
}));

jest.mock('../../src/services/migrationService', () => ({
  runMigrations: jest.fn(),
  getMigrationStatus: jest.fn(),
}));

jest.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: jest.fn(),
}));

jest.mock('../../src/services/smsService', () => ({
  sendRegistrationApprovedSMS: jest.fn(),
  sendAdPaymentConfirmedSMS: jest.fn(),
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

const adminRoutes = require('../../src/routes/admin.routes');

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRoutes);

function validBody() {
  return {
    provider: 'future_provider',
    transaction_type: 'personal_only_type',
    dial_code: '*123#',
    success_markers: ['successful'],
    failure_markers: ['failed'],
    steps: [
      {
        match_all: ['enter pin'],
        action: 'pin_prompt',
      },
    ],
  };
}

describe('Admin USSD Flow Builder capability enforcement', () => {
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
      id: 'admin-flow-1',
      company_id: null,
    });

    mockAuditLog.mockResolvedValue(undefined);
  });

  test('Admin list excludes Personal-owned flows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/v1/admin/ussd-flows');

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql] = mockQuery.mock.calls[0];

    expect(sql).toContain('WHERE f.owner_user_id IS NULL');
    expect(response.body).toEqual({
      success: true,
      data: [],
    });
  });

  test('Admin get cannot expose a Personal-owned flow', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/v1/admin/ussd-flows/personal-flow-1');

    expect(response.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(params).toEqual(['personal-flow-1']);
  });

  test('Admin patch cannot mutate a Personal-owned flow', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });

    mockWithTransaction.mockImplementationOnce(
      async (callback) => callback({ query: clientQuery })
    );

    const response = await request(app)
      .patch('/api/v1/admin/ussd-flows/personal-flow-1')
      .send({
        dial_code: '*124#',
      });

    expect(response.status).toBe(404);
    expect(clientQuery).toHaveBeenCalledTimes(1);

    const [sql] = clientQuery.mock.calls[0];

    expect(sql).toContain('owner_user_id IS NULL');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  test('Global admin flow accepts a type enabled in any account mode', async () => {
    const response = await request(app)
      .post('/api/v1/admin/ussd-flows')
      .send(validBody());

    expect(response.status).toBe(200);

    expect(mockGetGlobalFlowBuilderEligibility).toHaveBeenCalledWith(
      'future_provider',
      'personal_only_type'
    );
    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(response.body.success).toBe(true);
  });

  test('Company admin flow requires Business-mode eligibility', async () => {
    mockGetFlowBuilderEligibility.mockResolvedValue({
      provider_registered: true,
      transaction_type_builder_enabled: false,
    });

    const response = await request(app)
      .post('/api/v1/admin/ussd-flows')
      .send({
        ...validBody(),
        company_id: 'company-1',
      });

    expect(response.status).toBe(422);

    expect(mockGetFlowBuilderEligibility).toHaveBeenCalledWith(
      'business',
      'future_provider',
      'personal_only_type'
    );
    expect(mockGetGlobalFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
      })
    );
  });

  test('Admin create rejects malformed company identity instead of treating it as Global', async () => {
    const response = await request(app)
      .post('/api/v1/admin/ussd-flows')
      .send({
        ...validBody(),
        company_id: '',
      });

    expect(response.status).toBe(422);
    expect(mockGetFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockGetGlobalFlowBuilderEligibility).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'INVALID_COMPANY_ID',
      })
    );
  });
});
