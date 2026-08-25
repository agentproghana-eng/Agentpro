"use strict";

const fs = require("fs");

const path = require("path");

const rateLimitPath = path.join(__dirname, "../../src/middleware/rateLimit.js");

const envExamplePath = path.join(__dirname, "../../.env.example");

describe("Personal phone verification abuse controls", () => {
  test("send and verify endpoints have dedicated fail-closed shared limiters", () => {
    const source = fs.readFileSync(rateLimitPath, "utf8");

    const sendStart = source.indexOf(
      "exports.personalPhoneVerificationSendLimiter",
    );

    const verifyStart = source.indexOf(
      "exports.personalPhoneVerificationVerifyLimiter",
    );

    const refreshStart = source.indexOf("exports.refreshLimiter");

    expect(sendStart).toBeGreaterThan(-1);

    expect(verifyStart).toBeGreaterThan(sendStart);

    expect(refreshStart).toBeGreaterThan(verifyStart);

    const sendSection = source.slice(sendStart, verifyStart);

    const verifySection = source.slice(verifyStart, refreshStart);

    expect(sendSection.includes("max: 8")).toBe(true);

    expect(sendSection.includes("phone-verification-send:")).toBe(true);

    expect(sendSection.includes("passOnStoreError: false")).toBe(true);

    expect(verifySection.includes("max: 30")).toBe(true);

    expect(verifySection.includes("phone-verification-verify:")).toBe(true);

    expect(verifySection.includes("passOnStoreError: false")).toBe(true);
  });

  test("environment contract documents separate trial and OTP peppers", () => {
    const source = fs.readFileSync(envExamplePath, "utf8");

    expect(source.includes("TRIAL_IDENTITY_PEPPER=")).toBe(true);

    expect(source.includes("PHONE_VERIFICATION_PEPPER=")).toBe(true);
  });
});
