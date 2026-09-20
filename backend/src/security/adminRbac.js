'use strict';

const ADMIN_STAFF_ROLES = Object.freeze([
  'admin_support',
  'admin_operations',
  'admin_finance',
  'admin_content',
]);

const ADMIN_PORTAL_ROLES = Object.freeze([
  'superuser',
  ...ADMIN_STAFF_ROLES,
]);

const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  superuser: Object.freeze(['*']),
  admin_support: Object.freeze([
    'dashboard.read',
    'support.manage',
  ]),
  admin_operations: Object.freeze([
    'dashboard.read',
    'operations.manage',
    'users.manage',
    'shifts.read',
  ]),
  admin_finance: Object.freeze([
    'dashboard.read',
    'finance.manage',
  ]),
  admin_content: Object.freeze([
    'dashboard.read',
    'content.manage',
  ]),
});

function isAdminPortalRole(role) {
  return ADMIN_PORTAL_ROLES.includes(role);
}

function isAdminStaffRole(role) {
  return ADMIN_STAFF_ROLES.includes(role);
}

function normalizeAdminRoles(roles) {
  if (!Array.isArray(roles)) return [];

  return [
    ...new Set(
      roles.filter(
        (role) =>
          typeof role === 'string' &&
          ADMIN_STAFF_ROLES.includes(role),
      ),
    ),
  ];
}

function adminRolesForUser(user) {
  if (!user || typeof user !== 'object') {
    return [];
  }

  if (user.role === 'superuser') {
    return ['superuser'];
  }

  // Runtime-authenticated users always carry admin_roles.
  // An explicit empty array means delegated access was revoked.
  if (Array.isArray(user.admin_roles)) {
    return normalizeAdminRoles(user.admin_roles);
  }

  // Backward-compatible fallback for older tests/pre-migration objects.
  return isAdminStaffRole(user.role)
    ? [user.role]
    : [];
}

function isAdminPortalUser(user) {
  return (
    user?.role === 'superuser' ||
    adminRolesForUser(user).length > 0
  );
}

function hasAdminRole(user, role) {
  if (role === 'superuser') {
    return user?.role === 'superuser';
  }

  return adminRolesForUser(user).includes(role);
}

function adminPermissionsForRole(role) {
  return ADMIN_ROLE_PERMISSIONS[role] || [];
}

function adminPermissionsForUser(user) {
  if (user?.role === 'superuser') {
    return ['*'];
  }

  return [
    ...new Set(
      adminRolesForUser(user).flatMap(
        (role) =>
          ADMIN_ROLE_PERMISSIONS[role] || [],
      ),
    ),
  ];
}

function hasAdminPermission(subject, permission) {
  const permissions =
    typeof subject === 'string'
      ? adminPermissionsForRole(subject)
      : adminPermissionsForUser(subject);

  return (
    permissions.includes('*') ||
    permissions.includes(permission)
  );
}

module.exports = {
  ADMIN_STAFF_ROLES,
  ADMIN_PORTAL_ROLES,
  ADMIN_ROLE_PERMISSIONS,
  isAdminPortalRole,
  isAdminStaffRole,
  normalizeAdminRoles,
  adminRolesForUser,
  isAdminPortalUser,
  hasAdminRole,
  adminPermissionsForRole,
  adminPermissionsForUser,
  hasAdminPermission,
};
