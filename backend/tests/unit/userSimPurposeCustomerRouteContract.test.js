const fs = require("fs");
const path = require("path");

describe("Personal customer SIM-purpose route contract", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../../src/routes/userSimPurpose.routes.js",
    ),
    "utf8",
  );

  test("customer role may reach the self-scoped SIM-purpose endpoint", () => {
    expect(source).toContain("'customer'");
    expect(source).toContain(
      "router.get('/', userSimPurposeController.listPurposes);",
    );
    expect(source).toContain(
      "router.put('/', userSimPurposeController.setPurposes);",
    );
  });
});
