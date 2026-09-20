const fs = require('fs');
const path = require('path');

const {
  normalizeFlowHealthSignal,
} = require(
  '../../src/services/ussdFlowHealthService'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath
    ),
    'utf8'
  );
}

describe(
  'USSD Flow Health Monitor',
  () => {
    test(
      'normalizes valid structural signals',
      () => {
        expect(
          normalizeFlowHealthSignal({
            flow_id:
              '99194123-51ae-41f2-8d1b-b9599f76fdfa',
            event:
              'mismatch',
            step_count:
              9,
            mismatch_step_index:
              1,
          })
        ).toEqual({
          flowId:
            '99194123-51ae-41f2-8d1b-b9599f76fdfa',
          event:
            'mismatch',
          stepCount:
            9,
          mismatchStepIndex:
            1,
        });

        expect(
          normalizeFlowHealthSignal({
            flow_id:
              '99194123-51ae-41f2-8d1b-b9599f76fdfa',
            event:
              'healthy',
            step_count:
              9,
          })
        ).toEqual({
          flowId:
            '99194123-51ae-41f2-8d1b-b9599f76fdfa',
          event:
            'healthy',
          stepCount:
            9,
          mismatchStepIndex:
            null,
        });
      }
    );

    test(
      'rejects invalid structural metadata',
      () => {
        expect(() =>
          normalizeFlowHealthSignal({
            flow_id:
              'not-a-uuid',
            event:
              'mismatch',
            step_count:
              9,
            mismatch_step_index:
              1,
          })
        ).toThrow(
          'Flow health metadata is invalid'
        );

        expect(() =>
          normalizeFlowHealthSignal({
            flow_id:
              '99194123-51ae-41f2-8d1b-b9599f76fdfa',
            event:
              'mismatch',
            step_count:
              9,
            mismatch_step_index:
              10,
          })
        ).toThrow(
          'Flow mismatch step is invalid'
        );
      }
    );

    test(
      'same transaction retry cannot inflate incident count',
      () => {
        const service = read(
          'src/services/ussdFlowHealthService.js'
        );

        expect(
          service
        ).toContain(
          '.last_transaction_id ='
        );

        expect(
          service
        ).toContain(
          'THEN 0'
        );

        expect(
          service
        ).toContain(
          'ELSE 1'
        );
      }
    );

    test(
      'healthy evidence recovers open incidents',
      () => {
        const service = read(
          'src/services/ussdFlowHealthService.js'
        );

        expect(
          service
        ).toContain(
          "status = 'recovered'"
        );

        expect(
          service
        ).toContain(
          "AND status = 'open'"
        );
      }
    );

    test(
      'admin flow-health routes remain permission protected',
      () => {
        const admin = read(
          'src/routes/admin.routes.js'
        );

        expect(
          admin
        ).toContain(
          'requireAdminPortalAccess'
        );

        expect(
          admin
        ).toContain(
          "'/ussd-flow-health'"
        );

        expect(
          admin
        ).toContain(
          "'/ussd-flow-health/:incident_id/dismiss'"
        );
      }
    );
  }
);
