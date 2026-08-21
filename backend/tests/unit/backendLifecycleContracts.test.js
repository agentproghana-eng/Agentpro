const fs = require('fs');
const path = require('path');

const read = (relativePath) =>
  fs.readFileSync(
    path.join(
      __dirname,
      '../..',
      relativePath
    ),
    'utf8'
  );

describe(
  'backend graceful lifecycle contracts',
  () => {
    test(
      'scheduler exposes a draining stop handle',
      () => {
        const source =
          read('src/jobs/scheduler.js');

        expect(source)
          .toContain('const timers = new Map()');

        expect(source)
          .toContain('clearTimeout(timer)');

        expect(source)
          .toContain('timers.clear()');

        expect(source)
          .toContain('Promise.allSettled(');

        expect(source)
          .toContain('return async () =>');

        expect(source)
          .toMatch(
            /typeof timer\.unref === ['"]function['"]/
          );
      }
    );

    test(
      'outbox stop waits for an active batch',
      () => {
        const source =
          read(
            'src/services/outboxWorker.js'
          );

        expect(source)
          .toContain('let currentRun = null');

        expect(source)
          .toContain('return async () =>');

        expect(source)
          .toContain('await currentRun');

        expect(source)
          .toContain('clearInterval(timer)');
      }
    );

    test(
      'database and Redis expose explicit close paths',
      () => {
        const database =
          read('src/config/database.js');

        const redis =
          read('src/config/redis.js');

        expect(database)
          .toContain('pool.end()');

        expect(database)
          .toContain('closeDB');

        expect(redis)
          .toContain('closeRedis');

        expect(redis)
          .toContain('await client.quit()');

        expect(redis)
          .toContain('client.disconnect()');
      }
    );

    test(
      'server owns every production lifecycle handle',
      () => {
        const source =
          read('server.js');

        expect(source)
          .toContain(
            'httpServer = app.listen(PORT'
          );

        expect(source)
          .toContain(
            'stopOutboxWorker = startOutboxWorker({'
          );

        expect(source)
          .toContain(
            'stopScheduler = startScheduler();'
          );

        expect(source)
          .toMatch(
            /\[['"]SIGTERM['"], ['"]SIGINT['"]\]/
          );

        expect(source)
          .toContain('process.once(signal');

        expect(source)
          .toContain('httpServer.close(');

        expect(source)
          .toContain(
            'httpServer.closeAllConnections()'
          );

        expect(source)
          .toContain('run: closeRedis');

        expect(source)
          .toContain('run: closeDB');

        expect(source)
          .toContain('SHUTDOWN_TIMEOUT_MS');

        expect(source)
          .toContain(
            'Graceful shutdown deadline exceeded'
          );

        expect(source)
          .not.toContain(
            'deadline.unref()'
          );
      }
    );
  }
);
