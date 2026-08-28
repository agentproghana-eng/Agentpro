'use strict';

const {
  base32Encode,
  base32Decode,
  generateTotp,
  findMatchingTotpCounter,
  verifyTotp,
  buildOtpAuthUri,
} = require('../../src/utils/totp');

describe(
  'RFC 6238 TOTP implementation',
  () => {
    const rfcSecret =
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    test(
      'Base32 round-trips the RFC secret',
      () => {
        const raw =
          Buffer.from(
            '12345678901234567890',
            'ascii',
          );

        expect(
          base32Encode(raw),
        ).toBe(rfcSecret);

        expect(
          base32Decode(
            rfcSecret,
          ).toString('ascii'),
        ).toBe(
          '12345678901234567890',
        );
      },
    );

    test.each([
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ])(
      'matches RFC 6238 SHA1 vector at %s',
      (seconds, expected) => {
        expect(
          generateTotp(
            rfcSecret,
            {
              timestamp:
                seconds * 1000,
              digits: 8,
            },
          ),
        ).toBe(expected);
      },
    );

    test(
      'returns the exact RFC counter matched by a valid authenticator code',
      () => {
        const timestamp =
          1700000000000;

        const token =
          generateTotp(
            rfcSecret,
            {
              timestamp,
            },
          );

        const expectedCounter =
          BigInt(
            Math.floor(
              timestamp /
              1000 /
              30,
            ),
          );

        expect(
          findMatchingTotpCounter(
            rfcSecret,
            token,
            {
              timestamp,
              window: 1,
            },
          ),
        ).toBe(
          expectedCounter,
        );

        expect(
          findMatchingTotpCounter(
            rfcSecret,
            '00000x',
            {
              timestamp,
            },
          ),
        ).toBeNull();
      },
    );

    test(
      'accepts only the bounded clock-skew window',
      () => {
        const timestamp =
          1700000000000;

        const token =
          generateTotp(
            rfcSecret,
            {
              timestamp,
            },
          );

        expect(
          verifyTotp(
            rfcSecret,
            token,
            {
              timestamp,
              window: 1,
            },
          ),
        ).toBe(true);

        expect(
          verifyTotp(
            rfcSecret,
            'abc123',
            {
              timestamp,
            },
          ),
        ).toBe(false);
      },
    );

    test(
      'produces a standard otpauth enrollment URI',
      () => {
        const uri =
          buildOtpAuthUri({
            secret:
              rfcSecret,
            accountName:
              'admin@example.com',
          });

        expect(uri).toContain(
          'otpauth://totp/',
        );

        expect(uri).toContain(
          `secret=${rfcSecret}`,
        );

        expect(uri).toContain(
          'issuer=AgentPro',
        );

        expect(uri).toContain(
          'algorithm=SHA1',
        );

        expect(uri).toContain(
          'digits=6',
        );

        expect(uri).toContain(
          'period=30',
        );
      },
    );
  },
);
