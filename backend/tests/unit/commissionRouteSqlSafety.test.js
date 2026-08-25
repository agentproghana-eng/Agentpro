const fs = require('fs');
const path = require('path');

describe('commission route SQL safety', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../src/routes/commission.routes.js'
    ),
    'utf8'
  );

  test('commission rules remain authenticated and role scoped', () => {
    expect(
      source
    ).toContain(
      'router.use(authenticate)'
    );

    expect(
      source
    ).toContain(
      "authorize('superuser', 'business_owner')"
    );
  });

  test('business company filtering uses PostgreSQL parameters', () => {
    expect(
      source
    ).toContain(
      'company_id = $1 OR company_id IS NULL'
    );

    expect(
      source
    ).toContain(
      '[req.user.company_id]'
    );

    expect(
      source
    ).not.toContain(
      "${req.user.company_id}"
    );
  });
});
