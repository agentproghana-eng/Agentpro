'use strict';

const MAX_FORM_FIELDS = 20;
const MAX_FIELD_KEY_LENGTH = 64;
const MAX_FIELD_LABEL_LENGTH = 120;
const MAX_OPTIONS_PER_FIELD = 50;
const MAX_OPTION_VALUE_LENGTH = 120;
const MAX_OPTION_LABEL_LENGTH = 120;
const MAX_INPUT_LENGTH = 500;

const SUPPORTED_FIELD_TYPES = new Set([
  'phone',
  'amount',
  'digits',
  'account_number',
  'selection',
  'text',
  'operator_id',
  'reference',
]);

// These are semantic destinations understood by the installed Flutter
// transaction adapter. A server-controlled schema may choose which of
// these inputs to collect, but it cannot invent request properties.
const SUPPORTED_FIELD_KEYS = new Set([
  'customer_phone',
  'recipient_phone',
  'amount',
  'account_number',
  'merchant_id',
  'reference',
  'operator_id',
]);

const TYPE_BY_KEY = Object.freeze({
  customer_phone: new Set(['phone']),
  recipient_phone: new Set(['phone']),
  amount: new Set(['amount']),
  account_number: new Set([
    'account_number',
    'digits',
    'text',
  ]),
  merchant_id: new Set([
    'digits',
    'text',
  ]),
  reference: new Set([
    'reference',
    'text',
  ]),
  operator_id: new Set([
    'operator_id',
    'digits',
    'text',
  ]),
});

const FORBIDDEN_KEYS = new Set([
  'pin',
  'password',
  'otp',
  'sim_role',
  'sim_role_override',
  'balance',
  'balance_adjustment',
  'commission',
  'posting_policy',
  'ledger_account',
  'ledger_entry',
]);

