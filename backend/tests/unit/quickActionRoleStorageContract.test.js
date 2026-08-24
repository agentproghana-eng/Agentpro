const fs = require("fs");
const path = require("path");

describe("role-specific Quick Action storage contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/controllers/userController.js"),
    "utf8",
  );

  test("returns Agent Subscriber EVD and Merchant profiles", () => {
    expect(source).toContain("agent: user.agent_quick_actions || {}");

    expect(source).toContain("subscriber: user.personal_quick_actions || {}");

    expect(source).toContain("evd: user.evd_quick_actions || {}");

    expect(source).toContain("merchant: user.merchant_quick_actions || {}");
  });

  test("retains legacy personal response alias", () => {
    expect(source).toContain("personal: user.personal_quick_actions || {}");
  });

  test("persists four role layouts independently", () => {
    expect(source).toContain("COALESCE($1::jsonb, agent_quick_actions)");

    expect(source).toContain("COALESCE($2::jsonb, personal_quick_actions)");

    expect(source).toContain("COALESCE($3::jsonb, evd_quick_actions)");

    expect(source).toContain("COALESCE($4::jsonb, merchant_quick_actions)");
  });

  test("accepts canonical subscriber write field", () => {
    expect(source).toContain("subscriber_quick_actions");
  });
});
