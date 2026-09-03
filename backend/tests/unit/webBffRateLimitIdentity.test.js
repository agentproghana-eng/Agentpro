const crypto = require('crypto');

const {
  rateLimitIdentityKey,
  verifiedWebRateLimitIdentity,
} = require(
  '../../src/middleware/rateLimitIdentity'
);

const SIGNING_CONTEXT =
  'agentpro-web-rate-limit:v1:';

const ORIGINAL_SECRET =
  process.env
    .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET;

function mockRequest(
  headers = {},
  ip = '203.0.113.10'
) {
  const normalized =
    Object.fromEntries(
      Object.entries(headers).map(
        ([key, value]) => [
          key.toLowerCase(),
          value,
        ]
      )
    );

  return {
    ip,

    socket: {
      remoteAddress: ip,
    },

    get(name) {
      return normalized[
        String(name).toLowerCase()
      ];
    },
  };
}

function signatureFor(
  identity,
  secret
) {
  return crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      `${SIGNING_CONTEXT}${identity}`
    )
    .digest('hex');
}

describe(
  'web BFF rate-limit identity',
  () => {
    afterEach(() => {
      if (
        ORIGINAL_SECRET === undefined
      ) {
        delete process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET;
      } else {
        process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET =
          ORIGINAL_SECRET;
      }
    });

    test(
      'valid signed identities separate web clients behind one BFF IP',
      () => {
        const secret =
          'test-shared-secret-that-is-long-enough-123456789';

        process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET =
          secret;

        const firstIdentity =
          '1'.repeat(64);

        const secondIdentity =
          '2'.repeat(64);

        const first =
          mockRequest({
            'x-agentpro-web-rate-limit-id':
              firstIdentity,

            'x-agentpro-web-rate-limit-signature':
              signatureFor(
                firstIdentity,
                secret
              ),
          });

        const second =
          mockRequest({
            'x-agentpro-web-rate-limit-id':
              secondIdentity,

            'x-agentpro-web-rate-limit-signature':
              signatureFor(
                secondIdentity,
                secret
              ),
          });

        expect(
          rateLimitIdentityKey(first)
        ).toBe(
          `web:${firstIdentity}`
        );

        expect(
          rateLimitIdentityKey(second)
        ).toBe(
          `web:${secondIdentity}`
        );

        expect(
          rateLimitIdentityKey(first)
        ).not.toBe(
          rateLimitIdentityKey(second)
        );
      }
    );

    test(
      'invalid signatures cannot override the direct client IP bucket',
      () => {
        process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET =
          'test-shared-secret-that-is-long-enough-123456789';

        const identity =
          'a'.repeat(64);

        const request =
          mockRequest(
            {
              'x-agentpro-web-rate-limit-id':
                identity,

              'x-agentpro-web-rate-limit-signature':
                'b'.repeat(64),
            },
            '198.51.100.44'
          );

        expect(
          verifiedWebRateLimitIdentity(
            request
          )
        ).toBeNull();

        expect(
          rateLimitIdentityKey(request)
        ).toBe(
          '198.51.100.44'
        );
      }
    );

    test(
      'missing or weak shared secret fails safely to the request IP',
      () => {
        delete process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET;

        const request =
          mockRequest(
            {
              'x-agentpro-web-rate-limit-id':
                'c'.repeat(64),

              'x-agentpro-web-rate-limit-signature':
                'd'.repeat(64),
            },
            '192.0.2.25'
          );

        expect(
          rateLimitIdentityKey(request)
        ).toBe(
          '192.0.2.25'
        );

        process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET =
          'too-short';

        expect(
          rateLimitIdentityKey(request)
        ).toBe(
          '192.0.2.25'
        );
      }
    );

    test(
      'malformed identities are never trusted',
      () => {
        process.env
          .AGENTPRO_WEB_BFF_RATE_LIMIT_SECRET =
          'test-shared-secret-that-is-long-enough-123456789';

        const request =
          mockRequest(
            {
              'x-agentpro-web-rate-limit-id':
                'not-a-valid-identity',

              'x-agentpro-web-rate-limit-signature':
                'e'.repeat(64),
            },
            '192.0.2.99'
          );

        expect(
          rateLimitIdentityKey(request)
        ).toBe(
          '192.0.2.99'
        );
      }
    );
  }
);
