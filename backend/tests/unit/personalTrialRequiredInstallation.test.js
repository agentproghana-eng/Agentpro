"use strict";

const fs = require("fs");
const path = require("path");

const {
  TrialDecisionReason,
  grantPersonalTrial,
} = require("../../src/services/personalTrialEntitlementService");

const PEPPER =
  "required-installation-test-pepper-0123456789-abcdefghijklmnopqrstuvwxyz";

describe("Personal trial required installation identity", () => {
  test("grant fails closed before database access when installation identity is missing", async () => {
    const client = {
      query: jest.fn(),
    };

    const result = await grantPersonalTrial({
      dbClient: client,
      userId: "11111111-1111-4111-8111-111111111111",
      source: "registration",
      phone: "0241234567",
      phoneVerifiedAt: new Date(),
      installationId: null,
      simIccid: null,
      pepper: PEPPER,
    });

    expect(result).toEqual({
      granted: false,
      reason: TrialDecisionReason.INSTALLATION_REQUIRED,
      expiresAt: null,
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  test("all Personal trial-bearing auth routes require installation identity", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../src/routes/auth.routes.js"),
      "utf8",
    );

    const endpoints = [
      "/personal-phone-verification/start",
      "/personal-phone-verification/verify",
      "/register-personal",
      "/add-personal-capability",
    ];

    for (let index = 0; index < endpoints.length; index += 1) {
      const start = source.indexOf(endpoints[index]);

      expect(start).toBeGreaterThanOrEqual(0);

      const next =
        index + 1 < endpoints.length
          ? source.indexOf(endpoints[index + 1], start + 1)
          : source.indexOf("// POST /api/v1/auth/login", start + 1);

      expect(next).toBeGreaterThan(start);

      const route = source.slice(start, next);

      expect(route).toContain('body("installation_id")');
      expect(route).toContain(
        '.withMessage("Installation identity is required")',
      );

      const installationStart =
        route.indexOf('body("installation_id")');

      const simStart =
        route.indexOf('body("sim_iccid")', installationStart);

      const installationValidator =
        route.slice(installationStart, simStart);

      expect(installationValidator).not.toContain(".optional(");
      expect(installationValidator).toContain(".isUUID()");
    }
  });
});
