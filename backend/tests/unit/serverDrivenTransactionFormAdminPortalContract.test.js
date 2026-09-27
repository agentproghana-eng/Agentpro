'use strict';

const fs = require('fs');
const path = require('path');

const read = relativePath =>
  fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );

describe(
  'server-driven transaction form Admin Portal contract',
  () => {
    const portal = read(
      '../admin_portal/src/features/ussd/UssdAdminPages.jsx',
    );

    test(
      'uses the installed transaction semantic allowlist',
      () => {
        for (const key of [
          'customer_phone',
          'recipient_phone',
          'amount',
          'account_number',
          'merchant_id',
          'reference',
          'operator_id',
        ]) {
          expect(portal).toContain(key);
        }

        expect(portal).toContain(
          'FORM_FIELD_CONFIG',
        );

        expect(portal).toContain(
          'validateFormSchema',
        );
      },
    );

    test(
      'keeps sensitive and accounting controls out of form schemas',
      () => {
        expect(portal).toContain(
          'FORBIDDEN_FORM_KEYS',
        );

        for (const key of [
          "'pin'",
          "'password'",
          "'otp'",
          "'sim_role'",
          "'posting_policy'",
          "'ledger_account'",
        ]) {
          expect(portal).toContain(key);
        }
      },
    );

    test(
      'create and update both transport form_schema',
      () => {
        expect(portal).toContain(
          'parsed.form_schema =',
        );

        expect(portal).toContain(
          'form_schema:',
        );

        expect(portal).toContain(
          'normalizeFormSchema(newFormSchema)',
        );
      },
    );

    test(
      'read-after-write verification includes form_schema',
      () => {
        const snapshotStart =
          portal.indexOf(
            'function normalizeFlowSnapshot',
          );

        const snapshotEnd =
          portal.indexOf(
            'function flowSnapshotsMatch',
          );

        const snapshot =
          portal.slice(
            snapshotStart,
            snapshotEnd,
          );

        expect(snapshot).toContain(
          'form_schema:',
        );

        expect(snapshot).toContain(
          'normalizeFormSchema',
        );
      },
    );

    test(
      'admin uses a constrained form builder instead of raw form schema JSON',
      () => {
        expect(portal).toContain(
          'function FormSchemaBuilder',
        );

        expect(portal).toContain(
          '<FormSchemaBuilder',
        );

        expect(portal).toContain(
          'Transaction Form',
        );

        expect(portal).not.toContain(
          'JSON.stringify(full.form_schema',
        );
      },
    );
  },
);

describe(
  'server-driven form control-plane safety',
  () => {
    const portal = read(
      '../admin_portal/src/features/ussd/UssdAdminPages.jsx',
    );

    test(
      'new flows are drafts instead of immediately live',
      () => {
        expect(portal).toContain(
          'is_active: false,',
        );

        expect(portal).toContain(
          'Flow draft created and verified',
        );

        expect(portal).toContain(
          'Create Draft',
        );

        expect(portal).not.toContain(
          'Flow created and verified live',
        );
      },
    );

    test(
      'normal flow editing preserves the persisted activation state',
      () => {
        expect(portal).toContain(
          'parsed.is_active =',
        );

        expect(portal).toContain(
          'editing.is_active === true',
        );

        const start =
          portal.indexOf(
            'const startEdit = async (f)',
          );

        const end =
          portal.indexOf(
            '// Mirrors UssdAccessibilityService',
            start,
          );

        const startEdit =
          portal.slice(start, end);

        expect(startEdit).not.toContain(
          'is_active: full.is_active',
        );
      },
    );

    test(
      'operator id is not exposed before transaction transport is ready',
      () => {
        const configStart =
          portal.indexOf(
            'const FORM_FIELD_CONFIG',
          );

        const configEnd =
          portal.indexOf(
            'const FORBIDDEN_FORM_KEYS',
            configStart,
          );

        const config =
          portal.slice(
            configStart,
            configEnd,
          );

        expect(config).not.toContain(
          'operator_id:',
        );

        expect(portal).toContain(
          'not exposed by this Admin builder yet',
        );
      },
    );
  },
);
