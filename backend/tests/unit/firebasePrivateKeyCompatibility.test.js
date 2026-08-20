'use strict';

const {
  normalizePrivateKey,
} = require('../../src/config/firebase');

describe(
  'Firebase private-key compatibility',
  () => {
    const rawKey = [
      '-----BEGIN PRIVATE KEY-----',
      'synthetic-key-body',
      '-----END PRIVATE KEY-----',
    ].join('\n');

    test(
      'preserves a raw PEM private key',
      () => {
        expect(
          normalizePrivateKey(rawKey)
        ).toBe(rawKey);
      }
    );

    test(
      'normalizes escaped PEM newlines',
      () => {
        const escaped =
          rawKey.replace(
            /\n/g,
            '\\n'
          );

        expect(
          normalizePrivateKey(escaped)
        ).toBe(rawKey);
      }
    );

    test(
      'unwraps a JSON-string PEM',
      () => {
        expect(
          normalizePrivateKey(
            JSON.stringify(rawKey)
          )
        ).toBe(rawKey);
      }
    );

    test(
      'normalizes JSON-string escaped newlines',
      () => {
        const escaped =
          rawKey.replace(
            /\n/g,
            '\\n'
          );

        expect(
          normalizePrivateKey(
            JSON.stringify(escaped)
          )
        ).toBe(rawKey);
      }
    );
  }
);
