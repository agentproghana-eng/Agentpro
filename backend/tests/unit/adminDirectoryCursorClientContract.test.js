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

function sliceBetween(startMarker, endMarker) {
  const start = pages.indexOf(startMarker);
  const end = pages.indexOf(
    endMarker,
    start + startMarker.length,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return pages.slice(start, end);
}

describe('Admin directory cursor client contract', () => {
  test('Companies uses server cursor search instead of first-100 local filtering', () => {
    const companies = sliceBetween(
      'export function CompaniesPage()',
      'export function PersonalUsersPage()',
    );

    expect(companies).toContain("'/users/cursor'");
    expect(companies).toContain("role: 'business_owner'");
    expect(companies).toContain('limit: 50');
    expect(companies).toContain('next_cursor');
    expect(companies).toContain("'Load more'");
    expect(companies).toContain('{ search: normalizedTerm }');
    expect(companies).not.toContain("'/users?role=business_owner&limit=100'");
    expect(companies).not.toContain('companies.filter(');
  });

  test('Personal Users uses server cursor search instead of first-100 local filtering', () => {
    const personal = sliceBetween(
      'export function PersonalUsersPage()',
      'export function MarketplaceBusinessesPage',
    );

    expect(personal).toContain("'/users/cursor'");
    expect(personal).toContain('personal_only: true');
    expect(personal).toContain('limit: 50');
    expect(personal).toContain('next_cursor');
    expect(personal).toContain("'Load more'");
    expect(personal).toContain('{ search: normalizedTerm }');
    expect(personal).not.toContain("'/users?personal_only=true&limit=100'");
    expect(personal).not.toContain('users.filter(');
  });
});
