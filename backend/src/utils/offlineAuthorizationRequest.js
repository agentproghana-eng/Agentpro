const {
  verifyOfflineAuthorizationReceipt,
} = require('./offlineAuthorizationReceipt');

const OPERATION_PATTERN =
  /^[a-z0-9_]+:[a-z0-9_]+$/;

class OfflineAuthorizationRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OfflineAuthorizationRequestError';
    this.code = code;
  }
}

function requestError(message, code) {
  return new OfflineAuthorizationRequestError(
    message,
    code
  );
}

function normalizeMode(value) {
  const mode = String(value || '')
    .trim()
    .toLowerCase();

  if (
    mode !== 'business' &&
    mode !== 'personal'
  ) {
    throw requestError(
      'Offline authorization mode is invalid.',
      'OFFLINE_AUTHORIZATION_MODE_INVALID'
    );
  }

  return mode;
}

function normalizeOperation(
  provider,
  transactionType
) {
  const normalizedProvider =
    String(provider || '')
      .trim()
      .toLowerCase();

  const normalizedType =
    String(transactionType || '')
      .trim()
      .toLowerCase();

  const operation =
    `${normalizedProvider}:${normalizedType}`;

  if (!OPERATION_PATTERN.test(operation)) {
    throw requestError(
      'Offline authorization operation is invalid.',
      'OFFLINE_AUTHORIZATION_OPERATION_INVALID'
    );
  }

  return operation;
}

function verifyOfflineAuthorizationRequest({
  receipt,
  user,
  mode,
  provider,
  transactionType,
  now = new Date(),
  secret,
}) {
  const normalizedMode =
    normalizeMode(mode);

  if (
    !user ||
    typeof user !== 'object'
  ) {
    throw requestError(
      'Authenticated user context is required.',
      'OFFLINE_AUTHORIZATION_IDENTITY_INVALID'
    );
  }

  const userId =
    String(user.id || '').trim();

  const sessionId =
    String(user.session_id || '').trim();

  if (
    userId.length === 0 ||
    sessionId.length === 0
  ) {
    throw requestError(
      'Authenticated session context is incomplete.',
      'OFFLINE_AUTHORIZATION_IDENTITY_INVALID'
    );
  }

  let companyId = null;

  if (normalizedMode === 'business') {
    companyId =
      String(user.company_id || '').trim();

    if (companyId.length === 0) {
      throw requestError(
        'Business identity is required.',
        'OFFLINE_AUTHORIZATION_IDENTITY_INVALID'
      );
    }
  }

  const requiredOperation =
    normalizeOperation(
      provider,
      transactionType
    );

  return verifyOfflineAuthorizationReceipt(
    receipt,
    {
      secret,
      expectedUserId:
        userId,
      expectedCompanyId:
        normalizedMode === 'business'
          ? companyId
          : null,
      expectedSessionId:
        sessionId,
      expectedMode:
        normalizedMode,
      requiredOperation,
      now,
    }
  );
}

module.exports = {
  OfflineAuthorizationRequestError,
  verifyOfflineAuthorizationRequest,
};
