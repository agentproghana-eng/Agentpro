'use strict';

const {
  isAdminPortalUser,
  hasAdminPermission,
} = require('../security/adminRbac');

const ADMIN_ROUTE_POLICIES = Object.freeze([
  {
    methods: ['GET'],
    pattern: /^\/overview$/,
    permission: 'dashboard.read',
  },
  {
    methods: ['GET'],
    pattern: /^\/operational-status$/,
    permission: 'operations.manage',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/ussd-flow-health(?:\/[^/]+\/dismiss)?$/,
    permission: 'operations.manage',
  },
  {
    methods: ['GET'],
    pattern: /^\/support\/timeline$/,
    permission: 'support.manage',
  },
  {
    methods: ['GET', 'PATCH', 'POST'],
    pattern: /^\/support\/cases(?:\/[^/]+(?:\/reply)?)?$/,
    permission: 'support.manage',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/fraud-signals(?:\/[^/]+(?:\/review)?)?$/,
    permission: 'support.manage',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/pending-registrations(?:\/[^/]+\/approve)?$/,
    permission: 'operations.manage',
  },
  {
    methods: ['GET'],
    pattern: /^\/marketplace-businesses(?:\/cursor)?$/,
    permission: 'content.manage',
  },
  {
    methods: ['PATCH'],
    pattern: /^\/marketplace-businesses\/[^/]+\/(?:verification|featured)$/,
    permission: 'content.manage',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/config(?:\/[^/]+)?$/,
    permission: 'system.config',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/ussd-templates(?:\/[^/]+)?$/,
    permission: 'operations.manage',
  },
  {
    methods: ['GET', 'POST', 'PATCH'],
    pattern: /^\/ussd-flows(?:\/[^/]+)?$/,
    permission: 'operations.manage',
  },
  {
    methods: ['GET'],
    pattern: /^\/audit-logs(?:\/cursor)?$/,
    permission: 'audit.read',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/ads(?:\/pending|\/[^/]+\/moderate)$/,
    permission: 'content.manage',
  },
  {
    methods: ['GET', 'PATCH'],
    pattern: /^\/admin-team(?:\/[^/]+)?$/,
    permission: 'admin.team.manage',
  },
]);

function permissionForRequest(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');

  const policy = ADMIN_ROUTE_POLICIES.find(
    (entry) =>
      entry.methods.includes(method) &&
      entry.pattern.test(path),
  );

  return policy?.permission || null;
}

function requireAdminPortalAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (!isAdminPortalUser(req.user)) {
    return res.status(403).json({
      success: false,
      code: 'ADMIN_PORTAL_ROLE_REQUIRED',
      message: 'Administrator access is required.',
    });
  }

  if (!req.user.mfa_verified_at) {
    return res.status(401).json({
      success: false,
      code: 'MFA_REAUTH_REQUIRED',
      message:
        'Administrator MFA authentication is required. Please sign in again.',
    });
  }

  if (req.user.role === 'superuser') {
    return next();
  }

  const permission = permissionForRequest(req);

  if (
    !permission ||
    !hasAdminPermission(
      req.user,
      permission,
    )
  ) {
    return res.status(403).json({
      success: false,
      code: 'ADMIN_PERMISSION_REQUIRED',
      message:
        'Your administrator role does not permit this action.',
    });
  }

  req.admin_permission = permission;

  return next();
}

module.exports = {
  ADMIN_ROUTE_POLICIES,
  permissionForRequest,
  requireAdminPortalAccess,
};
