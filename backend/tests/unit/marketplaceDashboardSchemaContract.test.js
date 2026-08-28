const fs = require('fs');
const path = require('path');

describe('marketplace dashboard rating identity contract', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/routes/marketplace.routes.js'
    ),
    'utf8'
  );

  test('uses ad_ratings.rated_by for dashboard review identity', () => {
    const dashboardMatch = source.match(
      /mpRouter\.get\(\s*["']\/dashboard["']/
    );

    const reviewsMatch = source.match(
      /mpRouter\.get\(\s*["']\/reviews\/received["']/
    );

    expect(dashboardMatch).not.toBeNull();
    expect(reviewsMatch).not.toBeNull();

    const dashboardSource = source.slice(
      dashboardMatch.index,
      reviewsMatch.index
    );

    expect(dashboardSource).toContain(
      'ON u.id = ar.rated_by'
    );

    expect(dashboardSource).not.toContain(
      'ar.user_id'
    );
  });
});
