'use strict';

const fs = require('fs');
const path = require('path');

const {
  initializeObservability,
  parseSampleRate,
  sanitizeMetadata,
  sanitizeRouteLabel,
  sanitizeSentryEvent,
} = require('../../src/utils/observability');

describe('privacy-safe observability', () => {
  test('sample rates are bounded and invalid values fall back safely', () => {
    expect(parseSampleRate(undefined, 0.25)).toBe(0.25);

    expect(parseSampleRate('0.5', 0)).toBe(0.5);

    expect(parseSampleRate('5', 0)).toBe(1);

    expect(parseSampleRate('-2', 1)).toBe(0);

    expect(parseSampleRate('not-a-number', 0.15)).toBe(0.15);
  });

  test('route labels remove query strings and high-cardinality IDs', () => {
    expect(sanitizeRouteLabel('/api/v1/transactions/123456?token=secret')).toBe(
      '/api/v1/transactions/:id',
    );

    expect(
      sanitizeRouteLabel(
        '/api/v1/users/550e8400-e29b-41d4-a716-446655440000?pin=1234',
      ),
    ).toBe('/api/v1/users/:id');
  });

  test('metadata has an explicit safe allowlist', () => {
    const result = sanitizeMetadata({
      requestId: 'request-1',
      component: 'http',
      operation: '/api/v1/users/123456?token=secret',
      errorCode: 'DB_DOWN',
      password: 'super-secret',
      pin: '1234',
      token: 'bearer-secret',
      amount: '999.99',
      phone: '0244000000',
    });

    expect(result).toEqual({
      requestId: 'request-1',
      component: 'http',
      operation: '/api/v1/users/:id',
      errorCode: 'DB_DOWN',
    });
  });

  test('Sentry events remove payloads credentials PII breadcrumbs and raw messages', () => {
    const event = sanitizeSentryEvent({
      message: 'password=secret',
      user: {
        id: 'user-1',
        email: 'person@example.com',
      },
      request: {
        method: 'POST',
        url: 'https://api.example.com/api/v1/transactions/123456?pin=1234',
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=secret',
        },
        data: {
          pin: '1234',
          password: 'secret',
          amount: '500.00',
        },
        cookies: {
          session: 'secret',
        },
        query_string: 'pin=1234',
      },
      breadcrumbs: [
        {
          message: 'customer 0244000000',
        },
      ],
      extra: {
        requestId: 'request-1',
        password: 'secret',
        phone: '0244000000',
        amount: '500.00',
      },
      tags: {
        component: 'http',
        userId: 'user-1',
        provider: 'mtn',
      },
      contexts: {
        runtime: {
          name: 'node',
          version: '20',
        },
        trace: {
          trace_id: 'trace-1',
          span_id: 'span-1',
          op: 'http.server',
          secret: 'do-not-send',
        },
        custom: {
          customer: '0244000000',
        },
      },
      exception: {
        values: [
          {
            type: 'DatabaseError',
            value: 'authorization Bearer secret-token',
            stacktrace: {
              frames: [
                {
                  filename: 'server.js',
                  function: 'handler',
                },
              ],
            },
          },
        ],
      },
    });

    const serialized = JSON.stringify(event);

    expect(serialized).not.toContain('secret-token');

    expect(serialized).not.toContain('0244000000');

    expect(serialized).not.toContain('500.00');

    expect(serialized).not.toContain('person@example.com');

    expect(serialized).not.toContain('"pin":"1234"');

    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/api/v1/transactions/:id',
    });

    expect(event.user).toBeUndefined();

    expect(event.breadcrumbs).toEqual([]);

    expect(event.exception.values[0].value).toBe('Captured application error');
  });

  test('remote observability stays disabled when no DSN is configured', () => {
    const previous = process.env.SENTRY_DSN;

    delete process.env.SENTRY_DSN;

    expect(initializeObservability()).toBe(false);

    if (previous === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = previous;
    }
  });

  test('server bootstrap loads instrumentation before Express', () => {
    const server = fs.readFileSync(
      path.join(__dirname, '../../server.js'),
      'utf8',
    );

    const instrumentAt = server.search(/require\(["']\.\/instrument["']\)/);

    const expressAt = server.search(/require\(["']express["']\)/);

    expect(instrumentAt).toBeGreaterThanOrEqual(0);

    expect(expressAt).toBeGreaterThan(instrumentAt);

    expect(server).not.toMatch(/morgan\s*\(\s*["']combined["']/);

    const requestIdAt = server.indexOf('uuidValidate(suppliedRequestId)');

    const morganAt = server.search(/morgan\s*\(/);

    expect(requestIdAt).toBeGreaterThanOrEqual(0);

    expect(morganAt).toBeGreaterThan(requestIdAt);
  });

  test('global error handler reports only the default 5xx path', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/middleware/errorHandler.js'),
      'utf8',
    );

    expect(source).toContain('if (status >= 500)');

    expect(source).toContain('captureException(');

    expect(source).toMatch(/component:\s*["']http["']/);

    expect(source).not.toContain('userId: req.user');
  });
});
