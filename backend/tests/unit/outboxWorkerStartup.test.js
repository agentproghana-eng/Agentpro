const fs = require('fs');
const path = require('path');

describe(
  'production transactional outbox worker startup',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../server.js'
        ),
        'utf8'
      );

    test(
      'starts the outbox worker only through the production startup path',
      () => {
        expect(source)
          .toContain(
            "process.env.NODE_ENV === 'production'"
          );

        expect(source)
          .toContain(
            "process.env.OUTBOX_WORKER_ENABLED !== 'false'"
          );

        expect(source)
          .toContain(
            "require('./src/services/outboxWorker')"
          );

        expect(source)
          .toContain(
            "require('./src/services/outboxDispatcher')"
          );

        expect(source)
          .toContain(
            'startOutboxWorker({'
          );

        expect(source)
          .toContain(
            'dispatchEvent: dispatchOutboxEvent'
          );
      }
    );

    test(
      'initializes Firebase before starting the outbox worker',
      () => {
        const firebase =
          source.indexOf(
            'initFirebase();'
          );

        const worker =
          source.indexOf(
            'startOutboxWorker({'
          );

        expect(firebase)
          .toBeGreaterThanOrEqual(0);

        expect(worker)
          .toBeGreaterThan(firebase);
      }
    );

    test(
      'keeps scheduler startup after outbox worker startup',
      () => {
        const worker =
          source.indexOf(
            'startOutboxWorker({'
          );

        const scheduler =
          source.indexOf(
            'startScheduler();'
          );

        expect(worker)
          .toBeGreaterThanOrEqual(0);

        expect(scheduler)
          .toBeGreaterThan(worker);
      }
    );

    test(
      'does not expose an HTTP route for worker execution',
      () => {
        expect(source)
          .not.toMatch(
            /app\.(get|post|put|patch|delete)\([^)]*outbox/i
          );
      }
    );
  }
);
