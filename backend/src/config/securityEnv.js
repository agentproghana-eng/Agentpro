"use strict";

const MIN_JWT_SECRET_LENGTH = 64;

const MIN_PERFORMANCE_TELEMETRY_TOKEN_LENGTH = 32;

function securityConfigurationError(message) {
  const error = new Error(message);
  error.code = "SECURITY_CONFIGURATION_INVALID";
  return error;
}

function requireStrongJwtSecret(env, name) {
  const value = env[name];

  if (typeof value !== "string" || value.length < MIN_JWT_SECRET_LENGTH) {
    throw securityConfigurationError(
      `${name} must be configured with at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }

  if (value.trim() !== value) {
    throw securityConfigurationError(
      `${name} must not contain leading or trailing whitespace`,
    );
  }

  return value;
}

function validateProductionSecurityEnv(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (
    String(
      env.PERFORMANCE_TELEMETRY_ENABLED || ""
    ).toLowerCase() === "true"
  ) {
    const telemetryToken =
      env.PERFORMANCE_TELEMETRY_TOKEN;

    if (
      typeof telemetryToken !== "string" ||
      telemetryToken.length <
        MIN_PERFORMANCE_TELEMETRY_TOKEN_LENGTH
    ) {
      throw securityConfigurationError(
        "PERFORMANCE_TELEMETRY_TOKEN must be configured with at least 32 characters when performance telemetry is enabled",
      );
    }

    if (
      telemetryToken.trim() !== telemetryToken
    ) {
      throw securityConfigurationError(
        "PERFORMANCE_TELEMETRY_TOKEN must not contain leading or trailing whitespace",
      );
    }
  }

  const accessSecret = requireStrongJwtSecret(env, "JWT_ACCESS_SECRET");

  const refreshSecret = requireStrongJwtSecret(env, "JWT_REFRESH_SECRET");

  if (accessSecret === refreshSecret) {
    throw securityConfigurationError(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different",
    );
  }
}

module.exports = {
  MIN_JWT_SECRET_LENGTH,
  validateProductionSecurityEnv,
};
