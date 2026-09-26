'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const controller = fs.readFileSync(
  path.join(
    root,
    'src/controllers/ussdFlowController.js',
  ),
  'utf8',
);

const routes = fs.readFileSync(
  path.join(
    root,
    'src/routes/ussdFlow.routes.js',
  ),
  'utf8',
);

const start = controller.indexOf(
  'exports.getExecutionCredentials',
);

const block =
  start >= 0 ? controller.slice(start) : '';

describe(
  'Telecel protected execution credential boundary',
  () => {
    test(
      'route is authenticated and subscription protected',
      () => {
        expect(routes).toContain(
          'router.use(authenticate)',
        );
        expect(routes).toContain(
          "'/execution-credentials'",
        );
        expect(routes).toMatch(
          /'\/execution-credentials'[\s\S]*requireActiveSubscription[\s\S]*ussdFlowController\.getExecutionCredentials/,
        );
      },
    );

    test(
      'server derives credential requirements from stored flow',
      () => {
        expect(block).toContain(
          'FROM ussd_flow_steps',
        );
        expect(block).toContain(
          'actions.has("send_operator_id")',
        );
        expect(block).toContain(
          '"send_organisation_shortcode"',
        );
      },
    );

    test(
      'flow is restricted to active Telecel Business role',
      () => {
        expect(block).toContain(
          "AND provider = 'telecel'",
        );
        expect(block).toContain(
          'AND business_sim_role = $2',
        );
        expect(block).toContain(
          'AND owner_user_id IS NULL',
        );
        expect(block).toContain(
          'AND is_active = TRUE',
        );
      },
    );

    test(
      'company ownership is revalidated server side',
      () => {
        expect(block).toContain(
          'company_id IS NULL',
        );
        expect(block).toContain(
          'company_id = $3',
        );
        expect(block).toContain(
          'req.user.company_id',
        );
      },
    );

    test(
      'only fixed encrypted columns are selectable',
      () => {
        expect(block).toContain(
          '"telecel_agent_operator_id_enc"',
        );
        expect(block).toContain(
          '"telecel_merchant_operator_id_enc"',
        );
        expect(block).toContain(
          '"telecel_agent_organisation_shortcode_enc"',
        );
        expect(block).toContain(
          '"telecel_merchant_organisation_shortcode_enc"',
        );
      },
    );

    test(
      'only server-required values are decrypted',
      () => {
        expect(block).toContain(
          'needsOperatorId',
        );
        expect(block).toContain(
          'needsOrganisationShortcode',
        );
        expect(block).toContain(
          'decryptTelecelCredential(',
        );
        expect(block).toContain(
          '"operator_id"',
        );
        expect(block).toContain(
          '"organisation_shortcode"',
        );
      },
    );

    test(
      'missing credentials fail closed',
      () => {
        expect(block).toContain(
          '"TELECEL_OPERATOR_ID_NOT_CONFIGURED"',
        );
        expect(block).toContain(
          '"TELECEL_ORGANISATION_SHORTCODE_NOT_CONFIGURED"',
        );
      },
    );

    test(
      'distinguishes Agent Shortcode from Merchant Organisation Shortcode',
      () => {
        expect(block).toContain(
          'simRole === "agent"',
        );
        expect(block).toContain(
          '"Agent Shortcode"',
        );
        expect(block).toContain(
          '"Organisation Shortcode"',
        );
        expect(block).toContain(
          '"TELECEL_AGENT_SHORTCODE_NOT_CONFIGURED"',
        );
        expect(block).toContain(
          '"TELECEL_ORGANISATION_SHORTCODE_NOT_CONFIGURED"',
        );

        // Storage remains role-separated and backward compatible.
        expect(block).toContain(
          '"telecel_agent_organisation_shortcode_enc"',
        );
        expect(block).toContain(
          '"telecel_merchant_organisation_shortcode_enc"',
        );
      },
    );

    test(
      'client cannot choose requested credential types',
      () => {
        expect(block).not.toContain(
          'req.body?.credential',
        );
        expect(block).not.toContain(
          'req.body.credentials',
        );
        expect(block).not.toContain(
          'required_credentials',
        );
      },
    );

    test(
      'endpoint is not a transaction or personal credential store',
      () => {
        expect(block).not.toContain(
          'transaction_id',
        );
        expect(block).not.toContain(
          'personal-ussd',
        );
      },
    );
  },
);
