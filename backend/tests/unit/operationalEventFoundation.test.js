const fs = require('fs');
const path = require('path');

const {
  recordOperationalEvent,
  serializeSafeAttributes,
} = require('../../src/services/operationalEventService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const CORRELATION_ID = '33333333-3333-4333-8333-333333333333';
const SUBJECT_ID = '44444444-4444-4444-8444-444444444444';

describe('operational event foundation', () => {
  test('migration creates the shared immutable event record and timeline indexes', () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        '../../migrations/125_operational_events.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('CREATE TABLE operational_events');
    expect(migration).toContain('UNIQUE (dedupe_key)');
    expect(migration).toContain(
      'idx_operational_events_correlation_timeline'
    );
    expect(migration).toContain(
      'idx_operational_events_subject_timeline'
    );
    expect(migration).toContain(
      'idx_operational_events_name_time'
    );
    expect(migration).not.toMatch(/ON DELETE CASCADE/i);
  });

  test('requires the caller transaction client for atomic domain writes', async () => {
    await expect(
      recordOperationalEvent({
        eventName: 'transaction.created',
        subjectType: 'transaction',
        subjectId: SUBJECT_ID,
        correlationId: CORRELATION_ID,
      })
    ).rejects.toMatchObject({
      code: 'OPERATIONAL_EVENT_TRANSACTION_CLIENT_REQUIRED',
    });
  });

  test.each([
    { customer_phone: '0240000000' },
    { profile: { email: 'person@example.com' } },
    { auth: { otp: '123456' } },
    { automation: { ussd_session_log: ['secret'] } },
    { response: { provider_response: 'raw response' } },
  ])('rejects sensitive attributes %#', (attributes) => {
    expect(() => serializeSafeAttributes(attributes)).toThrow(
      expect.objectContaining({
        code: 'OPERATIONAL_EVENT_SENSITIVE_ATTRIBUTES_REJECTED',
      })
    );
  });

  test.each([
    'phone',
    'customer.email',
    'ussd-session',
    'reset_token',
  ])('rejects sensitive subject type %s', async (subjectType) => {
    const dbClient = { query: jest.fn() };

    await expect(
      recordOperationalEvent({
        dbClient,
        eventName: 'support.lookup',
        subjectType,
        subjectId: 'raw-sensitive-value',
        correlationId: CORRELATION_ID,
      })
    ).rejects.toMatchObject({
      code: 'OPERATIONAL_EVENT_SENSITIVE_SUBJECT_REJECTED',
    });

    expect(dbClient.query).not.toHaveBeenCalled();
  });

  test('records a versioned, correlated event on the supplied client', async () => {
    const row = {
      id: '55555555-5555-4555-8555-555555555555',
      event_name: 'transaction.created',
    };
    const dbClient = {
      query: jest.fn().mockResolvedValueOnce({ rows: [row] }),
    };

    await expect(
      recordOperationalEvent({
        dbClient,
        eventName: 'transaction.created',
        source: 'backend',
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        subjectType: 'transaction',
        subjectId: SUBJECT_ID,
        correlationId: CORRELATION_ID,
        dedupeKey: `transaction:${SUBJECT_ID}:created:v1`,
        attributes: {
          provider: 'mtn',
          transaction_type: 'cash_in',
          outcome: 'accepted',
        },
      })
    ).resolves.toEqual(row);

    expect(dbClient.query).toHaveBeenCalledTimes(1);
    expect(dbClient.query.mock.calls[0][0]).toContain(
      'INSERT INTO operational_events'
    );
    expect(dbClient.query.mock.calls[0][1]).toEqual([
      'transaction.created',
      1,
      'backend',
      USER_ID,
      COMPANY_ID,
      'transaction',
      SUBJECT_ID,
      CORRELATION_ID,
      null,
      `transaction:${SUBJECT_ID}:created:v1`,
      JSON.stringify({
        provider: 'mtn',
        transaction_type: 'cash_in',
        outcome: 'accepted',
      }),
      null,
    ]);
  });

  test('returns the existing event after an idempotent replay', async () => {
    const existing = {
      id: '55555555-5555-4555-8555-555555555555',
      dedupe_key: 'transaction:test:created:v1',
    };
    const dbClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existing] }),
    };

    await expect(
      recordOperationalEvent({
        dbClient,
        eventName: 'transaction.created',
        subjectType: 'transaction',
        subjectId: SUBJECT_ID,
        correlationId: CORRELATION_ID,
        dedupeKey: 'transaction:test:created:v1',
      })
    ).resolves.toEqual(existing);

    expect(dbClient.query).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['eventName', 'Transaction Created'],
    ['source', 'mobile app'],
    ['subjectType', 'transaction/type'],
    ['correlationId', 'not-a-uuid'],
  ])('rejects invalid %s', async (field, value) => {
    const input = {
      dbClient: { query: jest.fn() },
      eventName: 'transaction.created',
      source: 'backend',
      subjectType: 'transaction',
      subjectId: SUBJECT_ID,
      correlationId: CORRELATION_ID,
      [field]: value,
    };

    await expect(recordOperationalEvent(input)).rejects.toMatchObject({
      code: 'OPERATIONAL_EVENT_INVALID_METADATA',
    });
    expect(input.dbClient.query).not.toHaveBeenCalled();
  });
});
