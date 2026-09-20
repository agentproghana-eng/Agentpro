export const ADMIN_STAFF_ROLES = Object.freeze([
  'admin_support',
  'admin_operations',
  'admin_finance',
  'admin_content',
]);

export const ADMIN_PORTAL_ROLES = Object.freeze([
  'superuser',
  ...ADMIN_STAFF_ROLES,
]);

const ROLE_PATHS = Object.freeze({
  superuser: Object.freeze(['*']),
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

export function adminRolesForUser(user) {
  if (!user || typeof user !== 'object') {
    return [];
  }

  if (user.role === 'superuser') {
    return ['superuser'];
  }

  if (Array.isArray(user.admin_roles)) {
    return [
      ...new Set(
        user.admin_roles.filter(
          (role) =>
            ADMIN_STAFF_ROLES.includes(
              role,
            ),
        ),
      ),
    ];
  }

  return ADMIN_STAFF_ROLES.includes(
    user.role,
  )
    ? [user.role]
    : [];
}

export function isAdminPortalUser(user) {
  return (
    user?.role === 'superuser' ||
    adminRolesForUser(user).length > 0
  );
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
  user,
  path,
) {
  const roles =
    adminRolesForUser(user);

  if (roles.includes('superuser')) {
    return true;
  }

  const normalized =
    normalizedAdminPath(path);

  return roles.some(
    (role) =>
      (
        ROLE_PATHS[role] || []
      ).includes(normalized),
  );
}

export function adminRoleLabel(subject) {
  if (typeof subject === 'string') {
    return (
      ROLE_LABELS[subject] ||
      'Administrator'
    );
  }

  const roles =
    adminRolesForUser(subject);

  if (roles.length === 0) {
    return 'Administrator';
  }

  return roles
    .map(
      (role) =>
        ROLE_LABELS[role] || role,
    )
    .join(' + ');
}
