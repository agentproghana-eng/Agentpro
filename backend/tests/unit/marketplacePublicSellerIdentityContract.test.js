const fs = require('fs');
const path = require('path');

describe('marketplace public seller identity contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/routes/marketplace.routes.js'),
    'utf8'
  );

  test('public marketplace feeds expose seller and business identity', () => {
    const firstNameMatches =
      source.match(/seller\.first_name AS seller_first_name/g) || [];
    const lastNameMatches =
      source.match(/seller\.last_name AS seller_last_name/g) || [];
    const companyMatches =
      source.match(/company\.name AS company_name/g) || [];
    const verificationMatches =
      source.match(
        /COALESCE\(company\.marketplace_verified, FALSE\) AS seller_verified/g
      ) || [];

    expect(firstNameMatches.length).toBeGreaterThanOrEqual(3);
    expect(lastNameMatches.length).toBeGreaterThanOrEqual(3);
    expect(companyMatches.length).toBeGreaterThanOrEqual(3);
    expect(verificationMatches.length).toBeGreaterThanOrEqual(3);
  });

  test('seller identity comes from advertisement owner and optional company', () => {
    expect(source).toMatch(
      /INNER JOIN users seller\s+ON seller\.id = a\.posted_by/
    );
    expect(source).toMatch(
      /LEFT JOIN companies company\s+ON company\.id = seller\.company_id/
    );
  });

  test('item detail exposes buyer versus owner context and seller reputation', () => {
    expect(source).toContain(
      'const viewerId = req.user?.id || null;'
    );
    expect(source).toContain(
      'const isOwner = viewerId !== null && ad.posted_by === viewerId;'
    );
    expect(source).toContain('ad.is_owner = isOwner;');
    expect(source).toContain('AS seller_average_rating');
    expect(source).toContain('AS seller_review_count');
    expect(source).toMatch(
      /WHERE seller_ad\.posted_by = u\.id/
    );
  });

  test('featured seller metrics belong to the displayed seller', () => {
    const featuredStart = source.indexOf(
      "mpRouter.get('/featured-sellers'"
    );
    const featuredEnd = source.indexOf(
      '// Get a public seller storefront',
      featuredStart
    );

    expect(featuredStart).toBeGreaterThanOrEqual(0);
    expect(featuredEnd).toBeGreaterThan(featuredStart);

    const featuredSource = source.slice(
      featuredStart,
      featuredEnd
    );

    expect(featuredSource).toMatch(
      /LEFT JOIN advertisements a\s+ON a\.posted_by = owner\.id/
    );

    expect(featuredSource).not.toMatch(
      /LEFT JOIN advertisements a\s+ON a\.company_id = c\.id/
    );

    expect(featuredSource).toContain(
      "WHEN a.status = 'active' THEN a.id"
    );

    expect(featuredSource).toContain(
      'COALESCE(AVG(ar.rating), 0)::float AS average_rating'
    );

    expect(featuredSource).toContain(
      'COUNT(ar.id)::int AS review_count'
    );
  });

  test('seller reputation stays historical while storefront inventory is active-only', () => {
    const sellerStart = source.indexOf(
      "mpRouter.get('/sellers/:seller_id'"
    );
    const sellerEnd = source.indexOf(
      '// Get a single ad by ID',
      sellerStart
    );

    expect(sellerStart).toBeGreaterThanOrEqual(0);
    expect(sellerEnd).toBeGreaterThan(sellerStart);

    const sellerSource = source.slice(
      sellerStart,
      sellerEnd
    );

    const adsResultStart = sellerSource.indexOf(
      'const adsResult = await query'
    );

    expect(adsResultStart).toBeGreaterThan(0);

    const sellerSummary = sellerSource.slice(
      0,
      adsResultStart
    );

    const publicInventory = sellerSource.slice(
      adsResultStart
    );

    expect(sellerSummary).toMatch(
      /LEFT JOIN advertisements a\s+ON a\.posted_by = u\.id/
    );

    expect(sellerSummary).toMatch(
      /WHERE u\.id = \$1\s+GROUP BY/
    );

    expect(sellerSummary).toContain(
      'COALESCE(AVG(ar.rating), 0)::float AS average_rating'
    );

    expect(sellerSummary).toContain(
      'COUNT(ar.id)::int AS review_count'
    );

    expect(publicInventory).toContain(
      "AND a.status = 'active'"
    );
  });
});
