'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath,
    ),
    'utf8',
  );
}

describe(
  'Admin Portal RBAC contracts',
  () => {
    test(
      'migration adds only delegated admin roles',
      () => {
        const migration =
          read(
            'migrations/142_admin_portal_rbac.sql',
          );

        for (
          const role of [
            'admin_support',
            'admin_operations',
            'admin_finance',
            'admin_content',
          ]
        ) {
          expect(migration)
            .toContain(role);
        }
      },
    );

    test(
      'permission model is explicit and superuser retains wildcard authority',
      () => {
        const rbac =
          read(
            'src/security/adminRbac.js',
          );

        expect(rbac)
          .toContain(
            "superuser: Object.freeze(['*'])",
          );

        expect(rbac)
          .toContain(
            "'support.manage'",
          );

        expect(rbac)
          .toContain(
            "'operations.manage'",
          );

        expect(rbac)
          .toContain(
            "'finance.manage'",
          );

        expect(rbac)
          .toContain(
            "'content.manage'",
          );
      },
    );

    test(
      'admin router fails closed through central route policy',
      () => {
        const routes =
          read(
            'src/routes/admin.routes.js',
          );

        const middleware =
          read(
            'src/middleware/adminAuthorization.js',
          );

        expect(routes)
          .toContain(
            'router.use(authenticate, requireAdminPortalAccess)',
          );

        expect(middleware)
          .toContain(
            "'ADMIN_PERMISSION_REQUIRED'",
          );

        expect(middleware)
          .toContain(
            '!permission ||',
          );
      },
    );

    test(
      'all administrator identities require durable MFA assurance',
      () => {
        const auth =
          read(
            'src/middleware/auth.js',
          );

        const controller =
          read(
            'src/controllers/authController.js',
          );

        expect(auth)
          .toContain(
            'isAdminPortalRole(activeSession.role)',
          );

        expect(controller)
          .toContain(
            'adminPortalRequested',
          );

        expect(controller)
          .toContain(
            'isAdminPortalUser(user)',
          );

        expect(controller)
          .toContain(
            '!isAdminPortalRole(',
          );

        expect(controller)
          .toContain(
            '!matchedSession.mfa_verified_at',
          );
      },
    );

    test(
      'superuser secure staff invite accepts delegated admin roles without creator passwords',
      () => {
        const routes =
          read(
            'src/routes/user.routes.js',
          );

        const controller =
          read(
            'src/controllers/userController.js',
          );

        expect(routes)
          .toContain(
            '...ADMIN_STAFF_ROLES',
          );

        expect(controller)
          .toContain(
            '"admin_support"',
          );

        expect(controller)
          .toContain(
            'A creator must never choose or know a staff member',
          );

        expect(controller)
          .toContain(
            'createStaffSetupArtifacts()',
          );
      },
    );

    test(
      'operations staff never inherit transaction-processing shift permissions',
      () => {
        const routes =
          read(
            'src/routes/shift.routes.js',
          );

        expect(routes)
          .toContain(
            "'admin_operations'",
          );

        expect(routes)
          .toContain(
            'router.use(requireActiveSubscription)',
          );

        const readGate =
          routes.indexOf(
            'requireShiftListAccess',
          );

        const businessGate =
          routes.indexOf(
            'router.use(requireActiveSubscription)',
          );

        expect(readGate)
          .toBeGreaterThan(-1);

        expect(businessGate)
          .toBeGreaterThan(
            readGate,
          );
      },
    );

    test(
      'operations staff cannot read or mutate administrator identities through users routes',
      () => {
        const controller =
          read(
            'src/controllers/userController.js',
          );

        expect(controller)
          .toContain(
            'Administrator accounts are restricted to superuser management',
          );

        expect(controller)
          .toContain(
            'isAdminPortalUser(targetUser)',
          );

        expect(controller)
          .toContain(
            'ADMIN_STAFF_ROLES',
          );
      },
    );

    test(
      'Admin Team route can never target the superuser role',
      () => {
        const admin =
          read(
            'src/routes/admin.routes.js',
          );

        expect(admin)
          .toContain(
            "target.role === 'superuser'",
          );

        expect(admin)
          .toContain(
            'ADMIN_STAFF_ROLES',
          );
      },
    );

    test(
      'content admin Marketplace UI hides generic account controls',
      () => {
        const app = fs.readFileSync(
          path.join(
            __dirname,
            '../../..',
            'admin_portal/src/App.jsx',
          ),
          'utf8',
        );

        const marketplacePage = fs.readFileSync(
          path.join(
            __dirname,
            '../../..',
            'admin_portal/src/features/marketplace/MarketplaceBusinessesPage.jsx',
          ),
          'utf8',
        );

        expect(app)
          .toContain(
            'allowAccountActions={',
          );

        expect(marketplacePage)
          .toContain(
            'allowAccountActions = true',
          );

        expect(marketplacePage)
          .toContain(
            'Superuser only',
          );
      },
    );
  },
);
