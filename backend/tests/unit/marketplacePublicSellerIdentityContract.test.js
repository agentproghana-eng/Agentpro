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
      'ad.is_owner = ad.posted_by === req.user.id;'
    );
    expect(source).toContain('AS seller_average_rating');
    expect(source).toContain('AS seller_review_count');
    expect(source).toMatch(
      /WHERE seller_ad\.posted_by = u\.id/
    );
  });
});
