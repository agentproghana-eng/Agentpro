'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath,
    ),
    'utf8',
  );
}

describe(
  'mandatory superuser MFA auth contracts',
  () => {
    test(
      'superuser login gates durable session issuance behind MFA',
      () => {
        const source =
          read(
            'src/controllers/authController.js',
          );

        const loginStart =
          source.indexOf(
            'exports.login = async',
          );

        const loginEnd =
          source.indexOf(
            '// ─── Complete Superuser MFA',
          );

        const login =
          source.slice(
            loginStart,
            loginEnd,
          );

        const mfaGate =
          login.indexOf(
            "user.role === 'superuser'",
          );

        const sessionInsert =
          login.indexOf(
            'INSERT INTO refresh_tokens',
          );

        expect(mfaGate)
          .toBeGreaterThan(-1);

        expect(sessionInsert)
          .toBeGreaterThan(
            mfaGate,
          );

        expect(login).toContain(
          "'MFA_REQUIRED'",
        );

        expect(login).toContain(
          "'MFA_ENROLLMENT_REQUIRED'",
        );
      },
    );

    test(
      'MFA completion endpoint is rate limited and validates exactly one credential',
      () => {
        const source =
          read(
            'src/routes/auth.routes.js',
          );

        expect(source).toContain(
          "router.post('/mfa/complete', authLimiter",
        );

        expect(source).toContain(
          "body('challenge_token')",
        );

        expect(source).toContain(
          "body('recovery_code')",
        );

        expect(source).toContain(
          'Provide exactly one MFA credential',
        );
      },
    );

    test(
      'recovery codes and TOTP secrets never enter generic logging',
      () => {
        const controller =
          read(
            'src/controllers/authController.js',
          );

        expect(
          controller,
        ).not.toMatch(
          /logger\..*(recovery_code|challenge_token|totp_secret|mfa_totp_secret_enc)/i,
        );
      },
    );
  },
);

describe(
  'superuser MFA durable session assurance contracts',
  () => {
    test(
      'migration marks only post-MFA durable sessions as verified',
      () => {
        const migration =
          read(
            'migrations/092_superuser_mfa.sql',
          );

        expect(
          migration,
        ).toContain(
          'mfa_verified_at',
        );

        expect(
          migration,
        ).toContain(
          'chk_users_mfa_enabled_material',
        );
      },
    );

    test(
      'access authorization requires MFA assurance for superuser sessions',
      () => {
        const middleware =
          read(
            'src/middleware/auth.js',
          );

        expect(
          middleware,
        ).toContain(
          'MFA_REAUTH_REQUIRED',
        );

        expect(
          middleware,
        ).toContain(
          'activeSession.mfa_verified_at',
        );
      },
    );

    test(
      'refresh cannot upgrade a pre-MFA superuser session',
      () => {
        const controller =
          read(
            'src/controllers/authController.js',
          );

        expect(
          controller,
        ).toContain(
          '!matchedSession.mfa_verified_at',
        );

        expect(
          controller,
        ).toContain(
          "'MFA_REAUTH_REQUIRED'",
        );
      },
    );
  },
);

describe(
  'superuser TOTP replay prevention contracts',
  () => {
    test(
      'migration persists the highest accepted TOTP counter',
      () => {
        const migration =
          read(
            'migrations/092_superuser_mfa.sql',
          );

        expect(
          migration,
        ).toContain(
          'mfa_last_totp_counter BIGINT',
        );

        expect(
          migration,
        ).toContain(
          'chk_users_mfa_totp_counter_nonnegative',
        );
      },
    );

    test(
      'MFA verification accepts only counters newer than the durable user state',
      () => {
        const controller =
          read(
            'src/controllers/authController.js',
          );

        expect(
          controller,
        ).toContain(
          'matchedTotpCounter >',
        );

        expect(
          controller,
        ).toContain(
          'lastTotpCounter',
        );

        expect(
          controller,
        ).toContain(
          'SET mfa_last_totp_counter = $1',
        );
      },
    );
  },
);

describe(
  'superuser MFA audit and recovery contracts',
  () => {
    test(
      'records the mandatory privacy-safe MFA lifecycle audit events',
      () => {
        const controller =
          read(
            'src/controllers/authController.js',
          );

        expect(
          controller,
        ).toContain(
          "'MFA_ENROLLMENT_STARTED'",
        );

        expect(
          controller,
        ).toContain(
          "'MFA_ENROLLED'",
        );

        expect(
          controller,
        ).toContain(
          "'MFA_VERIFIED'",
        );

        expect(
          controller,
        ).toContain(
          "'MFA_VERIFICATION_FAILED'",
        );

        expect(
          controller,
        ).toContain(
          "'MFA_RECOVERY_CODE_USED'",
        );
      },
    );

    test(
      'password reset revokes sessions without disabling MFA enrollment',
      () => {
        const controller =
          read(
            'src/controllers/authController.js',
          );

        const start =
          controller.indexOf(
            'exports.resetPassword =',
          );

        const end =
          controller.indexOf(
            'exports.getMe =',
            start,
          );

        expect(
          start,
        ).toBeGreaterThan(-1);

        expect(
          end,
        ).toBeGreaterThan(
          start,
        );

        const resetSection =
          controller.slice(
            start,
            end,
          );

        expect(
          resetSection,
        ).toContain(
          'UPDATE refresh_tokens SET revoked_at = NOW()',
        );

        expect(
          resetSection,
        ).not.toMatch(
          /mfa_(?:enabled|totp|recovery|last_totp)/,
        );
      },
    );
  },
);
