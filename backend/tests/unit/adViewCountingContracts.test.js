const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('Advertisement view counting contracts', () => {
  const routes = readSource('src/routes/marketplace.routes.js');

  test('the lifetime counter only increases when a new view is recorded', () => {
    expect(routes).toContain('async function recordAdView(');
    expect(routes).toContain('if (inserted.rows.length) {');
    expect(routes).toContain(
      "'UPDATE advertisements SET views_count = views_count + 1 WHERE id = $1'",
    );
    expect(routes).not.toContain(
      "      Promise.all([\n        query(\n          'UPDATE advertisements SET views_count",
    );
  });

  test('owners and known bots are never counted', () => {
    expect(routes).toContain('if (!isOwner && !isLikelyBot(req))');
    expect(routes).toContain('function isLikelyBot(req)');
  });

  test('visitors who are not signed in are counted only by a one-way hash', () => {
    expect(routes).toContain('verifiedWebRateLimitIdentity(req)');
    expect(routes).toContain('ad-view:v1:');
    expect(routes).toContain("createHash('sha256')");
    expect(routes).toContain('viewer_hash = $2');

    // No raw IP address may be stored for analytics.
    expect(routes).not.toMatch(/INSERT INTO advertisement_views[^`]*req\.ip/);
  });

  test('the migration adds only a hash column and an index', () => {
    const migration = readSource(
      'migrations/171_advertisement_anonymous_views.sql',
    );

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS viewer_hash TEXT');
    expect(migration).not.toMatch(/ADD COLUMN[^;]*\bip(_address)?\b/i);
  });
});
