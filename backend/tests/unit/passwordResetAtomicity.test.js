const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, "..", "..", relativePath),
    "utf8",
  );
}

describe("password reset atomic single-use contract", () => {
  const source = readSource("src/controllers/authController.js");

  const start = source.indexOf("exports.resetPassword = async");

  const end = source.indexOf("function cloudinaryPublicIdFromUrl", start);

  const reset = source.slice(start, end);

  test("owns reset-token validation and consumption in one PostgreSQL transaction", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    expect(reset).toContain("await withTransaction(async (client)");

    expect(reset).toContain("FROM password_reset_tokens");

    expect(reset).toContain("FOR UPDATE");

    expect(reset).toContain("await bcrypt.compare");

    expect(reset).toContain("UPDATE password_reset_tokens");

    expect(reset).toContain("AND used_at IS NULL");

    expect(reset).toContain("consumeResult.rowCount !== 1");
  });

  test("locks the reset credential before password mutation", () => {
    const tx = reset.indexOf("await withTransaction(async (client)");

    const select = reset.indexOf("FROM password_reset_tokens", tx);

    const lock = reset.indexOf("FOR UPDATE", select);

    const compare = reset.indexOf("await bcrypt.compare", lock);

    const passwordUpdate = reset.indexOf("UPDATE users", compare);

    const consume = reset.indexOf(
      "UPDATE password_reset_tokens",
      passwordUpdate,
    );

    const revoke = reset.indexOf("UPDATE refresh_tokens", consume);

    expect(tx).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(tx);
    expect(lock).toBeGreaterThan(select);
    expect(compare).toBeGreaterThan(lock);
    expect(passwordUpdate).toBeGreaterThan(compare);
    expect(consume).toBeGreaterThan(passwordUpdate);
    expect(revoke).toBeGreaterThan(consume);
  });

  test("successful password reset still revokes sessions and preserves MFA enrollment", () => {
    expect(reset).toContain("UPDATE refresh_tokens");

    expect(reset).toContain("SET revoked_at = NOW()");

    expect(reset).not.toMatch(/mfa_(?:enabled|totp|recovery|last_totp)/);
  });

  test("audit occurs only after the owning reset transaction completes", () => {
    const transaction = reset.indexOf(
      "const resetResult = await withTransaction",
    );

    const responseGate = reset.indexOf(
      "if (!resetResult.success)",
      transaction,
    );

    const audit = reset.indexOf("await auditLog({", responseGate);

    expect(transaction).toBeGreaterThan(-1);
    expect(responseGate).toBeGreaterThan(transaction);
    expect(audit).toBeGreaterThan(responseGate);
  });
});
