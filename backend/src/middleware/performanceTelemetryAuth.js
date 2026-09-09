'use strict';

const crypto = require('crypto');

const TELEMETRY_HEADER =
  'x-agentpro-performance-token';

const MIN_TELEMETRY_TOKEN_LENGTH = 32;

function performanceTelemetryEnabled(
  env = process.env
) {
  return String(
    env.PERFORMANCE_TELEMETRY_ENABLED || ''
  ).toLowerCase() === 'true';
}

function safeTokenEqual(actual, expected) {
  const actualDigest = crypto
    .createHash('sha256')
    .update(String(actual || ''))
    .digest();

  const expectedDigest = crypto
    .createHash('sha256')
    .update(String(expected || ''))
    .digest();

  return crypto.timingSafeEqual(
    actualDigest,
    expectedDigest
  );
}

function performanceTelemetryAuthorized(
  suppliedToken,
  env = process.env
) {
  const configuredToken = String(
    env.PERFORMANCE_TELEMETRY_TOKEN || ''
  );

  if (
    configuredToken.length <
      MIN_TELEMETRY_TOKEN_LENGTH
  ) {
    return false;
  }

  const supplied = String(
    suppliedToken || ''
  );

  if (!supplied) {
    return false;
  }

  return safeTokenEqual(
    supplied,
    configuredToken
  );
}

function requirePerformanceTelemetry(
  req,
  res,
  next
) {
  if (!performanceTelemetryEnabled()) {
    return res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  }

  const suppliedToken =
    req.get(TELEMETRY_HEADER);

  if (
    !performanceTelemetryAuthorized(
      suppliedToken
    )
  ) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  return next();
}

module.exports = {
  TELEMETRY_HEADER,
  MIN_TELEMETRY_TOKEN_LENGTH,
  performanceTelemetryEnabled,
  performanceTelemetryAuthorized,
  requirePerformanceTelemetry,
};
