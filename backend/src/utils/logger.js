const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logDir = process.env.LOG_DIR || './logs';
const isProduction = process.env.NODE_ENV === 'production';

const REDACTED = '[REDACTED]';

const SENSITIVE_LOG_KEYS = new Set([
  'password',
  'passcode',
  'pin',
  'token',
  'accesstoken',
  'refreshtoken',
  'fcmtoken',
  'authorization',
  'cookie',
  'cookies',
  'secret',
  'apikey',
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'amount',
  'balance',
  'paymentphone',
  'momoreference',
  'reference',
  'receipturl',
  'body',
  'headers',
  'params',
  'payload',
  'query',
  'sql',
  'text',
  'stack',
  'message',
  'error',
  'detail',
  'details',
  'where',
  'hint',
  'userid',
  'agentid',
  'sellerid',
  'transactionid',
  'conversationid',
  'email',
  'firstname',
  'lastname',
  'fullname',
  'companyname',
  'businessname',
  'branchname',
  'recipient',
  'customerphone',
  'recipientphone',
]);

function normalizeLogKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSensitiveLogKey(key) {
  const normalized = normalizeLogKey(key);

  if (!normalized) return false;

  if (normalized === 'requestid') {
    return false;
  }

  // Direct entity identifiers are private by default. Request IDs are
  // the only ID deliberately retained for operational correlation.
  if (normalized === 'id' || normalized.endsWith('id')) {
    return true;
  }

  return SENSITIVE_LOG_KEYS.has(normalized);
}

function sanitizeRequestPath(value) {
  const rawPath =
    typeof value === 'string' && value.trim()
      ? value.split('?')[0]
      : '/';

  return rawPath
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
      '/:id'
    )
    .replace(
      /\/[a-f0-9]{24}(?=\/|$)/gi,
      '/:id'
    )
    .replace(
      /\/\d+(?=\/|$)/g,
      '/:id'
    );
}

function sanitizeProductionLogText(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
      'Bearer [REDACTED]'
    )
    .replace(
      /\b(password|passcode|pin|token|authorization|cookie|secret|api[_-]?key)\s*[:=]\s*[^,\s;]+/gi,
      '$1=[REDACTED]'
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[REDACTED_EMAIL]'
    )
    .replace(
      /(?:\+?233|0)\d{9}\b/g,
      '[REDACTED_PHONE]'
    )
    .replace(
      /\b(?:GHS|GH₵|GH¢|₵)\s*\d+(?:\.\d+)?\b/gi,
      '[REDACTED_AMOUNT]'
    );
}

function sanitizeError(error) {
  const safe = {
    name: sanitizeProductionLogText(error?.name || 'Error'),
  };

  if (
    typeof error?.code === 'string' ||
    typeof error?.code === 'number'
  ) {
    safe.code = String(error.code).slice(0, 100);
  }

  return safe;
}

function sanitizeProductionLogValue(
  value,
  key = '',
  depth = 0,
  seen = new WeakSet()
) {
  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (key && isSensitiveLogKey(key)) {
    return REDACTED;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeProductionLogText(value);
  }

  if (Buffer.isBuffer(value)) {
    return '[REDACTED_BINARY]';
  }

  if (depth >= 4) {
    return '[TRUNCATED]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) =>
        sanitizeProductionLogValue(
          item,
          '',
          depth + 1,
          seen
        )
      );
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }

    seen.add(value);

    const result = {};

    for (const [childKey, childValue] of Object.entries(value).slice(0, 40)) {
      result[childKey] = sanitizeProductionLogValue(
        childValue,
        childKey,
        depth + 1,
        seen
      );
    }

    seen.delete(value);

    return result;
  }

  return sanitizeProductionLogText(String(value));
}

const baseFormats = [
  winston.format.timestamp(),
];

if (!isProduction) {
  baseFormats.push(
    winston.format.errors({ stack: true })
  );
}

baseFormats.push(
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(...baseFormats),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d'
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d'
    })
  ]
});

if (isProduction) {
  for (const level of [
    'error',
    'warn',
    'info',
    'http',
    'verbose',
    'debug',
    'silly',
  ]) {
    if (typeof logger[level] !== 'function') continue;

    const original = logger[level].bind(logger);

    logger[level] = (...args) => {
      const safeArgs = args.map((arg, index) => {
        if (index === 0 && typeof arg === 'string') {
          return sanitizeProductionLogText(arg);
        }

        return sanitizeProductionLogValue(arg);
      });

      return original(...safeArgs);
    };
  }
}

module.exports = {
  logger,
  sanitizeProductionLogText,
  sanitizeProductionLogValue,
  sanitizeRequestPath,
  isSensitiveLogKey,
};
