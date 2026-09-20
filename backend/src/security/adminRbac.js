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

function adminPermissionsForRole(role) {
  return ADMIN_ROLE_PERMISSIONS[role] || [];
}

function hasAdminPermission(role, permission) {
  const permissions = adminPermissionsForRole(role);

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
  adminPermissionsForRole,
  hasAdminPermission,
};
