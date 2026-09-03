const fs = require("fs");
const path = require("path");

const authController = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/authController.js"),
  "utf8",
);

function getRegisterPersonalSource() {
  const start = authController.indexOf(
    "exports.registerPersonal = async (req, res) => {",
  );

  const end = authController.indexOf(
    "// ─── Add Personal Capability to an Existing Account",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return authController.slice(start, end);
}

describe("personal registration enumeration gate", () => {
  test("does not query email existence before verified phone consumption", () => {
    const source = getRegisterPersonalSource();

    const verification = source.indexOf("consumePersonalPhoneVerification({");

    expect(verification).toBeGreaterThanOrEqual(0);

    const beforeVerification = source.slice(0, verification);

    expect(beforeVerification).not.toContain(
      "SELECT id FROM users WHERE email = $1",
    );

    expect(beforeVerification).not.toContain("existing.rows.length");
  });

  test("keeps PostgreSQL uniqueness as the duplicate-email authority", () => {
    const source = getRegisterPersonalSource();

    expect(source).toContain('if (error?.code === "23505")');

    expect(source).toContain("An account with this email already exists");
  });

  test("consumes phone verification before inserting the user", () => {
    const source = getRegisterPersonalSource();

    const verification = source.indexOf("consumePersonalPhoneVerification({");

    const insertUser = source.indexOf("INSERT INTO users (");

    expect(verification).toBeGreaterThanOrEqual(0);
    expect(insertUser).toBeGreaterThan(verification);
  });
});