function validateTransactionFormSchema(rawSchema) {
  if (rawSchema === undefined || rawSchema === null) {
    return null;
  }

  if (!Array.isArray(rawSchema)) {
    return 'form_schema must be a list.';
  }

  if (rawSchema.length > MAX_FORM_FIELDS) {
    return (
      `form_schema cannot contain more than ` +
      `${MAX_FORM_FIELDS} fields.`
    );
  }

  const seenKeys = new Set();

  for (let i = 0; i < rawSchema.length; i++) {
    const field = rawSchema[i];
    const position = i + 1;

    if (
      field === null ||
      Array.isArray(field) ||
      typeof field !== 'object'
    ) {
      return `form_schema field ${position} must be an object.`;
    }

    const key =
      typeof field.key === 'string'
        ? field.key.trim()
        : '';

    if (
      !key ||
      key.length > MAX_FIELD_KEY_LENGTH ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(key)
    ) {
      return (
        `form_schema field ${position} has an invalid key.`
      );
    }

    if (FORBIDDEN_KEYS.has(key)) {
      return (
        `form_schema field "${key}" is forbidden.`
      );
    }

    if (!SUPPORTED_FIELD_KEYS.has(key)) {
      return (
        `form_schema field "${key}" is not supported by ` +
        `the installed transaction client.`
      );
    }

    if (seenKeys.has(key)) {
      return (
        `form_schema contains duplicate field "${key}".`
      );
    }

    seenKeys.add(key);

    const type =
      typeof field.type === 'string'
        ? field.type.trim().toLowerCase()
        : '';

    if (!SUPPORTED_FIELD_TYPES.has(type)) {
      return (
        `form_schema field "${key}" has unsupported type ` +
        `"${type}".`
      );
    }

    const allowedTypes = TYPE_BY_KEY[key];

    if (!allowedTypes || !allowedTypes.has(type)) {
      return (
        `form_schema field "${key}" cannot use type ` +
        `"${type}".`
      );
    }

    const label =
      typeof field.label === 'string'
        ? field.label.trim()
        : '';

    if (!label) {
      return (
        `form_schema field "${key}" requires a label.`
      );
    }

    if (label.length > MAX_FIELD_LABEL_LENGTH) {
      return (
        `form_schema field "${key}" label cannot exceed ` +
        `${MAX_FIELD_LABEL_LENGTH} characters.`
      );
    }

    if (
      field.required !== undefined &&
      typeof field.required !== 'boolean'
    ) {
      return (
        `form_schema field "${key}" required must be boolean.`
      );
    }

    const minError = validateLengthConstraint(
      field.min_length,
      'min_length',
      key,
      0,
    );

    if (minError) {
      return minError;
    }

    const maxError = validateLengthConstraint(
      field.max_length,
      'max_length',
      key,
      1,
    );

    if (maxError) {
      return maxError;
    }

    const minLength =
      field.min_length === undefined ||
      field.min_length === null
        ? null
        : field.min_length;

    const maxLength =
      field.max_length === undefined ||
      field.max_length === null
        ? null
        : field.max_length;

    if (
      minLength !== null &&
      maxLength !== null &&
      minLength > maxLength
    ) {
      return (
        `form_schema field "${key}" min_length cannot ` +
        `exceed max_length.`
      );
    }

    const hasOptions =
      Object.prototype.hasOwnProperty.call(
        field,
        'options',
      );

    if (type === 'selection') {
      if (!hasOptions || !Array.isArray(field.options)) {
        return (
          `form_schema selection field "${key}" ` +
          `requires options.`
        );
      }

      if (field.options.length === 0) {
        return (
          `form_schema selection field "${key}" ` +
          `requires at least one option.`
        );
      }

      if (field.options.length > MAX_OPTIONS_PER_FIELD) {
        return (
          `form_schema selection field "${key}" cannot ` +
          `contain more than ${MAX_OPTIONS_PER_FIELD} options.`
        );
      }

      const seenValues = new Set();

      for (let optionIndex = 0;
        optionIndex < field.options.length;
        optionIndex++
      ) {
        const option = field.options[optionIndex];

        if (
          option === null ||
          Array.isArray(option) ||
          typeof option !== 'object'
        ) {
          return (
            `form_schema selection field "${key}" option ` +
            `${optionIndex + 1} must be an object.`
          );
        }

        const value =
          typeof option.value === 'string'
            ? option.value.trim()
            : '';

        const optionLabel =
          typeof option.label === 'string'
            ? option.label.trim()
            : '';

        if (!value) {
          return (
            `form_schema selection field "${key}" has ` +
            `a blank option value.`
          );
        }

        if (value.length > MAX_OPTION_VALUE_LENGTH) {
          return (
            `form_schema selection field "${key}" option ` +
            `value cannot exceed ` +
            `${MAX_OPTION_VALUE_LENGTH} characters.`
          );
        }

        if (!optionLabel) {
          return (
            `form_schema selection field "${key}" has ` +
            `a blank option label.`
          );
        }

        if (
          optionLabel.length >
          MAX_OPTION_LABEL_LENGTH
        ) {
          return (
            `form_schema selection field "${key}" option ` +
            `label cannot exceed ` +
            `${MAX_OPTION_LABEL_LENGTH} characters.`
          );
        }

        if (seenValues.has(value)) {
          return (
            `form_schema selection field "${key}" contains ` +
            `duplicate option value "${value}".`
          );
        }

        seenValues.add(value);
      }
    } else if (
      hasOptions &&
      (
        !Array.isArray(field.options) ||
        field.options.length > 0
      )
    ) {
      return (
        `Only selection form_schema fields may define options.`
      );
    }
  }

  return null;
}

function validateLengthConstraint(
  value,
  name,
  key,
  minimum,
) {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > MAX_INPUT_LENGTH
  ) {
    return (
      `form_schema field "${key}" ${name} must be an ` +
      `integer between ${minimum} and ${MAX_INPUT_LENGTH}.`
    );
  }

  return null;
}

module.exports = {
  MAX_FORM_FIELDS,
  SUPPORTED_FIELD_TYPES,
  SUPPORTED_FIELD_KEYS,
  FORBIDDEN_KEYS,
  validateTransactionFormSchema,
};
