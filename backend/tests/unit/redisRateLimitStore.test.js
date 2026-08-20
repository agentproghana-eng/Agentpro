let mockRedisClient;

jest.mock(
  '../../src/config/redis',
  () => ({
    get redisClient() {
      return mockRedisClient;
    },
  })
);

const RedisRateLimitStore =
  require(
    '../../src/services/redisRateLimitStore'
  );

describe(
  'RedisRateLimitStore',
  () => {
    beforeEach(() => {
      mockRedisClient = {
        eval: jest.fn(),
        del: jest.fn(),
      };
    });

    test(
      'atomically increments a shared Redis counter with TTL',
      async () => {
        mockRedisClient.eval
          .mockResolvedValue([
            3,
            900000,
          ]);

        const store =
          new RedisRateLimitStore({
            prefix:
              'agentpro:test:',
          });

        store.init({
          windowMs: 900000,
        });

        const before =
          Date.now();

        const result =
          await store.increment(
            'client-1'
          );

        const after =
          Date.now();

        expect(
          mockRedisClient.eval
        ).toHaveBeenCalledTimes(1);

        const [
          script,
          keyCount,
          key,
          windowMs,
        ] =
          mockRedisClient.eval
            .mock.calls[0];

        expect(script)
          .toContain(
            "redis.call('INCR'"
          );

        expect(script)
          .toContain(
            "redis.call('PEXPIRE'"
          );

        expect(keyCount)
          .toBe(1);

        expect(key)
          .toBe(
            'agentpro:test:client-1'
          );

        expect(windowMs)
          .toBe('900000');

        expect(result.totalHits)
          .toBe(3);

        expect(result.resetTime)
          .toBeInstanceOf(Date);

        expect(
          result.resetTime.getTime()
        ).toBeGreaterThanOrEqual(
          before + 899000
        );

        expect(
          result.resetTime.getTime()
        ).toBeLessThanOrEqual(
          after + 901000
        );
      }
    );

    test(
      'fails closed when no shared Redis client exists',
      async () => {
        mockRedisClient = null;

        const store =
          new RedisRateLimitStore({
            prefix:
              'agentpro:test:',
          });

        await expect(
          store.increment(
            'client-1'
          )
        ).rejects.toMatchObject({
          code:
            'SECURITY_RATE_LIMIT_STORE_UNAVAILABLE',
        });
      }
    );

    test(
      'supports decrement and reset operations',
      async () => {
        mockRedisClient.eval
          .mockResolvedValue(1);

        mockRedisClient.del
          .mockResolvedValue(1);

        const store =
          new RedisRateLimitStore({
            prefix:
              'agentpro:test:',
          });

        await store.decrement(
          'client-1'
        );

        await store.resetKey(
          'client-1'
        );

        expect(
          mockRedisClient.eval
        ).toHaveBeenCalledTimes(1);

        expect(
          mockRedisClient.del
        ).toHaveBeenCalledWith(
          'agentpro:test:client-1'
        );
      }
    );
  }
);
