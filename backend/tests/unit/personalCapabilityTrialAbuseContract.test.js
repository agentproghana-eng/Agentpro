"use strict";

const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

function controllerSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  const end = source.indexOf(endMarker, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);

  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function routeSlice(source, routePath, nextRoutePath) {
  const start = source.indexOf(routePath);

  const end = source.indexOf(nextRoutePath, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);

  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("Personal capability trial-abuse contract", () => {
  const controller = readSource("src/controllers/authController.js");

  const routes = readSource("src/routes/auth.routes.js");

  test("existing-account capability uses verified phone and durable trial engine", () => {
    const capability = controllerSlice(
      controller,
      "exports.addPersonalCapability = async",
      "// ─── Login",
    );

    expect(capability).toContain("consumePersonalPhoneVerification");

    expect(capability).toContain("grantPersonalTrial");

    expect(capability).toMatch(/source:\s*["']personal_capability["']/);

    expect(capability).toContain("phone_verified_at");

    expect(capability).toContain("trial.granted");

    expect(capability).not.toContain("NOW() + INTERVAL '7 days'");
  });

  test("account phone comes from server state rather than request body", () => {
    const capability = controllerSlice(
      controller,
      "exports.addPersonalCapability = async",
      "// ─── Login",
    );

    expect(capability).toContain("FROM users");

    expect(capability).toContain("accountUser.phone");

    const route = routeSlice(routes, "/add-personal-capability", "/login");

    expect(route).not.toMatch(/body\(["']phone["']\)/);
  });

  test("idempotent capability check occurs before token consumption", () => {
    const capability = controllerSlice(
      controller,
      "exports.addPersonalCapability = async",
      "// ─── Login",
    );

    expect(capability.indexOf("FROM personal_subscriptions")).toBeLessThan(
      capability.indexOf("consumePersonalPhoneVerification"),
    );
  });

  test("capability route accepts verification token and bound identity fields", () => {
    const route = routeSlice(routes, "/add-personal-capability", "/login");

    expect(route).toMatch(/body\(["']phone_verification_token["']\)/);

    expect(route).toMatch(/body\(["']installation_id["']\)/);

    expect(route).toMatch(/body\(["']sim_iccid["']\)/);

    expect(route).toContain("handleValidation");
  });
});
