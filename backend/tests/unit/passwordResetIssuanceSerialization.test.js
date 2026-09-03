const fs = require("fs");
const path = require("path");

const authController = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/authController.js"),
  "utf8",
);

function getRequestPasswordResetSource() {
  const start = authController.indexOf(
    "exports.requestPasswordReset = async (req, res) => {",
  );
  const end = authController.indexOf(
    "// ─── Reset Password",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return authController.slice(start, end);
}

describe("password reset issuance serialization", () => {
  test("owns lookup, invalidation, and insertion in one transaction", () => {
    const source = getRequestPasswordResetSource();

    expect(source).toContain("withTransaction(async (client) =>");
    expect(source).toContain("await client.query(");
    expect(source).toContain("UPDATE password_reset_tokens");
    expect(source).toContain("INSERT INTO password_reset_tokens");
    expect(source).not.toContain(
      "await query(\n      'UPDATE password_reset_tokens",
    );
    expect(source).not.toContain(
      "await query(\n      'INSERT INTO password_reset_tokens",
    );
  });

  test("locks the stable user row before replacing the reset token", () => {
    const source = getRequestPasswordResetSource();

    const hash = source.indexOf("await bcrypt.hash(resetToken, 8)");
    const transaction = source.indexOf("withTransaction(async (client) =>");
    const lock = source.indexOf("FOR UPDATE");
    const invalidate = source.indexOf("UPDATE password_reset_tokens");
    const insert = source.indexOf("INSERT INTO password_reset_tokens");

    expect(hash).toBeGreaterThanOrEqual(0);
    expect(transaction).toBeGreaterThan(hash);
    expect(lock).toBeGreaterThan(transaction);
    expect(invalidate).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(invalidate);
  });

  test("preserves generic nonexistent-account response", () => {
    const source = getRequestPasswordResetSource();

    expect(source).toContain("if (!issuance)");
    expect(source).toContain(
      "If that email is registered, you will receive a password reset link shortly.",
    );
  });

  test("keeps reset notifications outside the owning transaction", () => {
    const source = getRequestPasswordResetSource();

    const transactionEnd = source.indexOf(
      "const { user } = issuance;",
    );
    const email = source.indexOf("await sendPasswordResetEmail(");
    const sms = source.indexOf("await sendPasswordResetSMS(");

    expect(transactionEnd).toBeGreaterThanOrEqual(0);
    expect(email).toBeGreaterThan(transactionEnd);
    expect(sms).toBeGreaterThan(transactionEnd);
  });
});
