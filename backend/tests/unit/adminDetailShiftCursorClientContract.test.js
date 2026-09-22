'use strict';

const fs = require('fs');
const path = require('path');

const pages = fs.readFileSync(
  path.join(
    __dirname,
    '../../..',
    'admin_portal/src/pages.jsx',
  ),
  'utf8',
);

function section(
  startMarker,
  endMarker,
) {
  const start =
    pages.indexOf(startMarker);
  const end =
    pages.indexOf(
      endMarker,
      start + startMarker.length,
    );

  expect(start)
    .toBeGreaterThanOrEqual(0);
  expect(end)
    .toBeGreaterThan(start);

  return pages.slice(
    start,
    end,
  );
}

describe(
  'Admin Company Detail and Shifts cursor clients',
  () => {
    test(
      'Company Detail uses cursor staff loading instead of a capped first 100',
      () => {
        const company =
          section(
            'export function CompanyDetailPage()',
            'export function ShiftsPage()',
          );

        expect(company)
          .toContain(
            "'/users/cursor'",
          );
        expect(company)
          .toContain(
            'company_id: companyId',
          );
        expect(company)
          .toContain(
            "role: 'business_owner'",
          );
        expect(company)
          .toContain(
            'limit: 50',
          );
        expect(company)
          .toContain(
            'next_cursor',
          );
        expect(company)
          .toContain(
            "'Load more staff'",
          );

        expect(company)
          .not.toContain(
            '/users?company_id=${companyId}&limit=100',
          );
      },
    );

    test(
      'Shifts uses the existing cursor endpoint with incremental loading',
      () => {
        const shifts =
          section(
            'export function ShiftsPage()',
            'export function USSDTemplatesPage()',
          );

        expect(shifts)
          .toContain(
            "'/shifts/cursor'",
          );
        expect(shifts)
          .toContain(
            'flagged_only: flagged',
          );
        expect(shifts)
          .toContain(
            'limit: 50',
          );
        expect(shifts)
          .toContain(
            'response.data.pagination',
          );
        expect(shifts)
          .toContain(
            'next_cursor',
          );
        expect(shifts)
          .toContain(
            "'Load more shifts'",
          );

        expect(shifts)
          .not.toContain(
            "API.get('/shifts',",
          );
      },
    );
  },
);
