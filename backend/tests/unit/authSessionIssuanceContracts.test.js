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
    'refresh binds the new access token to the matching persisted session',
    () => {
      const refresh = sliceBetween(
        source,
        'exports.refreshToken = async',
        'exports.logout = async',
      );

      expect(refresh).toContain(
        'FROM refresh_tokens',
      );

      expect(refresh).toContain(
        'token_hash',
      );

      expect(refresh).toContain(
        'mfa_verified_at',
      );

      expect(refresh).toContain(
        'matchedSessions.push(storedToken)',
      );

      expect(refresh).toContain(
        'const matchedSession = matchedSessions[0]',
      );

      expect(refresh).toContain(
        'matchedSession.id',
      );

      expect(refresh).toContain(
        'matchedSessions.length > 1',
      );

      expect(refresh).toContain(
        "code: 'SESSION_AMBIGUOUS'",
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
