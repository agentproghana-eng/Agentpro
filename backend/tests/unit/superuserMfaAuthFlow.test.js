'use strict';

jest.mock(
  '../../src/config/database',
  () => ({
    query: jest.fn(),
    withTransaction:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/config/redis',
  () => ({
    blacklistToken:
      jest.fn(),
    isTokenBlacklisted:
      jest.fn(),
  }),
);

jest.mock(
  'bcryptjs',
  () => ({
    compare: jest.fn(),
    hash: jest.fn(),
  }),
);

jest.mock(
  'jsonwebtoken',
  () => ({
    sign: jest.fn(),
    verify: jest.fn(),
    decode: jest.fn(),
  }),
);

jest.mock(
  'uuid',
  () => ({
    v4: jest.fn(
      () => 'test-jti',
    ),
  }),
);

jest.mock(
  '../../src/services/auditService',
  () => ({
    auditLog: jest.fn(),
  }),
);

jest.mock(
  '../../src/services/emailService',
  () => ({
    sendPasswordResetEmail:
      jest.fn(),
    sendWelcomeEmail:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/services/smsService',
  () => ({
    sendPasswordResetSMS:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }),
);

jest.mock(
  '../../src/utils/totp',
  () => ({
    generateTotpSecret:
      jest.fn(),
    findMatchingTotpCounter:
      jest.fn(),
    buildOtpAuthUri:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/utils/mfaCrypto',
  () => ({
    assertMfaEncryptionConfigured:
      jest.fn(),
    encryptTotpSecret:
      jest.fn(),
    decryptTotpSecret:
      jest.fn(),
    generateRecoveryCodes:
      jest.fn(),
    hashRecoveryCodes:
      jest.fn(),
    findRecoveryCodeIndex:
      jest.fn(),
  }),
);

jest.mock(
  '../../src/services/mfaChallengeService',
  () => ({
    createMfaChallenge:
      jest.fn(),
    getMfaChallenge:
      jest.fn(),
    recordMfaFailure:
      jest.fn(),
    consumeMfaChallenge:
      jest.fn(),
  }),
);

const bcrypt =
  require('bcryptjs');

const jwt =
  require('jsonwebtoken');

const {
  query,
  withTransaction,
} = require(
  '../../src/config/database'
);

const {
  auditLog,
} = require(
  '../../src/services/auditService'
);

const {
  generateTotpSecret,
  findMatchingTotpCounter,
  buildOtpAuthUri,
} = require(
  '../../src/utils/totp'
);

const {
  assertMfaEncryptionConfigured,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCodes,
  findRecoveryCodeIndex,
} = require(
  '../../src/utils/mfaCrypto'
);

const {
  createMfaChallenge,
  getMfaChallenge,
  recordMfaFailure,
  consumeMfaChallenge,
} = require(
  '../../src/services/mfaChallengeService'
);

const authController =
  require(
    '../../src/controllers/authController'
  );

function response() {
  return {
    status:
      jest.fn()
        .mockReturnThis(),
    json: jest.fn(),
  };
}

function request(body) {
  return {
    body,
    ip: '127.0.0.1',
    requestId:
      'request-id',
    headers: {
      'user-agent':
        'test-agent',
    },
  };
}

function superuser(
  overrides = {},
) {
  return {
    id: 'user-1',
    company_id: null,
    role: 'superuser',
    first_name: 'Admin',
    last_name: 'User',
    email:
      'admin@example.com',
    phone: null,
    password_hash:
      'password-hash',
    status: 'active',
    locked_until: null,
    mfa_enabled: false,
    mfa_enabled_at: null,
    mfa_totp_secret_enc:
      null,
    mfa_recovery_code_hashes:
      [],
    mfa_last_totp_counter:
      null,
    profile_image_url: null,
    telecel_operator_id: null,
    must_change_password:
      false,
    ...overrides,
  };
}

describe(
  'superuser MFA authentication flow',
  () => {
    let client;

    beforeEach(() => {
      jest.clearAllMocks();

      process.env
        .JWT_ACCESS_SECRET =
        'access-secret';

      process.env
        .JWT_REFRESH_SECRET =
        'refresh-secret';

      process.env
        .JWT_REFRESH_EXPIRES_IN =
        '30d';

      client = {
        query: jest.fn(),
      };

      withTransaction
        .mockImplementation(
          async (callback) =>
            callback(client),
        );

      bcrypt.compare
        .mockResolvedValue(true);

      bcrypt.hash
        .mockResolvedValue(
          'refresh-hash',
        );

      jwt.sign
        .mockImplementation(
          (payload) =>
            payload.type ===
            'refresh'
              ? 'refresh-token'
              : 'access-token',
        );

      assertMfaEncryptionConfigured
        .mockReturnValue(true);

      generateTotpSecret
        .mockReturnValue(
          'BASE32SECRET',
        );

      encryptTotpSecret
        .mockReturnValue(
          'encrypted-secret',
        );

      decryptTotpSecret
        .mockReturnValue(
          'BASE32SECRET',
        );

      buildOtpAuthUri
        .mockReturnValue(
          'otpauth://totp/test',
        );

      createMfaChallenge
        .mockResolvedValue(
          'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
        );

      findMatchingTotpCounter
        .mockReturnValue(
          1234567n,
        );

      generateRecoveryCodes
        .mockReturnValue([
          'AAAA-BBBB-CCCC-DDDD',
          'EEEE-FFFF-GGGG-HHHH',
        ]);

      hashRecoveryCodes
        .mockReturnValue([
          'a'.repeat(64),
          'b'.repeat(64),
        ]);

      findRecoveryCodeIndex
        .mockReturnValue(-1);

      recordMfaFailure
        .mockResolvedValue({
          attempts: 1,
          locked: false,
          remaining: 4,
        });

      auditLog
        .mockResolvedValue();

      consumeMfaChallenge
        .mockImplementation(
          async () =>
            getMfaChallenge
              .mock.results[0]
              ?.value ||
            null,
        );
    });

    test(
      'unenrolled superuser receives enrollment challenge before any durable session is created',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            superuser(),
          ],
        });

        const req =
          request({
            email:
              'admin@example.com',
            password:
              'Password1',
          });

        const res =
          response();

        await authController.login(
          req,
          res,
        );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          202,
        );

        expect(
          createMfaChallenge,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            purpose: 'enroll',
            secret:
              'encrypted-secret',
          }),
        );

        const payload =
          res.json.mock.calls[0][0];

        expect(payload.code).toBe(
          'MFA_ENROLLMENT_REQUIRED',
        );

        expect(
          payload.data
            .enrollment.secret,
        ).toBe(
          'BASE32SECRET',
        );

        expect(
          payload.data
            .access_token,
        ).toBeUndefined();

        expect(
          payload.data
            .refresh_token,
        ).toBeUndefined();

        expect(
          query.mock.calls.some(
            ([sql]) =>
              String(sql).includes(
                'INSERT INTO refresh_tokens',
              ),
          ),
        ).toBe(false);
        expect(
          auditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'MFA_ENROLLMENT_STARTED',
            userId: 'user-1',
          }),
        );

      },
    );

    test(
      'enrolled superuser receives verification challenge before session issuance',
      async () => {
        query.mockResolvedValueOnce({
          rows: [
            superuser({
              mfa_enabled: true,
              mfa_totp_secret_enc:
                'encrypted-secret',
            }),
          ],
        });

        const res =
          response();

        await authController.login(
          request({
            email:
              'admin@example.com',
            password:
              'Password1',
          }),
          res,
        );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          202,
        );

        expect(
          createMfaChallenge,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            purpose: 'verify',
          }),
        );

        expect(
          query.mock.calls.some(
            ([sql]) =>
              String(sql).includes(
                'INSERT INTO refresh_tokens',
              ),
          ),
        ).toBe(false);
      },
    );

    test(
      'valid TOTP consumes challenge before issuing durable session',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'verify',
          secret: null,
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        consumeMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        client.query
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM users'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    superuser({
                      mfa_enabled:
                        true,
                      mfa_totp_secret_enc:
                        'encrypted-secret',
                    }),
                  ],
                };
              }

              if (
                text.includes(
                  'UPDATE refresh_tokens'
                ) &&
                text.includes(
                  'SET revoked_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'SET mfa_last_totp_counter'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'INSERT INTO refresh_tokens'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        'session-1',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'SET last_login_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`,
              );
            },
          );

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '123456',
            }),
            res,
          );

        expect(
          findMatchingTotpCounter,
        ).toHaveBeenCalledWith(
          'BASE32SECRET',
          '123456',
        );

        const calls =
          client.query.mock.calls
            .map(([sql]) =>
              String(sql),
            );

        const counterIndex =
          calls.findIndex(
            sql =>
              sql.includes(
                'SET mfa_last_totp_counter'
              ),
          );

        const sessionIndex =
          calls.findIndex(
            sql =>
              sql.includes(
                'INSERT INTO refresh_tokens'
              ),
          );

        expect(
          counterIndex,
        ).toBeGreaterThan(-1);

        expect(
          sessionIndex,
        ).toBeGreaterThan(
          counterIndex,
        );

        expect(
          consumeMfaChallenge,
        ).toHaveBeenCalled();

        expect(
          res.json,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data:
              expect.objectContaining({
                access_token:
                  'access-token',
                refresh_token:
                  'refresh-token',
              }),
          }),
        );

        expect(
          client.query.mock.calls
            .some(
              ([sql]) =>
                String(sql)
                  .includes(
                    'INSERT INTO refresh_tokens',
                  ),
            ),
        ).toBe(true);
        expect(
          auditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'MFA_VERIFIED',
            userId: 'user-1',
          }),
        );

      },
    );

    test(
      'invalid TOTP creates no session and consumes an attempt',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'verify',
          secret: null,
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        findMatchingTotpCounter
          .mockReturnValue(null);

        client.query
          .mockResolvedValueOnce({
            rows: [
              superuser({
                mfa_enabled: true,
                mfa_totp_secret_enc:
                  'encrypted-secret',
              }),
            ],
          });

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '000000',
            }),
            res,
          );

        expect(
          recordMfaFailure,
        ).toHaveBeenCalled();

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          401,
        );

        expect(
          consumeMfaChallenge,
        ).not.toHaveBeenCalled();

        expect(
          client.query.mock.calls
            .some(
              ([sql]) =>
                String(sql)
                  .includes(
                    'INSERT INTO refresh_tokens',
                  ),
            ),
        ).toBe(false);
        expect(
          auditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'MFA_VERIFICATION_FAILED',
            userId: 'user-1',
          }),
        );

      },
    );

    test(
      'enrollment persists encrypted secret and hashed recovery codes only after verified TOTP',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'enroll',
          secret:
            'encrypted-secret',
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        consumeMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        client.query
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM users'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    superuser(),
                  ],
                };
              }

              if (
                text.includes(
                  'SET mfa_enabled = TRUE'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'UPDATE refresh_tokens'
                ) &&
                text.includes(
                  'SET revoked_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'SET mfa_last_totp_counter'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'INSERT INTO refresh_tokens'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        'session-1',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'SET last_login_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`,
              );
            },
          );

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '123456',
            }),
            res,
          );

        const mfaUpdate =
          client.query.mock.calls
            .find(
              ([sql]) =>
                String(sql)
                  .includes(
                    'SET mfa_enabled = TRUE',
                  ),
            );

        expect(mfaUpdate).toBeTruthy();

        expect(
          mfaUpdate[1][0],
        ).toBe(
          'encrypted-secret',
        );

        expect(
          mfaUpdate[1][1],
        ).toBe(
          JSON.stringify([
            'a'.repeat(64),
            'b'.repeat(64),
          ]),
        );

        expect(
          mfaUpdate[1][2],
        ).toBe(
          '1234567',
        );

        const payload =
          res.json.mock.calls[0][0];

        expect(
          payload.data
            .recovery_codes,
        ).toEqual([
          'AAAA-BBBB-CCCC-DDDD',
          'EEEE-FFFF-GGGG-HHHH',
        ]);

        expect(
          auditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'MFA_ENROLLED',
          }),
        );
      },
    );

    test(
      'recovery code is atomically removed before session issuance',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'verify',
          secret: null,
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        consumeMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        findRecoveryCodeIndex
          .mockReturnValue(0);

        client.query
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM users'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    superuser({
                      mfa_enabled:
                        true,
                      mfa_totp_secret_enc:
                        'encrypted-secret',
                      mfa_recovery_code_hashes:
                        [
                          'a'.repeat(
                            64,
                          ),
                          'b'.repeat(
                            64,
                          ),
                        ],
                    }),
                  ],
                };
              }

              if (
                text.includes(
                  'SET mfa_recovery_code_hashes'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'UPDATE refresh_tokens'
                ) &&
                text.includes(
                  'SET revoked_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'SET mfa_last_totp_counter'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'INSERT INTO refresh_tokens'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        'session-1',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'SET last_login_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`,
              );
            },
          );

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              recovery_code:
                'AAAA-BBBB-CCCC-DDDD',
            }),
            res,
          );

        const calls =
          client.query.mock.calls
            .map(([sql]) =>
              String(sql),
            );

        const recoveryIndex =
          calls.findIndex(
            (sql) =>
              sql.includes(
                'SET mfa_recovery_code_hashes',
              ),
          );

        const sessionIndex =
          calls.findIndex(
            (sql) =>
              sql.includes(
                'INSERT INTO refresh_tokens',
              ),
          );

        expect(
          recoveryIndex,
        ).toBeGreaterThan(-1);

        expect(
          sessionIndex,
        ).toBeGreaterThan(
          recoveryIndex,
        );

        expect(
          auditLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'MFA_RECOVERY_CODE_USED',
          }),
        );
      },
    );

    test(
      'expired challenge never reaches database transaction',
      async () => {
        getMfaChallenge
          .mockResolvedValue(null);

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '123456',
            }),
            res,
          );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          401,
        );

        expect(
          withTransaction,
        ).not.toHaveBeenCalled();
      },
    );
    test(
      'first MFA enrollment revokes every pre-MFA durable session before issuing the verified session',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'enroll',
          secret:
            'encrypted-secret',
          deviceInfo: null,
          fcmToken: null,
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        consumeMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        client.query
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM users'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    superuser(),
                  ],
                };
              }

              if (
                text.includes(
                  'SET mfa_enabled = TRUE'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'UPDATE refresh_tokens'
                ) &&
                text.includes(
                  'SET revoked_at'
                )
              ) {
                return {
                  rowCount: 3,
                };
              }

              if (
                text.includes(
                  'SET mfa_last_totp_counter'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              if (
                text.includes(
                  'INSERT INTO refresh_tokens'
                )
              ) {
                expect(text).toContain(
                  'mfa_verified_at',
                );

                return {
                  rows: [
                    {
                      id:
                        'mfa-session-1',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'SET last_login_at'
                )
              ) {
                return {
                  rowCount: 1,
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`,
              );
            },
          );

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '123456',
            }),
            res,
          );

        const calls =
          client.query.mock.calls
            .map(([sql]) =>
              String(sql),
            );

        const revokeIndex =
          calls.findIndex(
            sql =>
              sql.includes(
                'UPDATE refresh_tokens'
              ) &&
              sql.includes(
                'SET revoked_at'
              ),
          );

        const newSessionIndex =
          calls.findIndex(
            sql =>
              sql.includes(
                'INSERT INTO refresh_tokens'
              ),
          );

        expect(
          revokeIndex,
        ).toBeGreaterThan(-1);

        expect(
          newSessionIndex,
        ).toBeGreaterThan(
          revokeIndex,
        );
      },
    );

    test(
      'pre-MFA superuser refresh credential cannot bypass MFA',
      async () => {
        jwt.verify
          .mockReturnValue({
            id: 'user-1',
            type: 'refresh',
          });

        query
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  'legacy-session',
                token_hash:
                  'refresh-hash',
                mfa_verified_at:
                  null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              superuser({
                mfa_enabled:
                  true,
                mfa_totp_secret_enc:
                  'encrypted-secret',
              }),
            ],
          });

        const res =
          response();

        await authController
          .refreshToken(
            request({
              refresh_token:
                'refresh-token',
            }),
            res,
          );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          401,
        );

        expect(
          res.json,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            code:
              'MFA_REAUTH_REQUIRED',
          }),
        );
      },
    );

    test(
      'same TOTP counter cannot create a second superuser session from another challenge',
      async () => {
        const challenge = {
          version: 1,
          userId: 'user-1',
          purpose: 'verify',
          secret: null,
        };

        getMfaChallenge
          .mockResolvedValue(
            challenge,
          );

        findMatchingTotpCounter
          .mockReturnValue(
            1234567n,
          );

        client.query
          .mockResolvedValueOnce({
            rows: [
              superuser({
                mfa_enabled: true,
                mfa_totp_secret_enc:
                  'encrypted-secret',
                mfa_last_totp_counter:
                  '1234567',
              }),
            ],
          });

        const res =
          response();

        await authController
          .completeMfa(
            request({
              challenge_token:
                'challenge-token-abcdefghijklmnopqrstuvwxyz123456',
              code: '123456',
            }),
            res,
          );

        expect(
          res.status,
        ).toHaveBeenCalledWith(
          401,
        );

        expect(
          recordMfaFailure,
        ).toHaveBeenCalled();

        expect(
          consumeMfaChallenge,
        ).not.toHaveBeenCalled();

        expect(
          client.query.mock.calls
            .some(
              ([sql]) =>
                String(sql).includes(
                  'INSERT INTO refresh_tokens',
                ),
            ),
        ).toBe(false);
      },
    );


  },
);
