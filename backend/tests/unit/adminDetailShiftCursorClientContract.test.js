'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../../..',
      relativePath,
    ),
    'utf8',
  );
}

const pages =
  read('admin_portal/src/pages.jsx');

const userPages =
  read(
    'admin_portal/src/features/users/UserManagementPages.jsx',
  );

function section(
  text,
  startMarker,
  endMarker = null,
) {
  const start =
    text.indexOf(startMarker);

  expect(start)
    .toBeGreaterThanOrEqual(0);

  const end =
    endMarker === null
      ? text.length
      : text.indexOf(
          endMarker,
          start + startMarker.length,
        );

  expect(end)
    .toBeGreaterThan(start);

  return text.slice(
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
            userPages,
            'export function CompanyDetailPage()',
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
            pages,
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
