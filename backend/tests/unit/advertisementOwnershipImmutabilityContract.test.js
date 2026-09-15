const fs = require('fs');
const path = require('path');

const backendSrc = path.resolve(__dirname, '../../src');
const sellerMigration = path.resolve(
  __dirname,
  '../../migrations/131_ad_ratings_seller_cursor.sql'
);

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, {
    withFileTypes: true,
  }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectJavaScriptFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith('.js')
      ? [fullPath]
      : [];
  });
}

describe('advertisement ownership immutability contract', () => {
  test('backend application code never reassigns advertisements.posted_by', () => {
    const files = collectJavaScriptFiles(backendSrc);

    const advertisementUpdate =
      /UPDATE\s+advertisements\b[\s\S]*?\bSET\b([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|`)/gi;

    const ownershipAssignment =
      /\bposted_by\s*=/i;

    const violations = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');

      advertisementUpdate.lastIndex = 0;

      let match;

      while ((match = advertisementUpdate.exec(source)) !== null) {
        const setClause = match[1];

        if (ownershipAssignment.test(setClause)) {
          violations.push(
            path.relative(
              path.resolve(__dirname, '../..'),
              file
            )
          );

          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('new advertisements bind ownership to authenticated user', () => {
    const marketplaceRoute = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../src/routes/marketplace.routes.js'
      ),
      'utf8'
    );

    expect(marketplaceRoute).toContain(
      'INSERT INTO advertisements (posted_by'
    );

    expect(marketplaceRoute).toContain(
      '[req.user.id, req.user.company_id || null'
    );
  });

  test('seller denormalization is derived from advertisement ownership', () => {
    const migration = fs.readFileSync(
      sellerMigration,
      'utf8'
    );

    expect(migration).toContain(
      'SET seller_id = a.posted_by'
    );

    expect(migration).toContain(
      'SELECT a.posted_by'
    );

    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF advertisement_id'
    );
  });

  test('documents why ownership must remain immutable', () => {
    const migration = fs.readFileSync(
      sellerMigration,
      'utf8'
    );

    expect(migration).toContain(
      'Denormalize advertisement ownership onto reviews'
    );
  });
});
