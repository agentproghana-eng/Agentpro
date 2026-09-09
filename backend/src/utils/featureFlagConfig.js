'use strict';

const MAX_DISABLED_TRANSACTION_TYPES = 200;
const FEATURE_KEY_PATTERN = /^[a-z0-9_]+:[a-z0-9_]+$/;

function parseDisabledTransactionTypes(rawValue) {
  let parsed;

  try {
    parsed =
      typeof rawValue === 'string'
        ? JSON.parse(rawValue)
        : rawValue;
  } catch (_) {
    const error = new Error(
      'disabled_transaction_types must be valid JSON',
    );
    error.code = 'INVALID_FEATURE_FLAG_CONFIG';
    throw error;
  }

  if (!Array.isArray(parsed)) {
    const error = new Error(
      'disabled_transaction_types must be a JSON array',
    );
    error.code = 'INVALID_FEATURE_FLAG_CONFIG';
    throw error;
  }

  if (parsed.length > MAX_DISABLED_TRANSACTION_TYPES) {
    const error = new Error(
      `disabled_transaction_types cannot contain more than ${MAX_DISABLED_TRANSACTION_TYPES} entries`,
    );
    error.code = 'INVALID_FEATURE_FLAG_CONFIG';
    throw error;
  }

  const normalized = [];

  for (const value of parsed) {
    if (typeof value !== 'string') {
      const error = new Error(
        'Every disabled transaction type must be a string',
      );
      error.code = 'INVALID_FEATURE_FLAG_CONFIG';
      throw error;
    }

    const key = value.trim().toLowerCase();

    if (
      key.length === 0 ||
      key.length > 100 ||
      !FEATURE_KEY_PATTERN.test(key)
    ) {
      const error = new Error(
        `Invalid disabled transaction key: ${value}`,
      );
      error.code = 'INVALID_FEATURE_FLAG_CONFIG';
      throw error;
    }

    if (!normalized.includes(key)) {
      normalized.push(key);
    }
  }

  return normalized;
}

function serializeDisabledTransactionTypes(rawValue) {
  return JSON.stringify(
    parseDisabledTransactionTypes(rawValue),
  );
}

module.exports = {
  parseDisabledTransactionTypes,
  serializeDisabledTransactionTypes,
};
