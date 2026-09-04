"use strict";

const MIN_JWT_SECRET_LENGTH = 64;

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
