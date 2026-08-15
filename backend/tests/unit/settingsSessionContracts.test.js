const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

function functionSlice(source, startMarker) {
  const start = source.indexOf(startMarker);

  expect(start).toBeGreaterThanOrEqual(0);

  const nextExport = source.indexOf(
    '\nexports.',
    start + startMarker.length,
  );

  const end =
    nextExport >= 0 ? nextExport : source.length;

  return source.slice(start, end);
}

describe('Settings session security contracts', () => {
  test(
    'logout revokes only the presented refresh session',
    () => {
      const source = readSource(
        'src/controllers/authController.js',
      );

      const logout = functionSlice(
        source,
        'exports.logout = async',
      );

      expect(logout).not.toContain(
        'UPDATE refresh_tokens SET revoked_at = NOW() ' +
          'WHERE user_id = $1 AND revoked_at IS NULL',
      );

      expect(logout).toContain(
        'SELECT id, token_hash',
      );

      expect(logout).toContain(
        'bcrypt.compare(refresh_token',
      );

      expect(logout).toMatch(
        /UPDATE refresh_tokens[\s\S]*WHERE id = \$1/,
      );
    },
  );
});
