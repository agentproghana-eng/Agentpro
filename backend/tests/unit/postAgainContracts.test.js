const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('Post again contracts', () => {
  const routes = readSource('src/routes/marketplace.routes.js');

  test('kept photos must belong to the seller\'s own earlier ad', () => {
    expect(routes).toContain('req.body.repost_from_ad_id');
    expect(routes).toContain('AND posted_by = $2');
    expect(routes).toContain('sourceUrls.includes(url)');
  });

  test('the photo rules count kept and uploaded photos together', () => {
    expect(routes).toContain('files.length + keptImageUrls.length < 1');
    expect(routes).toContain('files.length + keptImageUrls.length > 8');
    expect(routes).toContain('[...keptImageUrls, ...uploadedUrls]');
  });
});
