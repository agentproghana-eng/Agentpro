'use strict';

const fs = require('fs');
const path = require('path');

describe(
  'database slow query telemetry contract',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../../src/config/database.js'
        ),
        'utf8'
      );

    test(
      'uses hashed query fingerprints rather than SQL text identity',
      () => {
        expect(source)
          .toContain(
            "createHash('sha256')"
          );

        expect(source)
          .toContain(
            ".slice(0, 16)"
          );

        expect(source)
          .toContain(
            'queryFingerprint'
          );
      }
    );

    test(
      'instruments SQL executed inside transaction callbacks',
      () => {
        expect(source)
          .toContain(
            'instrumentTransactionClient'
          );

        expect(source)
          .toContain(
            'recordDatabaseOperation'
          );

        expect(source)
          .toContain(
            'recordDatabaseTransaction'
          );
      }
    );

    test(
      'bounds production slow query warning volume',
      () => {
        expect(source)
          .toContain(
            'SLOW_QUERY_LOGS_PER_SECOND = 5'
          );

        expect(source)
          .toContain(
            'shouldEmitSlowQueryLog'
          );

        expect(source)
          .toContain(
            'slowQueryLogsThisSecond'
          );
      }
    );

    test(
      'transaction queries do not pollute connection acquisition timing with zero samples',
      () => {
        expect(source)
          .toContain(
            'acquisitionMs: null'
          );

        expect(source)
          .not.toContain(
            'acquisitionMs: 0'
          );
      }
    );

    test(
      'does not log SQL text or query parameters on failures',
      () => {
        expect(source)
          .not.toContain(
            "text,\n        error:"
          );

        expect(source)
          .not.toContain(
            'params:'
          );

        expect(source)
          .not.toContain(
            'text:'
          );

        expect(source)
          .toContain(
            "'Database query failed'"
          );

        expect(source)
          .toContain(
            'fingerprint'
          );
      }
    );
  }
);
