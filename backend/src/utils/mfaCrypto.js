'use strict';

const crypto = require('crypto');

const MFA_AAD =
  Buffer.from(
    'agentpro:mfa:totp-secret:v1',
    'utf8',
  );

function configurationError() {
  const error = new Error(
    'MFA encryption is not configured',
  );

  error.code =
    'MFA_ENCRYPTION_KEY_REQUIRED';

  return error;
}

function getMfaEncryptionKey() {
  const raw = String(
    process.env.MFA_ENCRYPTION_KEY || '',
  ).trim();

  if (!raw) {
    throw configurationError();
  }

  let key;

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== 32) {
    throw configurationError();
  }

  return key;
}

function assertMfaEncryptionConfigured() {
  getMfaEncryptionKey();
  return true;
}

function encryptTotpSecret(secret) {
  const plaintext =
    Buffer.from(
      String(secret || ''),
      'utf8',
    );

  if (plaintext.length === 0) {
    throw new Error(
      'TOTP secret is required',
    );
  }

  const key =
    getMfaEncryptionKey();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      'aes-256-gcm',
      key,
      iv,
    );

  cipher.setAAD(MFA_AAD);

  const ciphertext =
    Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join(':');
}

function decryptTotpSecret(value) {
  const parts =
    String(value || '').split(':');

  if (
    parts.length !== 4 ||
    parts[0] !== 'v1'
  ) {
    throw new Error(
      'Unsupported MFA secret format',
    );
  }

  const [, ivRaw, dataRaw, tagRaw] =
    parts;

  const iv =
    Buffer.from(ivRaw, 'base64url');

  const ciphertext =
    Buffer.from(dataRaw, 'base64url');

  const tag =
    Buffer.from(tagRaw, 'base64url');

  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    ciphertext.length === 0
  ) {
    throw new Error(
      'Invalid MFA secret payload',
    );
  }

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      getMfaEncryptionKey(),
      iv,
    );

  decipher.setAAD(MFA_AAD);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

function normalizeRecoveryCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateRecoveryCodes(
  count = 10,
) {
  if (
    !Number.isInteger(count) ||
    count < 5 ||
    count > 20
  ) {
    throw new Error(
      'Invalid recovery-code count',
    );
  }

  return Array.from(
    { length: count },
    () => {
      const raw =
        crypto
          .randomBytes(8)
          .toString('hex')
          .toUpperCase();

      return raw.match(/.{1,4}/g)
        .join('-');
    },
  );
}

function hashRecoveryCode(code) {
  const normalized =
    normalizeRecoveryCode(code);

  if (normalized.length < 12) {
    throw new Error(
      'Invalid recovery code',
    );
  }

  return crypto
    .createHmac(
      'sha256',
      getMfaEncryptionKey(),
    )
    .update(
      `agentpro:mfa:recovery:v1:${normalized}`,
      'utf8',
    )
    .digest('hex');
}

function hashRecoveryCodes(codes) {
  return codes.map(
    hashRecoveryCode,
  );
}

function findRecoveryCodeIndex(
  presentedCode,
  storedHashes,
) {
  let expected;

  try {
    expected = Buffer.from(
      hashRecoveryCode(
        presentedCode,
      ),
      'hex',
    );
  } catch (_) {
    return -1;
  }

  if (!Array.isArray(storedHashes)) {
    return -1;
  }

  for (
    let index = 0;
    index < storedHashes.length;
    index += 1
  ) {
    const storedHash =
      storedHashes[index];

    if (
      typeof storedHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(
        storedHash,
      )
    ) {
      continue;
    }

    const candidate =
      Buffer.from(
        storedHash,
        'hex',
      );

    if (
      candidate.length ===
        expected.length &&
      crypto.timingSafeEqual(
        candidate,
        expected,
      )
    ) {
      return index;
    }
  }

  return -1;
}

module.exports = {
  assertMfaEncryptionConfigured,
  encryptTotpSecret,
  decryptTotpSecret,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  hashRecoveryCodes,
  findRecoveryCodeIndex,
};
