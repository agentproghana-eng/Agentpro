export const ADMIN_PORTAL_ROLES = Object.freeze([
  'superuser',
  'admin_support',
  'admin_operations',
  'admin_finance',
  'admin_content',
]);

const ROLE_PATHS = Object.freeze({
  superuser: Object.freeze([
    '*',
  ]),

  admin_support: Object.freeze([
    '/',
    '/support',
  ]),

  admin_operations: Object.freeze([
    '/',
    '/registrations',
    '/companies',
    '/personal-users',
    '/shifts',
    '/ussd',
    '/flows',
  ]),

  admin_finance: Object.freeze([
    '/',
    '/subscriptions',
    '/commissions',
  ]),

  admin_content: Object.freeze([
    '/',
    '/community',
    '/marketplace-businesses',
    '/marketplace',
  ]),
});

const ROLE_LABELS = Object.freeze({
  superuser: 'Superuser',
  admin_support: 'Support Admin',
  admin_operations: 'Operations Admin',
  admin_finance: 'Finance Admin',
  admin_content: 'Content Admin',
});

export function isAdminPortalRole(role) {
  return ADMIN_PORTAL_ROLES.includes(role);
}

function normalizedAdminPath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0
  ) {
    return '/';
  }

  if (path.startsWith('/companies/')) {
    return '/companies';
  }

  return path;
}

export function canAccessAdminPath(
  role,
  path,
) {
  const allowed =
    ROLE_PATHS[role] || [];

  if (allowed.includes('*')) {
    return true;
  }

  return allowed.includes(
    normalizedAdminPath(path),
  );
}

export function adminRoleLabel(role) {
  return ROLE_LABELS[role] || 'Administrator';
}
