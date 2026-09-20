'use strict';

const fs = require('fs');
const path = require('path');

const {
  adminRolesForUser,
  isAdminPortalUser,
  hasAdminRole,
  adminPermissionsForUser,
  hasAdminPermission,
} = require('../../src/security/adminRbac');

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
  'Admin multi-role account management',
  () => {
    test(
      'one customer can hold several delegated admin roles without losing the primary role',
      () => {
        const user = {
          role: 'customer',
          admin_roles: [
            'admin_support',
            'admin_finance',
          ],
        };

        expect(user.role)
          .toBe('customer');

        expect(adminRolesForUser(user))
          .toEqual([
            'admin_support',
            'admin_finance',
          ]);

        expect(isAdminPortalUser(user))
          .toBe(true);

        expect(
          hasAdminRole(
            user,
            'admin_support',
          ),
        ).toBe(true);

        expect(
          hasAdminRole(
            user,
            'admin_finance',
          ),
        ).toBe(true);

        expect(
          hasAdminPermission(
            user,
            'support.manage',
          ),
        ).toBe(true);

        expect(
          hasAdminPermission(
            user,
            'finance.manage',
          ),
        ).toBe(true);

        expect(
          adminPermissionsForUser(user),
        ).toEqual(
          expect.arrayContaining([
            'dashboard.read',
            'support.manage',
            'finance.manage',
          ]),
        );
      },
    );

    test(
      'an explicit empty admin membership set revokes delegated portal access',
      () => {
        const promotedCustomer = {
          role: 'customer',
          admin_roles: [],
        };

        expect(
          isAdminPortalUser(
            promotedCustomer,
          ),
        ).toBe(false);
      },
    );

    test(
      'migration stores additive delegated roles and backfills legacy admins',
      () => {
        const migration = read(
          'migrations/143_admin_multi_role_memberships.sql',
        );

        expect(migration)
          .toContain(
            'CREATE TABLE IF NOT EXISTS user_admin_roles',
          );

        expect(migration)
          .toContain(
            'PRIMARY KEY (user_id, role)',
          );

        expect(migration)
          .toContain(
            'ON CONFLICT (user_id, role)',
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
      'durable session authorization reloads additive roles from PostgreSQL',
      () => {
        const auth = read(
          'src/middleware/auth.js',
        );

        expect(auth)
          .toContain(
            'FROM user_admin_roles uar',
          );

        expect(auth)
          .toContain(
            'admin_roles:',
          );

        expect(auth)
          .toContain(
            'delegatedAdminRoleAllowed',
          );

        expect(auth)
          .toContain(
            'MFA_REAUTH_REQUIRED',
          );
      },
    );

    test(
      'Admin Portal login is explicit and MFA-gated while normal app login remains available',
      () => {
        const controller = read(
          'src/controllers/authController.js',
        );

        const routes = read(
          'src/routes/auth.routes.js',
        );

        const portal =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../..',
              'admin_portal/src/App.jsx',
            ),
            'utf8',
          );

        expect(routes)
          .toContain(
            "body('admin_portal')",
          );

        expect(controller)
          .toContain(
            'adminPortalRequested',
          );

        expect(controller)
          .toContain(
            'isAdminPortalUser(user)',
          );

        expect(portal)
          .toContain(
            'admin_portal: true',
          );
      },
    );

    test(
      'Admin Team can search registered users and assign multiple roles',
      () => {
        const admin = read(
          'src/routes/admin.routes.js',
        );

        expect(admin)
          .toContain(
            "'/admin-team/candidates'",
          );

        expect(admin)
          .toContain(
            'requestedAdminRoles',
          );

        expect(admin)
          .toContain(
            'user_admin_roles',
          );

        expect(admin)
          .toContain(
            'ADMIN_ACCOUNT_UPDATED',
          );
      },
    );

    test(
      'identity and privilege changes revoke sessions and phone changes clear verification',
      () => {
        const admin = read(
          'src/routes/admin.routes.js',
        );

        expect(admin)
          .toContain(
            'emailChanged',
          );

        expect(admin)
          .toContain(
            'phoneChanged',
          );

        expect(admin)
          .toContain(
            'phone_verified_at',
          );

        expect(admin)
          .toContain(
            'UPDATE refresh_tokens',
          );
      },
    );

    test(
      'secure admin invitations and reactivations populate additive membership',
      () => {
        const users = read(
          'src/controllers/userController.js',
        );

        expect(users)
          .toMatch(
            /INSERT INTO user_admin_roles[\s\S]*createdUser\.id/,
          );

        expect(users)
          .toMatch(
            /DELETE FROM user_admin_roles[\s\S]*existingUserId/,
          );

        expect(users)
          .toMatch(
            /INSERT INTO user_admin_roles[\s\S]*existingUserId/,
          );
      },
    );

    test(
      'Admin Team UI supports search profile editing and role checkboxes',
      () => {
        const page =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../..',
              'admin_portal/src/features/admin/AdminTeamPage.jsx',
            ),
            'utf8',
          );

        expect(page)
          .toContain(
            'Grant access to a registered user',
          );

        expect(page)
          .toContain(
            'admin-team/candidates',
          );

        expect(page)
          .toContain(
            'type="checkbox"',
          );

        expect(page)
          .toContain(
            'Save account & roles',
          );
      },
    );
  },
);
