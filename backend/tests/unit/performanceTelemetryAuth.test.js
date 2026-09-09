'use strict';

const {
  TELEMETRY_HEADER,
  performanceTelemetryEnabled,
  performanceTelemetryAuthorized,
  requirePerformanceTelemetry,
} = require(
  '../../src/middleware/performanceTelemetryAuth'
);

describe('performance telemetry access control', () => {
  test('is disabled by default', () => {
    expect(
      performanceTelemetryEnabled({})
    ).toBe(false);
  });

  test('requires explicit true flag', () => {
    expect(
      performanceTelemetryEnabled({
        PERFORMANCE_TELEMETRY_ENABLED:
          'true',
      })
    ).toBe(true);

    expect(
      performanceTelemetryEnabled({
        PERFORMANCE_TELEMETRY_ENABLED:
          'false',
      })
    ).toBe(false);
  });

  test('rejects missing or weak configured token', () => {
    expect(
      performanceTelemetryAuthorized(
        'test-token',
        {}
      )
    ).toBe(false);

    expect(
      performanceTelemetryAuthorized(
        'short',
        {
          PERFORMANCE_TELEMETRY_TOKEN:
            'short',
        }
      )
    ).toBe(false);
  });

  test('accepts only the configured strong token', () => {
    const token =
      '0123456789abcdef0123456789abcdef';

    const env = {
      PERFORMANCE_TELEMETRY_TOKEN:
        token,
    };

    expect(
      performanceTelemetryAuthorized(
        token,
        env
      )
    ).toBe(true);

    expect(
      performanceTelemetryAuthorized(
        `${token}x`,
        env
      )
    ).toBe(false);
  });

  describe('HTTP middleware behavior', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        ...originalEnv,
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    function createResponse() {
      return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
    }

    test('returns 404 when telemetry is disabled', () => {
      delete process.env.PERFORMANCE_TELEMETRY_ENABLED;
      delete process.env.PERFORMANCE_TELEMETRY_TOKEN;

      const req = {
        get: jest.fn(),
      };
      const res = createResponse();
      const next = jest.fn();

      requirePerformanceTelemetry(
        req,
        res,
        next
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Route not found',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when enabled without valid token', () => {
      process.env.PERFORMANCE_TELEMETRY_ENABLED =
        'true';
      process.env.PERFORMANCE_TELEMETRY_TOKEN =
        '0123456789abcdef0123456789abcdef';

      const req = {
        get: jest.fn().mockReturnValue(
          'wrong-token'
        ),
      };
      const res = createResponse();
      const next = jest.fn();

      requirePerformanceTelemetry(
        req,
        res,
        next
      );

      expect(req.get).toHaveBeenCalledWith(
        TELEMETRY_HEADER
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next only for the configured strong token', () => {
      const token =
        '0123456789abcdef0123456789abcdef';

      process.env.PERFORMANCE_TELEMETRY_ENABLED =
        'TRUE';
      process.env.PERFORMANCE_TELEMETRY_TOKEN =
        token;

      const req = {
        get: jest.fn().mockReturnValue(token),
      };
      const res = createResponse();
      const next = jest.fn();

      requirePerformanceTelemetry(
        req,
        res,
        next
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
