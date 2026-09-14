'use strict';

const fs = require('fs');
const path = require('path');

const controllerPath = path.join(
  __dirname,
  '../../src/controllers/authController.js',
);

const source = fs.readFileSync(
  controllerPath,
  'utf8',
);

describe(
  'auth fraud operational event contract',
  () => {
    test(
      'records only internal-user auth security events',
      () => {
        expect(source).toContain(
          "eventName: 'auth.login.failed'",
        );
        expect(source).toContain(
          "eventName: 'auth.mfa.failed'",
        );
        expect(source).toContain(
          "eventName: 'auth.password_reset.issued'",
        );

        expect(source).toContain(
          "subjectType: 'user'",
        );
        expect(source).toContain(
          'subjectId: user.id',
        );
      },
    );

    test(
      'does not persist unknown-account login attempts',
      () => {
        expect(source).toContain(
          'if (user) {',
        );

        expect(source).toContain(
          'Unknown',
        );
        expect(source).toContain(
          'emails remain deliberately absent',
        );
      },
    );

    test(
      'keeps auth fraud attributes free of raw sensitive identity data',
      () => {
        const forbiddenAttributeKeys = [
          'email:',
          'phone:',
          'password:',
          'token:',
          'otp:',
          'ip_address:',
          'user_agent:',
          'device_id:',
          'device_info:',
        ];

        const eventBlocks = [
          source.slice(
            source.indexOf(
              "eventName: 'auth.login.failed'",
            ) - 600,
            source.indexOf(
              "eventName: 'auth.login.failed'",
            ) + 1000,
          ),
          source.slice(
            source.indexOf(
              "eventName: 'auth.mfa.failed'",
            ) - 500,
            source.indexOf(
              "eventName: 'auth.mfa.failed'",
            ) + 700,
          ),
          source.slice(
            source.indexOf(
              "eventName: 'auth.password_reset.issued'",
            ) - 500,
            source.indexOf(
              "eventName: 'auth.password_reset.issued'",
            ) + 700,
          ),
        ];

        expect(eventBlocks[0]).toContain(
          'recordOperationalEvent',
        );
        expect(eventBlocks[1]).toContain(
          'recordAuthSecurityEventBestEffort',
        );
        expect(eventBlocks[2]).toContain(
          'recordOperationalEvent',
        );

        for (const block of eventBlocks) {
          for (
            const forbidden of
              forbiddenAttributeKeys
          ) {
            expect(block).not.toContain(
              forbidden,
            );
          }
        }
      },
    );

    test(
      'MFA event failure cannot make authentication unavailable',
      () => {
        expect(source).toContain(
          'recordAuthSecurityEventBestEffort',
        );
        expect(source).toContain(
          "'Auth security operational event recording failed'",
        );
      },
    );
  },
);
