const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

function sliceBetween(
  source,
  startMarker,
  endMarker,
) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('Durable auth session issuance contracts', () => {
  const source = readSource(
    'src/controllers/authController.js',
  );

  const digestMigration = readSource(
    'migrations/094_refresh_token_exact_digest.sql',
  );

  test(
    'every access token contains its durable session ID',
    () => {
      expect(source).toContain(
        'function generateAccessToken(user, sessionId)',
      );

      expect(source).toContain(
        'session_id: sessionId',
      );

      expect(source).toContain(
        'jti: uuidv4()',
      );

      expect(source).not.toContain(
        'generateAccessToken(user);',
      );
    },
  );

  test(
    'Personal registration persists a session before issuing access',
    () => {
      const registration = sliceBetween(
        source,
        'exports.registerPersonal = async',
        'exports.addPersonalCapability = async',
      );

      expect(registration).toContain(
        'INSERT INTO refresh_tokens',
      );

      expect(registration).toContain(
        'RETURNING id',
      );

      expect(registration).toContain(
        'generateAccessToken(',
      );

      expect(registration).toContain(
        'sessionResult.rows[0].id',
      );

      expect(
        registration.indexOf('RETURNING id'),
      ).toBeLessThan(
        registration.indexOf('generateAccessToken('),
      );
    },
  );

  test(
    'login persists a session before issuing access',
    () => {
      const login = sliceBetween(
        source,
        'exports.login = async',
        'exports.refreshToken = async',
      );

      expect(login).toContain(
        'INSERT INTO refresh_tokens',
      );

      expect(login).toContain(
        'RETURNING id',
      );

      expect(login).toContain(
        'sessionResult.rows[0].id',
      );

      expect(
        login.indexOf('RETURNING id'),
      ).toBeLessThan(
        login.indexOf('generateAccessToken('),
      );
    },
  );

  test(
    'refresh binds access to one exact persisted token digest',
    () => {
      const refresh = sliceBetween(
        source,
        'exports.refreshToken = async',
        'exports.logout = async',
      );

      expect(refresh).toContain(
        'digestRefreshToken(refresh_token)',
      );

      expect(refresh).toContain(
        'token_digest = $2',
      );

      expect(refresh).toContain(
        'revoked_at IS NULL',
      );

      expect(refresh).toContain(
        'expires_at > NOW()',
      );

      expect(refresh).toContain(
        'const matchedSession = storedTokens.rows[0]',
      );

      expect(refresh).not.toContain(
        'bcrypt.compare(',
      );

      expect(refresh).not.toContain(
        'matchedSessions.push',
      );

      expect(refresh).not.toContain(
        'token_hash,',
      );

      expect(refresh).toContain(
        "code: 'SESSION_AMBIGUOUS'",
      );
    },
  );

  test(
    'all session issuance paths persist the exact refresh digest',
    () => {
      const registration = sliceBetween(
        source,
        'exports.registerPersonal = async',
        'exports.addPersonalCapability = async',
      );

      const login = sliceBetween(
        source,
        'exports.login = async',
        'exports.completeMfa = async',
      );

      const mfa = sliceBetween(
        source,
        'exports.completeMfa = async',
        'exports.refreshToken = async',
      );

      for (const issuance of [
        registration,
        login,
        mfa,
      ]) {
        expect(issuance).toContain(
          'token_digest',
        );

        expect(issuance).toContain(
          'digestRefreshToken(',
        );
      }
    },
  );

  test(
    'digest migration revokes legacy sessions and indexes exact digests',
    () => {
      expect(digestMigration).toContain(
        'ADD COLUMN IF NOT EXISTS token_digest VARCHAR(64)',
      );

      expect(digestMigration).toContain(
        'WHERE token_digest IS NULL',
      );

      expect(digestMigration).toContain(
        'AND revoked_at IS NULL',
      );

      expect(digestMigration).toContain(
        'ux_refresh_tokens_token_digest',
      );

      expect(digestMigration).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS',
      );

      expect(digestMigration).toContain(
        'chk_refresh_tokens_active_digest',
      );

      expect(digestMigration).toContain(
        'revoked_at IS NOT NULL',
      );

      expect(digestMigration).toContain(
        'OR token_digest IS NOT NULL',
      );
    },
  );

  test(
    'logout revokes the authenticated session without scanning every token',
    () => {
      const logout = sliceBetween(
        source,
        'exports.logout = async',
        'exports.requestPasswordReset = async',
      );

      expect(logout).toContain(
        'req.user.session_id',
      );

      expect(logout).not.toContain(
        'SELECT id, token_hash',
      );

      expect(logout).not.toContain(
        'bcrypt.compare(refresh_token',
      );
    },
  );
});
