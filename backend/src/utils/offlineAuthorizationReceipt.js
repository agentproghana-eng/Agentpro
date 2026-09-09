const crypto = require('crypto');

const RECEIPT_VERSION = 1;
const RECEIPT_PREFIX = 'apr1';
const SIGNING_CONTEXT =
  'agentpro-offline-authorization-receipt:v1:';

const MIN_SECRET_LENGTH = 32;
const MAX_ALLOWED_OPERATIONS = 200;
const MAX_OPERATION_LENGTH = 100;

const OPERATION_PATTERN =
  /^[a-z0-9_]+:[a-z0-9_]+$/;

const SHA256_HEX_PATTERN =
  /^[a-f0-9]{64}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class OfflineAuthorizationReceiptError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OfflineAuthorizationReceiptError';
    this.code = code;
  }
}

function receiptError(message, code) {
  return new OfflineAuthorizationReceiptError(
    message,
    code
  );
}

function configuredSecret() {
  return String(
    process.env.AGENTPRO_OFFLINE_RECEIPT_SECRET ||
      ''
  ).trim();
}

function resolveStrongSecret(secret) {
  const resolved = String(
    secret === undefined
      ? configuredSecret()
      : secret
  ).trim();

  if (resolved.length < MIN_SECRET_LENGTH) {
    throw receiptError(
      'Offline authorization receipt signing secret is not configured securely.',
      'OFFLINE_RECEIPT_SECRET_INVALID'
    );
  }

  return resolved;
}

