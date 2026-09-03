const fs = require("fs");
const path = require("path");

const authController = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/authController.js"),
  "utf8",
);

function getLoginSource() {
  const start = authController.indexOf("exports.login = async (req, res) => {");

  const end = authController.indexOf("// ─── Complete Superuser MFA", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return authController.slice(start, end);
}

describe("login account enumeration resistance", () => {
  test("uses a bcrypt dummy credential for nonexistent accounts", () => {
    const source = getLoginSource();

    expect(authController).toContain("const LOGIN_DUMMY_PASSWORD_HASH");

    expect(source).toMatch(
      /user\?\.password_hash\s*\|\|\s*LOGIN_DUMMY_PASSWORD_HASH/,
    );

    const compare = source.indexOf("await bcrypt.compare(");

    const genericFailure = source.indexOf("if (!user || !passwordValid)");

    expect(compare).toBeGreaterThanOrEqual(0);
    expect(genericFailure).toBeGreaterThan(compare);

    expect(source.slice(0, compare)).not.toContain("result.rows.length === 0");
  });

  test("returns generic credential failure before lockout disclosure", () => {
    const source = getLoginSource();

    const genericFailure = source.indexOf("if (!user || !passwordValid)");

    const lockoutDisclosure = source.indexOf("if (isLocked)");

    expect(genericFailure).toBeGreaterThanOrEqual(0);
    expect(lockoutDisclosure).toBeGreaterThan(genericFailure);

    expect(source).toMatch(/message:\s*["']Invalid email or password["']/);

    expect(source).toContain("Account locked. Try again in");
  });

  test("does not extend lockout for wrong credentials on locked accounts", () => {
    const source = getLoginSource();

    expect(source).toContain("if (user && !isLocked)");

    const conditionalIncrement = source.indexOf("if (user && !isLocked)");

    const update = source.indexOf("SET login_attempts = login_attempts + 1");

    expect(update).toBeGreaterThan(conditionalIncrement);
  });

  test("keeps failed-attempt updates atomic in PostgreSQL", () => {
    const source = getLoginSource();

    expect(source).toContain("login_attempts = login_attempts + 1");

    expect(source).toContain("WHEN login_attempts + 1 >= $1");

    expect(source).not.toContain("login_attempts: user.login_attempts + 1");
  });
});
