const fs = require('fs');
const path = require('path');

const capabilitySource = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/utils/ussdFlowCapabilities.js'
  ),
  'utf8'
);

const guardSource = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/middleware/transactionCapability.js'
  ),
  'utf8'
);

describe(
  'server-driven transaction initiation capability boundary',
  () => {
    test(
      'initiation requires an active exact provider flow',
      () => {
        expect(capabilitySource).toContain(
          'FROM ussd_flows f'
        );
        expect(capabilitySource).toContain(
          'f.provider::text = $1'
        );
        expect(capabilitySource).toContain(
          'f.transaction_type::text = $2'
        );
        expect(capabilitySource).toContain(
          'f.is_active = TRUE'
        );
        expect(capabilitySource).toContain(
          'active_flow_available'
        );
      }
    );

    test(
      'business initiation is isolated by exact SIM role',
      () => {
        expect(capabilitySource).toContain(
          'f.business_sim_role = $4'
        );

        expect(capabilitySource).not.toContain(
          "COALESCE(f.business_sim_role, 'agent') = $4"
        );

        expect(guardSource).toContain(
          "String(req.body.sim_role || 'agent')"
        );

        expect(guardSource).toContain(
          'businessSimRole'
        );
      }
    );

    test(
      'personal initiation cannot consume business flows',
      () => {
        expect(capabilitySource).toContain(
          'f.business_sim_role IS NULL'
        );
      }
    );

    test(
      'stale catalog cannot initiate a deactivated flow',
      () => {
        expect(capabilitySource).toContain(
          'f.is_active = TRUE'
        );

        expect(guardSource).toContain(
          '!capability.active_flow_available'
        );
      }
    );

    test(
      'capability table still controls initiable transaction types',
      () => {
        expect(capabilitySource).toContain(
          'FROM ussd_flow_capabilities'
        );
        expect(capabilitySource).toContain(
          'AND can_initiate = TRUE'
        );
      }
    );

    test(
      'global flow identity remains server controlled',
      () => {
        expect(capabilitySource).toContain(
          'f.owner_user_id IS NULL'
        );
        expect(capabilitySource).toContain(
          'f.company_id IS NULL'
        );
      }
    );

    test(
      'guard fails closed when exact active flow is unavailable',
      () => {
        expect(guardSource).toMatch(
          /!capability\.transaction_type_initiable\s*\|\|\s*!capability\.active_flow_available/
        );
      }
    );
  }
);
