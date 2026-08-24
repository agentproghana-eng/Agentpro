const fs = require("fs");
const path = require("path");

describe("SIM purpose enum migration safety", () => {
  const migration089 = fs.readFileSync(
    path.join(__dirname, "../../migrations/089_expand_sim_purpose_roles.sql"),
    "utf8",
  );

  const migration092 = fs.readFileSync(
    path.join(
      __dirname,
      "../../migrations/092_migrate_personal_sim_purpose_to_subscriber.sql",
    ),
    "utf8",
  );

  test("089 adds enum value but does not use subscriber in UPDATE", () => {
    expect(migration089).toContain("ADD VALUE IF NOT EXISTS 'subscriber'");

    expect(migration089).not.toContain("SET purpose = 'subscriber'");
  });

  test("later migration performs legacy conversion", () => {
    expect(migration092).toContain("SET purpose = 'subscriber'");

    expect(migration092).toContain("WHERE purpose = 'personal'");
  });
});
