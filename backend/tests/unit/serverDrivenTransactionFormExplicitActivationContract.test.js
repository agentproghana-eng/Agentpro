'use strict';

const fs = require('fs');
const path = require('path');

const read = relativePath =>
  fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );

describe(
  'server-driven transaction explicit activation contract',
  () => {
    const routes = read(
      'src/routes/admin.routes.js',
    );

    const portal = read(
      '../admin_portal/src/features/ussd/UssdAdminPages.jsx',
    );

    test(
      'generic flow PATCH cannot change activation',
      () => {
        const start =
          routes.indexOf(
            "router.patch('/ussd-flows/:id'",
          );

        const end =
          routes.indexOf(
            "router.patch('/ussd-flows/:id/activation'",
            start,
          );

        const generic =
          routes.slice(start, end);

        expect(generic).toContain(
          'USSD_FLOW_ACTIVATION_ENDPOINT_REQUIRED',
        );

        expect(generic).not.toContain(
          'is_active = COALESCE',
        );
      },
    );

    test(
      'activation uses a dedicated backend endpoint',
      () => {
        expect(routes).toContain(
          "router.patch('/ussd-flows/:id/activation'",
        );

        expect(routes).toContain(
          'FOR UPDATE',
        );

        expect(routes).toContain(
          'validateFlowSteps(steps)',
        );

        expect(routes).toContain(
          'validateTransactionFormSchema',
        );
      },
    );

    test(
      'operator id transport fails closed',
      () => {
        expect(routes).toContain(
          "field?.key === 'operator_id'",
        );

        expect(routes).toContain(
          'USSD_FORM_FIELD_TRANSPORT_NOT_READY',
        );
      },
    );

    test(
      'EVD activation fails closed until accounting is validated',
      () => {
        expect(routes).toContain(
          "flow.business_sim_role === 'evd'",
        );

        expect(routes).toContain(
          'USSD_SIM_ROLE_ACCOUNTING_NOT_READY',
        );
      },
    );

    test(
      'activation and deactivation have explicit audit events',
      () => {
        expect(routes).toContain(
          "'USSD_FLOW_ACTIVATED'",
        );

        expect(routes).toContain(
          "'USSD_FLOW_DEACTIVATED'",
        );

        expect(routes).toContain(
          'oldValues:',
        );
      },
    );

    test(
      'active flow configuration cannot be edited in place',
      () => {
        expect(routes).toContain(
          'USSD_FLOW_DEACTIVATE_BEFORE_EDIT',
        );

        expect(routes).toContain(
          'Deactivate this flow before changing its configuration.',
        );

        const genericStart =
          routes.indexOf(
            "router.patch('/ussd-flows/:id'",
          );

        const activationStart =
          routes.indexOf(
            "router.patch('/ussd-flows/:id/activation'",
            genericStart,
          );

        const generic =
          routes.slice(
            genericStart,
            activationStart,
          );

        expect(generic).toContain(
          'FOR UPDATE',
        );

        expect(generic).toContain(
          'is_active === true',
        );

        expect(portal).toContain(
          'disabled={saving || f.is_active}',
        );

        expect(portal).toContain(
          'Deactivate this flow before editing its configuration.',
        );

        expect(portal).not.toContain(
          'Save & Deploy',
        );

        expect(portal).not.toContain(
          'Flow updated and verified live',
        );
      },
    );

    test(
      'portal uses only the dedicated activation endpoint',
      () => {
        expect(portal).toContain(
          '/activation`',
        );

        expect(portal).toContain(
          'changeActivation',
        );

        expect(portal).toContain(
          "'Activate'",
        );

        expect(portal).toContain(
          "'Deactivate'",
        );

        expect(portal).toContain(
          'delete parsed.is_active',
        );
      },
    );
  },
);
