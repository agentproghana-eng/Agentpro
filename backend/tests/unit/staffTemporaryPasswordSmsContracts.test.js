const fs = require("fs");
const path = require("path");

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { sendNewEmployeeSMS } = require("../../src/services/smsService");

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../..", relativePath), "utf8");
}

describe("Staff onboarding credential security contracts", () => {
  const controllerSource = readSource("src/controllers/userController.js");

  const routeSource = readSource("src/routes/user.routes.js");

  const emailSource = readSource("src/services/emailService.js");

  const smsSource = readSource("src/services/smsService.js");

  const authSource = readSource("src/controllers/authController.js");

  const envExample = readSource(".env.example");

  const originalApiKey = process.env.ARKESEL_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ARKESEL_API_KEY = "test-arkesel-key";
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.ARKESEL_API_KEY;
    } else {
      process.env.ARKESEL_API_KEY = originalApiKey;
    }

    global.fetch = originalFetch;
  });

  test("staff creator cannot supply or receive an initial password", () => {
    expect(routeSource).toContain(
      "Staff passwords are set by the staff member using the secure setup link",
    );

    expect(controllerSource).toContain(
      'Object.prototype.hasOwnProperty.call(req.body, "password")',
    );

    expect(controllerSource).not.toContain("tempPassword");
    expect(controllerSource).not.toContain("generateTempPassword");
    expect(controllerSource).not.toContain("sendEphemeral");
  });

  test("staff onboarding stores only hashes for bootstrap and setup credentials", () => {
    expect(controllerSource).toContain(
      'crypto.randomBytes(48).toString("base64url")',
    );

    expect(controllerSource).toContain(
      'const setupToken = crypto.randomBytes(32).toString("hex")',
    );

    expect(controllerSource).toContain(
      "const setupTokenHash = await bcrypt.hash(setupToken, 8)",
    );

    expect(controllerSource).toContain("INSERT INTO password_reset_tokens");

    expect(controllerSource).toContain(
      "[userId, setupTokenHash, setupExpiresAt]",
    );
  });

  test("staff email contains only an expiring setup link, never a password", () => {
    expect(emailSource).toContain("setupUrl");
    expect(emailSource).toContain("Set Your Password");
    expect(emailSource).toContain("This one-time setup link expires in 1 hour");

    expect(emailSource).not.toContain("tempPassword");
    expect(emailSource).not.toContain("Temporary Password:");
  });

  test("staff SMS never carries an onboarding credential", async () => {
    const forbiddenSecret = "NeverTransmitThisCredential9X";

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        data: { id: "sms-test-1" },
      }),
    });

    // Extra fifth argument proves an old caller cannot accidentally
    // reintroduce credential transmission through this API.
    await sendNewEmployeeSMS(
      "0244123456",
      "Ama",
      "agent",
      "Example Company",
      forbiddenSecret,
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, request] = global.fetch.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload.recipients).toEqual(["+233244123456"]);
    expect(payload.message).not.toContain(forbiddenSecret);

    expect(payload.message).toContain(
      "Check your email for the secure password setup link",
    );

    expect(smsSource).not.toContain("tempPassword");
    expect(smsSource).not.toContain("Temporary password:");
  });

  test("successful setup/reset clears the forced-password-change state", () => {
    expect(authSource).toMatch(
      /SET password_hash = \$1,[\s\S]{0,250}must_change_password = false/,
    );
  });

  test("create-staff delivery status marks only confirmed channels", () => {
    expect(controllerSource).toContain(
      "emailSent = emailResult?.skipped !== true",
    );

    expect(controllerSource).toContain("smsSent = smsResult?.skipped !== true");

    expect(controllerSource).not.toContain("let emailSent = true;");

    expect(controllerSource).not.toContain("smsSent = true;");
  });

  test("Arkesel SMS configuration remains documented", () => {
    expect(envExample).toMatch(/^ARKESEL_API_KEY=/m);
  });
});
