"use strict";

const fs = require("fs");
const path = require("path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

function controllerSlice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);

  const end = text.indexOf(endMarker, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);

  expect(end).toBeGreaterThan(start);

  return text.slice(start, end);
}

function routeSlice(text, routePath, nextRoutePath) {
  const start = text.indexOf(routePath);

  const end = text.indexOf(nextRoutePath, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);

  expect(end).toBeGreaterThan(start);

  return text.slice(start, end);
}

describe("Personal registration verification contract", () => {
  const routes = source("src/routes/auth.routes.js");

  const controller = source("src/controllers/authController.js");

  test("phone start and verify endpoints use dedicated limiters", () => {
    const startRoute = routeSlice(
      routes,
      "/personal-phone-verification/start",
      "/personal-phone-verification/verify",
    );

    const verifyRoute = routeSlice(
      routes,
      "/personal-phone-verification/verify",
      "/register-personal",
    );

    expect(startRoute).toContain("personalPhoneVerificationSendLimiter");

    expect(verifyRoute).toContain("personalPhoneVerificationVerifyLimiter");

    expect(startRoute).toContain("startPersonalPhoneVerification");

    expect(verifyRoute).toContain("verifyPersonalPhone");
  });

  test("Personal registration requires verified token and optional bound identities", () => {
    const route = routeSlice(
      routes,
      "/register-personal",
      "/add-personal-capability",
    );

    expect(route).toMatch(/body\(["']phone_verification_token["']\)/);

    expect(route).toMatch(/body\(["']installation_id["']\)/);

    expect(route).toMatch(/body\(["']sim_iccid["']\)/);
  });

  test("registration consumes verification before creating user", () => {
    const registration = controllerSlice(
      controller,
      "exports.registerPersonal = async",
      "// ─── Add Personal Capability",
    );

    expect(registration).toContain("consumePersonalPhoneVerification");

    expect(registration).toContain("phone_verified_at");

    expect(
      registration.indexOf("consumePersonalPhoneVerification"),
    ).toBeLessThan(registration.indexOf("INSERT INTO users"));
  });

  test("registration delegates trial decision to durable entitlement engine", () => {
    const registration = controllerSlice(
      controller,
      "exports.registerPersonal = async",
      "// ─── Add Personal Capability",
    );

    expect(registration).toContain("grantPersonalTrial");

    expect(registration).toMatch(
      /trial\.granted\s*\?\s*["']paid["']\s*:\s*["']free["']/,
    );

    expect(registration).not.toContain("NOW() + INTERVAL '7 days'");

    expect(registration).not.toContain("const trialExpiresAt");
  });

  test("used trial identity does not block account creation or paid use", () => {
    const registration = controllerSlice(
      controller,
      "exports.registerPersonal = async",
      "// ─── Add Personal Capability",
    );

    expect(registration).toMatch(
      /trial\.granted\s*\?\s*["']paid["']\s*:\s*["']free["']/,
    );

    expect(registration).toContain("personal_trial_granted");
  });
});
