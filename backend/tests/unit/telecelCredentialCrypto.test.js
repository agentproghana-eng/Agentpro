'use strict';

const crypto = require('crypto');

const {
  assertTelecelCredentialEncryptionConfigured,
  encryptTelecelCredential,
  decryptTelecelCredential,
} = require('../../src/utils/telecelCredentialCrypto');

describe('Telecel protected credential crypto', () => {
  const originalKey =
    process.env.TELECEL_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TELECEL_CREDENTIAL_ENCRYPTION_KEY =
      crypto.randomBytes(32).toString('hex');
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env
        .TELECEL_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.TELECEL_CREDENTIAL_ENCRYPTION_KEY =
        originalKey;
    }
  });

  test('requires a dedicated configured key', () => {
    delete process.env
      .TELECEL_CREDENTIAL_ENCRYPTION_KEY;

    expect(
      () =>
        assertTelecelCredentialEncryptionConfigured(),
    ).toThrow(
      'Telecel credential encryption is not configured',
    );
  });

  test('round trips an Agent Operator ID', () => {
    const context = {
      userId: 'user-1',
      simRole: 'agent',
      credentialType: 'operator_id',
    };

    const encrypted =
      encryptTelecelCredential('2372', context);

    expect(encrypted).not.toContain('2372');

    expect(
      decryptTelecelCredential(
        encrypted,
        context,
      ),
    ).toBe('2372');
  });

  test('round trips a Merchant Organisation Shortcode', () => {
    const context = {
      userId: 'user-1',
      simRole: 'merchant',
      credentialType:
        'organisation_shortcode',
    };

    const encrypted =
      encryptTelecelCredential('123456', context);

    expect(encrypted).not.toContain('123456');

    expect(
      decryptTelecelCredential(
        encrypted,
        context,
      ),
    ).toBe('123456');
  });

  test('ciphertext cannot cross SIM roles', () => {
    const encrypted =
      encryptTelecelCredential('2372', {
        userId: 'user-1',
        simRole: 'agent',
        credentialType: 'operator_id',
      });

    expect(() =>
      decryptTelecelCredential(encrypted, {
        userId: 'user-1',
        simRole: 'merchant',
        credentialType: 'operator_id',
      }),
    ).toThrow();
  });

  test('ciphertext cannot cross users', () => {
    const encrypted =
      encryptTelecelCredential('2372', {
        userId: 'user-1',
        simRole: 'agent',
        credentialType: 'operator_id',
      });

    expect(() =>
      decryptTelecelCredential(encrypted, {
        userId: 'user-2',
        simRole: 'agent',
        credentialType: 'operator_id',
      }),
    ).toThrow();
  });

  test('ciphertext cannot cross credential types', () => {
    const encrypted =
      encryptTelecelCredential('2372', {
        userId: 'user-1',
        simRole: 'agent',
        credentialType: 'operator_id',
      });

    expect(() =>
      decryptTelecelCredential(encrypted, {
        userId: 'user-1',
        simRole: 'agent',
        credentialType:
          'organisation_shortcode',
      }),
    ).toThrow();
  });
});
