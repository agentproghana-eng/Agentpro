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
  'superuser MFA foundation contracts',
  () => {
    test(
      'migration stores only encrypted authenticator material and recovery hashes',
      () => {
        const migration =
          read(
            'migrations/092_superuser_mfa.sql',
          );

        expect(
          migration,
        ).toContain(
          'mfa_totp_secret_enc',
        );

        expect(
          migration,
        ).toContain(
          'mfa_recovery_code_hashes',
        );

        expect(
          migration,
        ).toContain(
          'mfa_enabled_at',
        );

        expect(
          migration,
        ).not.toMatch(
          /mfa_totp_secret\s+(?:TEXT|VARCHAR)/i,
        );
      },
    );

    test(
      'MFA encryption key is documented but never committed with a value',
      () => {
        const envExample =
          read('.env.example');

        expect(
          envExample,
        ).toContain(
          'MFA_ENCRYPTION_KEY=',
        );

        expect(
          envExample,
        ).toMatch(
          /MFA_ENCRYPTION_KEY=\s*(?:\r?\n|$)/,
        );
      },
    );

    test(
      'MFA service does not log challenge, secret, TOTP or recovery material',
      () => {
        const challengeService =
          read(
            'src/services/mfaChallengeService.js',
          );

        const totp =
          read(
            'src/utils/totp.js',
          );

        const cryptoSource =
          read(
            'src/utils/mfaCrypto.js',
          );

        const combined =
          [
            challengeService,
            totp,
            cryptoSource,
          ].join('\n');

        expect(combined).not.toMatch(
          /logger\.(?:info|warn|error|debug)/,
        );
      },
    );
  },
);
