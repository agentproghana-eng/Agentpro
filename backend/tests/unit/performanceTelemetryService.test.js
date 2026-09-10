'use strict';

const mockQuery = jest.fn();
const mockPing = jest.fn();

const mockPool = {
  totalCount: 7,
  idleCount: 3,
  waitingCount: 2,
};

let mockRedisClient = null;

jest.mock('../../src/config/database', () => ({
  pool: mockPool,
  query: (...args) => mockQuery(...args),
}));

jest.mock('../../src/config/redis', () => ({
  get redisClient() {
    return mockRedisClient;
  },
}));

const {
  startPerformanceTelemetry,
  stopPerformanceTelemetry,
  performanceSnapshot,
} = require(
  '../../src/services/performanceTelemetryService'
);

describe('performance telemetry service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockPing.mockReset();

    mockRedisClient = null;

    mockPool.totalCount = 7;
    mockPool.idleCount = 3;
    mockPool.waitingCount = 2;

    stopPerformanceTelemetry();

    mockQuery.mockResolvedValue({
      rows: [{
        pending: 12,
        processing: 4,
        dead_letter: 1,
        oldest_pending_age_seconds: 37.5,
      }],
    });
  });

  afterEach(() => {
    stopPerformanceTelemetry();
  });

  test('exposes API telemetry in the protected performance snapshot', async () => {
    startPerformanceTelemetry();

    const snapshot =
      await performanceSnapshot();

    expect(snapshot.api).toEqual(
      expect.objectContaining({
        enabled: true,
        window_seconds: 60,
        requests_total: 0,
        requests_last_minute: 0,
        requests_per_minute: 0,
        server_error_rate: 0,
      })
    );

    expect(snapshot.api.responses).toEqual({
      status_2xx: 0,
      status_3xx: 0,
      status_4xx: 0,
      status_5xx: 0,
      aborted: 0,
    });
  });

  test('reports PostgreSQL pool pressure and outbox backlog', async () => {
    const snapshot =
      await performanceSnapshot();

    expect(snapshot.postgres).toEqual({
      total_connections: 7,
      idle_connections: 3,
      waiting_requests: 2,
    });

    expect(snapshot.outbox).toEqual({
      pending: 12,
      processing: 4,
      dead_letter: 1,
      oldest_pending_age_seconds: 37.5,
    });
  });

  test('reports Redis unavailable without failing the snapshot', async () => {
    const snapshot =
      await performanceSnapshot();

    expect(snapshot.redis).toEqual({
      status: 'unavailable',
      ping_ms: null,
    });
  });

  test('reports Redis ready and measures ping', async () => {
    mockPing.mockResolvedValue('PONG');

    mockRedisClient = {
      status: 'ready',
      ping: mockPing,
    };

    const snapshot =
      await performanceSnapshot();

    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(snapshot.redis.status).toBe('ready');
    expect(
      typeof snapshot.redis.ping_ms
    ).toBe('number');
  });

  test('reports Redis ping failure without throwing', async () => {
    mockPing.mockRejectedValue(
      new Error('redis unavailable')
    );

    mockRedisClient = {
      status: 'ready',
      ping: mockPing,
    };

    const snapshot =
      await performanceSnapshot();

    expect(snapshot.redis).toEqual({
      status: 'error',
      ping_ms: null,
    });
  });

  test('event-loop metrics are disabled until explicitly started', async () => {
    const snapshot =
      await performanceSnapshot();

    expect(snapshot.event_loop).toEqual({
      enabled: false,
    });
  });

  test('event-loop metrics become available after start', async () => {
    startPerformanceTelemetry();

    await new Promise((resolve) =>
      setTimeout(resolve, 30)
    );

    const snapshot =
      await performanceSnapshot();

    expect(snapshot.event_loop.enabled).toBe(true);

    expect(
      snapshot.event_loop.mean_ms === null ||
      typeof snapshot.event_loop.mean_ms === 'number'
    ).toBe(true);

    expect(
      typeof snapshot.event_loop.p95_ms
    ).toBe('number');

    expect(
      typeof snapshot.event_loop.p99_ms
    ).toBe('number');

    expect(
      typeof snapshot.event_loop.max_ms
    ).toBe('number');
  });

  test('snapshot exposes operational metrics only', async () => {
    const snapshot =
      await performanceSnapshot();

    const serialized =
      JSON.stringify(snapshot).toLowerCase();

    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('database_url');
    expect(serialized).not.toContain('redis_url');
    expect(serialized).not.toContain('authorization');
  });

  test('normalizes empty outbox values to zero', async () => {
    mockQuery.mockResolvedValue({
      rows: [{}],
    });

    const snapshot =
      await performanceSnapshot();

    expect(snapshot.outbox).toEqual({
      pending: 0,
      processing: 0,
      dead_letter: 0,
      oldest_pending_age_seconds: 0,
    });
  });
});
