'use strict';

const crypto = require('crypto');

const BASE32_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(input) {
  const buffer = Buffer.from(input);

  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;

      output += BASE32_ALPHABET[
        (value >>> bits) & 31
      ];

      if (bits === 0) {
        value = 0;
      } else {
        value &= (1 << bits) - 1;
      }
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[
      (value << (5 - bits)) & 31
    ];
  }

  return output;
}

function normalizeBase32Secret(secret) {
  const normalized = String(secret || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/=+$/g, '');

  if (
    !normalized ||
    /[^A-Z2-7]/.test(normalized)
  ) {
    throw new Error(
      'Invalid Base32 authenticator secret',
    );
  }

  return normalized;
}

function base32Decode(secret) {
  const normalized =
    normalizeBase32Secret(secret);

  let bits = 0;
  let value = 0;
  const output = [];

  for (const character of normalized) {
    const index =
      BASE32_ALPHABET.indexOf(character);

    if (index < 0) {
      throw new Error(
        'Invalid Base32 authenticator secret',
      );
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;

      output.push(
        (value >>> bits) & 0xff,
      );

      if (bits === 0) {
        value = 0;
      } else {
        value &= (1 << bits) - 1;
      }
    }
  }

  return Buffer.from(output);
}

function generateTotpSecret(
  byteLength = 20,
) {
  if (
    !Number.isInteger(byteLength) ||
    byteLength < 20 ||
    byteLength > 64
  ) {
    throw new Error(
      'TOTP secret length must be between 20 and 64 bytes',
    );
  }

  return base32Encode(
    crypto.randomBytes(byteLength),
  );
}

function generateHotp(
  secret,
  counter,
  {
    digits = 6,
    algorithm = 'sha1',
  } = {},
) {
  if (
    !Number.isInteger(digits) ||
    digits < 6 ||
    digits > 8
  ) {
    throw new Error(
      'HOTP digits must be between 6 and 8',
    );
  }

  const numericCounter =
    typeof counter === 'bigint'
      ? counter
      : BigInt(counter);

  if (numericCounter < 0n) {
    throw new Error(
      'HOTP counter cannot be negative',
    );
  }

  const counterBuffer =
    Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(
    numericCounter,
  );

  const digest = crypto
    .createHmac(
      algorithm,
      base32Decode(secret),
    )
    .update(counterBuffer)
    .digest();

  const offset =
    digest[digest.length - 1] & 0x0f;

  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const modulo = 10 ** digits;

  return String(binary % modulo)
    .padStart(digits, '0');
}

function generateTotp(
  secret,
  {
    timestamp = Date.now(),
    stepSeconds = 30,
    digits = 6,
  } = {},
) {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new Error(
      'Invalid TOTP timestamp',
    );
  }

  if (
    !Number.isInteger(stepSeconds) ||
    stepSeconds <= 0
  ) {
    throw new Error(
      'Invalid TOTP period',
    );
  }

  const counter = BigInt(
    Math.floor(
      timestamp /
      1000 /
      stepSeconds,
    ),
  );

  return generateHotp(
    secret,
    counter,
    {
      digits,
      algorithm: 'sha1',
    },
  );
}

function findMatchingTotpCounter(
  secret,
  token,
  {
    timestamp = Date.now(),
    stepSeconds = 30,
    digits = 6,
    window = 1,
  } = {},
) {
  const presented =
    String(token || '').trim();

  if (
    !Number.isInteger(digits) ||
    digits < 6 ||
    digits > 8
  ) {
    throw new Error(
      'TOTP digits must be between 6 and 8',
    );
  }

  if (
    !new RegExp(
      `^\\d{${digits}}$`,
    ).test(presented)
  ) {
    return null;
  }

  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new Error(
      'Invalid TOTP timestamp',
    );
  }

  if (
    !Number.isInteger(stepSeconds) ||
    stepSeconds <= 0
  ) {
    throw new Error(
      'Invalid TOTP period',
    );
  }

  if (
    !Number.isInteger(window) ||
    window < 0 ||
    window > 2
  ) {
    throw new Error(
      'Invalid TOTP verification window',
    );
  }

  const baseCounter = BigInt(
    Math.floor(
      timestamp /
      1000 /
      stepSeconds,
    ),
  );

  const presentedBuffer =
    Buffer.from(presented);

  const offsets = [0];

  for (
    let distance = 1;
    distance <= window;
    distance += 1
  ) {
    offsets.push(
      -distance,
      distance,
    );
  }

  for (const offset of offsets) {
    const candidateCounter =
      baseCounter +
      BigInt(offset);

    if (candidateCounter < 0n) {
      continue;
    }

    const expected =
      generateHotp(
        secret,
        candidateCounter,
        {
          digits,
          algorithm: 'sha1',
        },
      );

    const expectedBuffer =
      Buffer.from(expected);

    if (
      expectedBuffer.length ===
        presentedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        presentedBuffer,
      )
    ) {
      return candidateCounter;
    }
  }

  return null;
}

function verifyTotp(
  secret,
  token,
  options = {},
) {
  return (
    findMatchingTotpCounter(
      secret,
      token,
      options,
    ) !== null
  );
}

function buildOtpAuthUri({
  secret,
  accountName,
  issuer = 'AgentPro',
}) {
  normalizeBase32Secret(secret);

  const account =
    String(accountName || '').trim();

  if (!account) {
    throw new Error(
      'Authenticator account name is required',
    );
  }

  const cleanIssuer =
    String(issuer || '').trim();

  if (!cleanIssuer) {
    throw new Error(
      'Authenticator issuer is required',
    );
  }

  const label = encodeURIComponent(
    `${cleanIssuer}:${account}`,
  );

  return (
    `otpauth://totp/${label}` +
    `?secret=${encodeURIComponent(secret)}` +
    `&issuer=${encodeURIComponent(cleanIssuer)}` +
    '&algorithm=SHA1' +
    '&digits=6' +
    '&period=30'
  );
}

module.exports = {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateHotp,
  generateTotp,
  findMatchingTotpCounter,
  verifyTotp,
  buildOtpAuthUri,
};
