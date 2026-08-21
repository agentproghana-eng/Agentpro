jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
    withTransaction: jest.fn(),
  })
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  })
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: jest.fn(),
  })
);

jest.mock(
  '../../src/services/notificationService',
  () => ({
    sendSubscriptionReminder: jest.fn(),
    sendSubscriptionSuspended: jest.fn(),
    sendAdNotification: jest.fn(),
  })
);

jest.mock(
  '../../src/services/emailService',
  () => ({
    sendSubscriptionReminderEmail:
      jest.fn(),
  })
);

const fs = require('fs');
const path = require('path');

const {
  millisecondsUntilNextUtcTime,
  millisecondsUntilNextUtcHour,
} = require(
  '../../src/jobs/scheduler'
);

describe(
  'scheduler UTC wall-clock timing',
  () => {
    test(
      'targets 08:00 UTC reminders on the same day when still upcoming',
      () => {
        const now =
          new Date(
            '2026-08-21T07:30:00.000Z'
          );

        expect(
          millisecondsUntilNextUtcTime(
            now,
            8,
            0
          )
        ).toBe(
          30 * 60 * 1000
        );
      }
    );

    test(
      'runs immediately when starting exactly on the UTC boundary',
      () => {
        const now =
          new Date(
            '2026-08-21T08:00:00.000Z'
          );

        expect(
          millisecondsUntilNextUtcTime(
            now,
            8,
            0
          )
        ).toBe(0);
      }
    );

    test(
      'rolls a passed daily UTC boundary to the next day',
      () => {
        const now =
          new Date(
            '2026-08-21T08:00:01.000Z'
          );

        const next =
          new Date(
            '2026-08-22T08:00:00.000Z'
          );

        expect(
          millisecondsUntilNextUtcTime(
            now,
            8,
            0
          )
        ).toBe(
          next.getTime() -
          now.getTime()
        );
      }
    );

    test(
      'targets midnight UTC across the day boundary',
      () => {
        const now =
          new Date(
            '2026-08-21T23:59:30.000Z'
          );

        expect(
          millisecondsUntilNextUtcTime(
            now,
            0,
            0
          )
        ).toBe(
          30 * 1000
        );
      }
    );

    test(
      'aligns hourly work to the top of the UTC hour',
      () => {
        const now =
          new Date(
            '2026-08-21T14:15:20.000Z'
          );

        const next =
          new Date(
            '2026-08-21T15:00:00.000Z'
          );

        expect(
          millisecondsUntilNextUtcHour(
            now
          )
        ).toBe(
          next.getTime() -
          now.getTime()
        );
      }
    );

    test(
      'does not use deployment-relative recurring intervals',
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              '../../src/jobs/scheduler.js'
            ),
            'utf8'
          );

        expect(source)
          .not.toContain('setInterval(');

        expect(source)
          .not.toContain(
            "runTracked('daily', runDailyJobs)"
          );

        expect(source)
          .toMatch(
            /scheduleUtcJob\(\s*'reminders',[\s\S]*?millisecondsUntilNextUtcTime\(\s*now,\s*8,\s*0\s*\)/
          );

        expect(source)
          .toMatch(
            /scheduleUtcJob\(\s*'expiry',[\s\S]*?millisecondsUntilNextUtcTime\(\s*now,\s*0,\s*0\s*\)/
          );

        expect(source)
          .toMatch(
            /scheduleUtcJob\(\s*'hourly',\s*millisecondsUntilNextUtcHour/
          );
      }
    );
  }
);
