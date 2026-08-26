const fs = require("fs");
const path = require("path");

describe("personal subscription notification type migration", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/102_personal_subscription_notification_type.sql",
    ),
    "utf8",
  );

  test("adds the Personal subscription activation notification type safely", () => {
    expect(source).toContain("ALTER TYPE notification_type");

    expect(source).toContain("ADD VALUE IF NOT EXISTS");

    expect(source).toContain("'personal_subscription_approved'");
  });

  test("does not remove or recreate the notification enum", () => {
    expect(source).not.toMatch(/DROP\s+TYPE/i);
    expect(source).not.toMatch(/CREATE\s+TYPE/i);
  });
});
