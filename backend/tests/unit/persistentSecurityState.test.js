const fs = require('fs');
const path = require('path');

function source(file) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../../src',
      file
    ),
    'utf8'
  );
}

describe(
  'persistent security state contracts',
  () => {
    test(
      'API and security-sensitive limiters use shared Redis stores outside tests',
      () => {
        const rateLimitSource =
          source(
            'middleware/rateLimit.js'
          );

        expect(rateLimitSource)
          .toContain(
            'RedisRateLimitStore'
          );

        expect(rateLimitSource)
          .toContain(
            "process.env.NODE_ENV === 'test'"
          );

        expect(rateLimitSource)
          .toContain(
            "'agentpro:rate-limit:api:'"
          );

        expect(rateLimitSource)
          .toContain(
            "'agentpro:rate-limit:auth:'"
          );

        expect(rateLimitSource)
          .toContain(
            "'agentpro:rate-limit:refresh:'"
          );

        expect(rateLimitSource)
          .toContain(
            "'agentpro:rate-limit:ai:'"
          );
      }
    );

    test(
      'critical authentication limiters fail closed on store errors',
      () => {
        const rateLimitSource =
          source(
            'middleware/rateLimit.js'
          );

        const authStart =
          rateLimitSource.indexOf(
            'exports.authLimiter'
          );

        const refreshStart =
          rateLimitSource.indexOf(
            'exports.refreshLimiter'
          );

        const aiStart =
          rateLimitSource.indexOf(
            'exports.aiLimiter'
          );

        const authBlock =
          rateLimitSource.slice(
            authStart,
            refreshStart
          );

        const refreshBlock =
          rateLimitSource.slice(
            refreshStart,
            aiStart
          );

        const aiBlock =
          rateLimitSource.slice(
            aiStart
          );

        expect(authBlock)
          .toContain(
            'passOnStoreError: false'
          );

        expect(refreshBlock)
          .toContain(
            'passOnStoreError: false'
          );

        expect(aiBlock)
          .toContain(
            'passOnStoreError: false'
          );
      }
    );

    test(
      'refresh endpoint has dedicated abuse protection',
      () => {
        const routes =
          source(
            'routes/auth.routes.js'
          );

        expect(routes)
          .toContain(
            'refreshLimiter'
          );

        expect(routes)
          .toContain(
            "router.post('/refresh', refreshLimiter"
          );
      }
    );

    test(
      'AI routes no longer create a process-local limiter',
      () => {
        const routes =
          source(
            'routes/ai.routes.js'
          );

        expect(routes)
          .toContain(
            'aiLimiter'
          );

        expect(routes)
          .not.toContain(
            "require('express-rate-limit')"
          );
      }
    );

    test(
      'failed login attempts are incremented by PostgreSQL rather than Node',
      () => {
        const auth =
          source(
            'controllers/authController.js'
          );

        expect(auth)
          .toContain(
            'login_attempts = login_attempts + 1'
          );

        expect(auth)
          .not.toContain(
            'const newAttempts = user.login_attempts + 1'
          );
      }
    );
  }
);
