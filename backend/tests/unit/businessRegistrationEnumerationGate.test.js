const fs = require("fs");
const path = require("path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "../../src/controllers/authController.js"),
  "utf8",
);

const registrationScreenSource = fs.readFileSync(
  path.join(
    __dirname,
    "../../../flutter_app/lib/features/auth/register_screen.dart",
  ),
  "utf8",
);

function getBusinessRegisterSource() {
  const start = controllerSource.indexOf(
    "exports.register = async (req, res) => {",
  );

  const end = controllerSource.indexOf(
    "// ─── Personal Subscriber Registration",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return controllerSource.slice(start, end);
}

describe("business registration enumeration gate", () => {
  test("does not perform a pre-registration user email existence probe", () => {
    const source = getBusinessRegisterSource();

    expect(source).not.toContain("SELECT id FROM users WHERE email = $1");

    expect(source).not.toContain("existing.rows.length");
  });

  test("maps uniqueness conflicts to the generic submitted response", () => {
    const source = getBusinessRegisterSource();

    expect(source).toContain("if (error?.code === '23505')");

    expect(source).toContain(
      "return respondBusinessRegistrationSubmitted(res);",
    );

    expect(controllerSource).toContain(
      "Registration submitted. Your account is pending approval.",
    );
  });

  test("does not collect Ghana Card number during business registration", () => {
    const source = getBusinessRegisterSource();

    expect(source).not.toContain("ghana_card_number");

    expect(registrationScreenSource).not.toContain(
      "Ghana Card / Business Reg. Number",
    );

    expect(registrationScreenSource).not.toContain("'ghana_card_number'");

    expect(registrationScreenSource).not.toContain(
      "Business Registration Number",
    );

    expect(registrationScreenSource).not.toContain("'registration_number'");

    expect(registrationScreenSource).not.toContain("_regNumberCtrl");

    expect(source).not.toContain("registration_number");
  });
});
