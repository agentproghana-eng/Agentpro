'use strict';

const crypto = require('crypto');

const {
  assertMfaEncryptionConfigured,
  encryptTotpSecret,
  decryptTotpSecret,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  findRecoveryCodeIndex,
} = require('../../src/utils/mfaCrypto');

describe(
  'MFA secret and recovery-code cryptography',
  () => {
    const originalKey =
      process.env.MFA_ENCRYPTION_KEY;

    beforeEach(() => {
      process.env.MFA_ENCRYPTION_KEY =
        crypto
          .randomBytes(32)
          .toString('base64');
    });

    afterAll(() => {
      if (
        originalKey === undefined
      ) {
        delete process.env
          .MFA_ENCRYPTION_KEY;
      } else {
        process.env
          .MFA_ENCRYPTION_KEY =
          originalKey;
      }
    });

    test(
      'requires an explicit 32-byte encryption key',
      () => {
        expect(
          assertMfaEncryptionConfigured(),
        ).toBe(true);

        process.env
          .MFA_ENCRYPTION_KEY =
          'too-short';

        expect(
          () =>
            assertMfaEncryptionConfigured(),
        ).toThrow(
          'MFA encryption is not configured',
        );
      },
    );

    test(
      'AES-256-GCM round-trips without persisting plaintext',
      () => {
        const secret =
          'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

        const encrypted =
          encryptTotpSecret(
            secret,
          );

        expect(
          encrypted,
        ).toMatch(/^v1:/);

        expect(
          encrypted,
        ).not.toContain(
          secret,
        );

        expect(
          decryptTotpSecret(
            encrypted,
          ),
        ).toBe(secret);
      },
    );

    test(
      'authentication fails when ciphertext is tampered',
      () => {
        const encrypted =
          encryptTotpSecret(
            'GEZDGNBVGY3TQOJQ',
          );

        const parts =
          encrypted.split(':');

        const tag =
          Buffer.from(
            parts[3],
            'base64url',
          );

        tag[0] ^= 0x01;

        parts[3] =
          tag.toString(
            'base64url',
          );

        const tampered =
          parts.join(':');

        expect(
          () =>
            decryptTotpSecret(
              tampered,
            ),
        ).toThrow();
      },
    );

    test(
      'recovery codes are high entropy and persisted only as keyed hashes',
      () => {
        const codes =
          generateRecoveryCodes();

        expect(codes).toHaveLength(10);

        expect(
          new Set(codes).size,
        ).toBe(10);

        const hashes =
          hashRecoveryCodes(
            codes,
          );

        expect(hashes).toHaveLength(
          10,
        );

        for (
          let index = 0;
          index < codes.length;
          index += 1
        ) {
          expect(
            hashes[index],
          ).toMatch(
            /^[a-f0-9]{64}$/,
          );

          expect(
            hashes[index],
          ).not.toContain(
            normalizeRecoveryCode(
              codes[index],
            ),
          );
        }

        expect(
          findRecoveryCodeIndex(
            codes[3],
            hashes,
          ),
        ).toBe(3);

        expect(
          findRecoveryCodeIndex(
            'NOT-A-VALID-CODE',
            hashes,
          ),
        ).toBe(-1);
      },
    );
  },
);