function normalizeRequiredString(
  value,
  field,
  { maxLength = 200 } = {}
) {
  const normalized = String(
    value === null || value === undefined
      ? ''
      : value
  ).trim();

  if (
    normalized.length === 0 ||
    normalized.length > maxLength
  ) {
    throw receiptError(
      `Invalid offline receipt field: ${field}`,
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  return normalized;
}

function normalizeUuid(value, field) {
  const normalized =
    normalizeRequiredString(
      value,
      field,
      { maxLength: 64 }
    ).toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw receiptError(
      `Invalid offline receipt UUID field: ${field}`,
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  return normalized;
}

function normalizeMode(value) {
  const mode =
    normalizeRequiredString(
      value,
      'mode',
      { maxLength: 20 }
    ).toLowerCase();

  if (
    mode !== 'business' &&
    mode !== 'personal'
  ) {
    throw receiptError(
      'Offline receipt mode must be business or personal.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  return mode;
}

function normalizeIsoDate(value, field) {
  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw receiptError(
      `Invalid offline receipt date: ${field}`,
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  return parsed.toISOString();
}

function normalizeAllowedOperations(values) {
  if (
    !Array.isArray(values) ||
    values.length > MAX_ALLOWED_OPERATIONS
  ) {
    throw receiptError(
      'Invalid offline receipt allowed operation list.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  const normalized = new Set();

  for (const value of values) {
    if (typeof value !== 'string') {
      throw receiptError(
        'Offline receipt operations must be strings.',
        'OFFLINE_RECEIPT_CLAIMS_INVALID'
      );
    }

    const operation =
      value.trim().toLowerCase();

    if (
      operation.length === 0 ||
      operation.length >
        MAX_OPERATION_LENGTH ||
      !OPERATION_PATTERN.test(operation)
    ) {
      throw receiptError(
        'Invalid offline receipt operation.',
        'OFFLINE_RECEIPT_CLAIMS_INVALID'
      );
    }

    normalized.add(operation);
  }

  return [...normalized].sort();
}

function normalizeClaims(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw receiptError(
      'Offline receipt claims must be an object.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  const mode = normalizeMode(input.mode);

  const issuedAt =
    normalizeIsoDate(
      input.issued_at,
      'issued_at'
    );

  const authorizedUntil =
    normalizeIsoDate(
      input.authorized_until,
      'authorized_until'
    );

  if (
    new Date(authorizedUntil) <=
    new Date(issuedAt)
  ) {
    throw receiptError(
      'Offline receipt authorization must expire after issuance.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  const companyId =
    input.company_id === null ||
    input.company_id === undefined ||
    String(input.company_id).trim() === ''
      ? null
      : normalizeRequiredString(
          input.company_id,
          'company_id',
          { maxLength: 200 }
        );

  if (
    mode === 'business' &&
    companyId === null
  ) {
    throw receiptError(
      'Business offline receipts require company_id.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  if (
    mode === 'personal' &&
    companyId !== null
  ) {
    throw receiptError(
      'Personal offline receipts must not contain company_id.',
      'OFFLINE_RECEIPT_CLAIMS_INVALID'
    );
  }

  const personalPaid =
    mode === 'personal' &&
    input.personal_paid === true;

  let personalPaidUntil = null;

  if (personalPaid) {
    if (
      input.personal_paid_until === null ||
      input.personal_paid_until === undefined
    ) {
      throw receiptError(
        'Paid Personal offline receipts require personal_paid_until.',
        'OFFLINE_RECEIPT_CLAIMS_INVALID'
      );
    }

    personalPaidUntil =
      normalizeIsoDate(
        input.personal_paid_until,
        'personal_paid_until'
      );

    if (
      new Date(personalPaidUntil) <=
        new Date(issuedAt) ||
      new Date(personalPaidUntil) >
        new Date(authorizedUntil)
    ) {
      throw receiptError(
        'Personal paid authorization must be within the receipt lifetime.',
        'OFFLINE_RECEIPT_CLAIMS_INVALID'
      );
    }
  }

  return {
    version: RECEIPT_VERSION,
    receipt_id: normalizeUuid(
      input.receipt_id,
      'receipt_id'
    ),
    user_id: normalizeRequiredString(
      input.user_id,
      'user_id'
    ),
    company_id: companyId,
    session_id: normalizeRequiredString(
      input.session_id,
      'session_id'
    ),
    mode,
    issued_at: issuedAt,
    authorized_until: authorizedUntil,
    allowed_operations:
      normalizeAllowedOperations(
        input.allowed_operations
      ),
    feature_flag_version:
      normalizeRequiredString(
        input.feature_flag_version,
        'feature_flag_version',
        { maxLength: 128 }
      ),
    personal_paid: personalPaid,
    personal_paid_until:
      personalPaidUntil,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(
    value,
    'utf8'
  ).toString('base64url');
}

function base64UrlDecode(value) {
  try {
    return Buffer.from(
      value,
      'base64url'
    ).toString('utf8');
  } catch (_) {
    throw receiptError(
      'Offline authorization receipt payload is malformed.',
      'OFFLINE_RECEIPT_MALFORMED'
    );
  }
}

function signPayload(payloadSegment, secret) {
  return crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      `${SIGNING_CONTEXT}${payloadSegment}`
    )
    .digest('hex');
}

function safeSignatureEqual(
  supplied,
  expected
) {
  if (
    !SHA256_HEX_PATTERN.test(supplied) ||
    !SHA256_HEX_PATTERN.test(expected)
  ) {
    return false;
  }

  const left =
    Buffer.from(supplied, 'hex');

  const right =
    Buffer.from(expected, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    left,
    right
  );
}

function issueOfflineAuthorizationReceipt({
  userId,
  companyId = null,
  sessionId,
  mode,
  issuedAt = new Date(),
  authorizedUntil,
  allowedOperations,
  featureFlagVersion,
  personalPaid = false,
  personalPaidUntil = null,
  receiptId = crypto.randomUUID(),
  secret,
}) {
  const resolvedSecret =
    resolveStrongSecret(secret);

  const claims = normalizeClaims({
    receipt_id: receiptId,
    user_id: userId,
    company_id: companyId,
    session_id: sessionId,
    mode,
    issued_at: issuedAt,
    authorized_until: authorizedUntil,
    allowed_operations:
      allowedOperations,
    feature_flag_version:
      featureFlagVersion,
    personal_paid: personalPaid,
    personal_paid_until:
      personalPaidUntil,
  });

  const payloadSegment =
    base64UrlEncode(
      JSON.stringify(claims)
    );

  const signature =
    signPayload(
      payloadSegment,
      resolvedSecret
    );

  return {
    token:
      `${RECEIPT_PREFIX}.` +
      `${payloadSegment}.` +
      signature,
    claims,
  };
}

function verifyOfflineAuthorizationReceipt(
  token,
  {
    secret,
    expectedUserId = null,
    expectedCompanyId = undefined,
    expectedSessionId = null,
    expectedMode = null,
    requiredOperation = null,
    now = new Date(),
  } = {}
) {
  const resolvedSecret =
    resolveStrongSecret(secret);

  const normalizedToken =
    String(token || '').trim();

  const parts =
    normalizedToken.split('.');

  if (
    parts.length !== 3 ||
    parts[0] !== RECEIPT_PREFIX
  ) {
    throw receiptError(
      'Offline authorization receipt is malformed.',
      'OFFLINE_RECEIPT_MALFORMED'
    );
  }

  const payloadSegment = parts[1];
  const suppliedSignature =
    parts[2].toLowerCase();

  const expectedSignature =
    signPayload(
      payloadSegment,
      resolvedSecret
    );

  if (
    !safeSignatureEqual(
      suppliedSignature,
      expectedSignature
    )
  ) {
    throw receiptError(
      'Offline authorization receipt signature is invalid.',
      'OFFLINE_RECEIPT_SIGNATURE_INVALID'
    );
  }

  let decoded;

  try {
    decoded =
      JSON.parse(
        base64UrlDecode(
          payloadSegment
        )
      );
  } catch (error) {
    if (
      error instanceof
      OfflineAuthorizationReceiptError
    ) {
      throw error;
    }

    throw receiptError(
      'Offline authorization receipt payload is malformed.',
      'OFFLINE_RECEIPT_MALFORMED'
    );
  }

  const claims =
    normalizeClaims(decoded);

  if (
    decoded.version !==
    RECEIPT_VERSION
  ) {
    throw receiptError(
      'Offline authorization receipt version is unsupported.',
      'OFFLINE_RECEIPT_VERSION_UNSUPPORTED'
    );
  }

  const verificationTime =
    now instanceof Date
      ? now
      : new Date(now);

  if (
    Number.isNaN(
      verificationTime.getTime()
    )
  ) {
    throw receiptError(
      'Offline receipt verification time is invalid.',
      'OFFLINE_RECEIPT_VERIFICATION_INVALID'
    );
  }

  if (
    verificationTime <
      new Date(claims.issued_at) ||
    verificationTime >=
      new Date(
        claims.authorized_until
      )
  ) {
    throw receiptError(
      'Offline authorization receipt is outside its valid time window.',
      'OFFLINE_RECEIPT_EXPIRED'
    );
  }

  if (
    expectedUserId !== null &&
    String(expectedUserId) !==
      claims.user_id
  ) {
    throw receiptError(
      'Offline authorization receipt user does not match.',
      'OFFLINE_RECEIPT_IDENTITY_MISMATCH'
    );
  }

  if (
    expectedCompanyId !== undefined
  ) {
    const normalizedExpectedCompany =
      expectedCompanyId === null
        ? null
        : String(
            expectedCompanyId
          ).trim();

    if (
      normalizedExpectedCompany !==
      claims.company_id
    ) {
      throw receiptError(
        'Offline authorization receipt company does not match.',
        'OFFLINE_RECEIPT_IDENTITY_MISMATCH'
      );
    }
  }

  if (
    expectedSessionId !== null &&
    String(expectedSessionId) !==
      claims.session_id
  ) {
    throw receiptError(
      'Offline authorization receipt session does not match.',
      'OFFLINE_RECEIPT_IDENTITY_MISMATCH'
    );
  }

  if (
    expectedMode !== null &&
    String(expectedMode)
      .trim()
      .toLowerCase() !==
      claims.mode
  ) {
    throw receiptError(
      'Offline authorization receipt mode does not match.',
      'OFFLINE_RECEIPT_IDENTITY_MISMATCH'
    );
  }

  if (requiredOperation !== null) {
    const operation =
      String(requiredOperation)
        .trim()
        .toLowerCase();

    if (
      !OPERATION_PATTERN.test(
        operation
      ) ||
      !claims.allowed_operations.includes(
        operation
      )
    ) {
      throw receiptError(
        'Offline authorization receipt does not authorize this operation.',
        'OFFLINE_RECEIPT_OPERATION_NOT_ALLOWED'
      );
    }
  }

  return claims;
}

module.exports = {
  RECEIPT_VERSION,
  OfflineAuthorizationReceiptError,
  issueOfflineAuthorizationReceipt,
  verifyOfflineAuthorizationReceipt,
};
