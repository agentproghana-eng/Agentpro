"use strict";

const {
  MIN_JWT_SECRET_LENGTH,
  validateProductionSecurityEnv,
} = require("../../src/config/securityEnv");

function strongSecret(prefix) {
  return (prefix + "x".repeat(MIN_JWT_SECRET_LENGTH)).slice(
    0,
    MIN_JWT_SECRET_LENGTH,
  );
}

describe("production security environment validation", () => {
  test("does not enforce production JWT requirements outside production", () => {
    expect(() =>
      validateProductionSecurityEnv({
        NODE_ENV: "test",
      }),
    ).not.toThrow();
  });

  test("accepts distinct production JWT secrets at the minimum length", () => {
    expect(() =>
      validateProductionSecurityEnv({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: strongSecret("access-"),
        JWT_REFRESH_SECRET: strongSecret("refresh-"),
      }),
    ).not.toThrow();
  });

  test.each([
    ["JWT_ACCESS_SECRET", undefined],
    ["JWT_ACCESS_SECRET", "short"],
    ["JWT_REFRESH_SECRET", undefined],
    ["JWT_REFRESH_SECRET", "short"],
  ])("fails closed when %s is missing or weak", (name, value) => {
    const env = {
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: strongSecret("access-"),
      JWT_REFRESH_SECRET: strongSecret("refresh-"),
    };

    env[name] = value;

    expect(() => validateProductionSecurityEnv(env)).toThrow(
      expect.objectContaining({
        code: "SECURITY_CONFIGURATION_INVALID",
      }),
    );
  });

  test("rejects identical access and refresh secrets", () => {
    const shared = strongSecret("shared-");

    expect(() =>
      validateProductionSecurityEnv({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: shared,
        JWT_REFRESH_SECRET: shared,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "SECURITY_CONFIGURATION_INVALID",
      }),
    );
  });

  test.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"])(
    "rejects surrounding whitespace in %s",
    (name) => {
      const env = {
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: strongSecret("access-"),
        JWT_REFRESH_SECRET: strongSecret("refresh-"),
      };

      env[name] = ` ${env[name]}`;

      expect(() => validateProductionSecurityEnv(env)).toThrow(
        expect.objectContaining({
          code: "SECURITY_CONFIGURATION_INVALID",
        }),
      );
    },
  );

  test("errors never expose configured secret values", () => {
    const sensitiveValue = "SENSITIVE_SECRET_VALUE_" + "z".repeat(64);

    try {
      validateProductionSecurityEnv({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: sensitiveValue,
        JWT_REFRESH_SECRET: sensitiveValue,
      });

      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error.code).toBe("SECURITY_CONFIGURATION_INVALID");

      expect(error.message).not.toContain(sensitiveValue);
    }
  });
});
