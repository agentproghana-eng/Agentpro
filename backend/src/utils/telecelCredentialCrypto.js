'use strict';

const crypto = require('crypto');

const AAD_PREFIX =
  'agentpro:telecel:protected-credential:v1';

function configurationError() {
  const error = new Error(
    'Telecel credential encryption is not configured',
  );

  error.code =
    'TELECEL_CREDENTIAL_ENCRYPTION_KEY_REQUIRED';

  return error;
}

function getEncryptionKey() {
  const raw = String(
    process.env.TELECEL_CREDENTIAL_ENCRYPTION_KEY || '',
  ).trim();

  if (!raw) {
    throw configurationError();
  }

  const key = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw configurationError();
  }

  return key;
}

function assertTelecelCredentialEncryptionConfigured() {
  getEncryptionKey();
  return true;
}

function aadFor({
  userId,
  simRole,
  credentialType,
}) {
  const normalizedRole =
    String(simRole || '').trim().toLowerCase();

  const normalizedType =
    String(credentialType || '').trim().toLowerCase();

  if (!userId) {
    throw new Error('Telecel credential userId is required');
  }

  if (!['agent', 'merchant'].includes(normalizedRole)) {
    throw new Error('Invalid Telecel credential SIM role');
  }

  if (
    ![
      'operator_id',
      'organisation_shortcode',
    ].includes(normalizedType)
  ) {
    throw new Error('Invalid Telecel credential type');
  }

  return Buffer.from(
    [
      AAD_PREFIX,
      String(userId),
      normalizedRole,
      normalizedType,
    ].join(':'),
    'utf8',
  );
}

function encryptTelecelCredential(
  plaintextValue,
  context,
) {
  const plaintext = Buffer.from(
    String(plaintextValue || '').trim(),
    'utf8',
  );

  if (plaintext.length === 0) {
    throw new Error(
      'Telecel credential value is required',
    );
  }

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv,
  );

  cipher.setAAD(aadFor(context));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join(':');
}

function decryptTelecelCredential(
  encryptedValue,
  context,
) {
  const parts =
    String(encryptedValue || '').split(':');

  if (
    parts.length !== 4 ||
    parts[0] !== 'v1'
  ) {
    throw new Error(
      'Unsupported Telecel credential format',
    );
  }

  const [, ivRaw, dataRaw, tagRaw] = parts;

  const iv = Buffer.from(ivRaw, 'base64url');
  const ciphertext =
    Buffer.from(dataRaw, 'base64url');
  const tag = Buffer.from(tagRaw, 'base64url');

  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    ciphertext.length === 0
  ) {
    throw new Error(
      'Invalid Telecel credential payload',
    );
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv,
  );

  decipher.setAAD(aadFor(context));
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  assertTelecelCredentialEncryptionConfigured,
  encryptTelecelCredential,
  decryptTelecelCredential,
};
