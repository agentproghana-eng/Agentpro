'use strict';

const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
};

jest.mock(
  '../../src/config/redis',
  () => ({
    redisClient: mockRedis,
  }),
);

const {
  CHALLENGE_TTL_SECONDS,
  MAX_MFA_ATTEMPTS,
  createMfaChallenge,
  getMfaChallenge,
  recordMfaFailure,
  consumeMfaChallenge,
} = require(
  '../../src/services/mfaChallengeService'
);

describe(
  'strict superuser MFA challenge storage',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockRedis.setex
        .mockResolvedValue('OK');

      mockRedis.get
        .mockResolvedValue(null);

      mockRedis.incr
        .mockResolvedValue(1);

      mockRedis.expire
        .mockResolvedValue(1);

      mockRedis.del
        .mockResolvedValue(1);

      mockRedis.eval
        .mockResolvedValue(null);
    });

    test(
      'stores only a hash-derived Redis key for the bearer challenge',
      async () => {
        const token =
          await createMfaChallenge({
            userId:
              'user-1',
            purpose:
              'enroll',
            secret:
              'BASE32SECRET',
          });

        expect(
          token.length,
        ).toBeGreaterThanOrEqual(
          40,
        );

        expect(
          mockRedis.setex,
        ).toHaveBeenCalledTimes(
          1,
        );

        const [
          redisKey,
          ttl,
          rawPayload,
        ] =
          mockRedis.setex
            .mock.calls[0];

        expect(redisKey).not.toContain(
          token,
        );

        expect(ttl).toBe(
          CHALLENGE_TTL_SECONDS,
        );

        expect(
          JSON.parse(
            rawPayload,
          ),
        ).toEqual(
          expect.objectContaining({
            version: 1,
            userId:
              'user-1',
            purpose:
              'enroll',
            secret:
              'BASE32SECRET',
          }),
        );
      },
    );

    test(
      'reads a valid bounded challenge',
      async () => {
        mockRedis.get
          .mockResolvedValue(
            JSON.stringify({
              version: 1,
              userId:
                'user-1',
              purpose:
                'verify',
              secret: null,
            }),
          );

        await expect(
          getMfaChallenge(
            'x'.repeat(40),
          ),
        ).resolves.toEqual(
          expect.objectContaining({
            userId:
              'user-1',
            purpose:
              'verify',
          }),
        );
      },
    );

    test(
      'locks and removes a challenge at the failed-attempt ceiling',
      async () => {
        mockRedis.incr
          .mockResolvedValue(
            MAX_MFA_ATTEMPTS,
          );

        const result =
          await recordMfaFailure(
            'x'.repeat(40),
          );

        expect(
          result.locked,
        ).toBe(true);

        expect(
          result.remaining,
        ).toBe(0);

        expect(
          mockRedis.del,
        ).toHaveBeenCalled();
      },
    );

    test(
      'successful consumption is atomic through Redis Lua',
      async () => {
        mockRedis.eval
          .mockResolvedValue(
            JSON.stringify({
              version: 1,
              userId:
                'user-1',
              purpose:
                'verify',
              secret: null,
            }),
          );

        const result =
          await consumeMfaChallenge(
            'x'.repeat(40),
          );

        expect(
          result.userId,
        ).toBe('user-1');

        expect(
          mockRedis.eval,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);
