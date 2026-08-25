"use strict";

const mockQuery = jest.fn();

const mockWithTransaction = jest.fn();

const mockClientQuery = jest.fn();

const mockBcryptHash = jest.fn();

const mockJwtSign = jest.fn();

const mockUuid = jest.fn();

const mockAuditLog = jest.fn();

const mockBeginVerification = jest.fn();

const mockVerifyCode = jest.fn();

const mockConsumeVerification = jest.fn();

const mockGrantTrial = jest.fn();

jest.mock("../../src/config/database", () => ({
  query: mockQuery,
  withTransaction: mockWithTransaction,
}));

jest.mock("bcryptjs", () => ({
  hash: mockBcryptHash,
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: mockJwtSign,
  verify: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: mockUuid,
}));

jest.mock("../../src/config/redis", () => ({
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../src/services/emailService", () => ({
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));

jest.mock("../../src/services/smsService", () => ({
  sendPasswordResetSMS: jest.fn(),
}));

jest.mock("../../src/services/auditService", () => ({
  auditLog: mockAuditLog,
}));

jest.mock("../../src/utils/totp", () => ({
  generateTotpSecret: jest.fn(),
  findMatchingTotpCounter: jest.fn(),
  buildOtpAuthUri: jest.fn(),
}));

jest.mock("../../src/utils/mfaCrypto", () => ({
  assertMfaEncryptionConfigured: jest.fn(),
  encryptTotpSecret: jest.fn(),
  decryptTotpSecret: jest.fn(),
  generateRecoveryCodes: jest.fn(),
  hashRecoveryCodes: jest.fn(),
  findRecoveryCodeIndex: jest.fn(),
}));

jest.mock("../../src/services/mfaChallengeService", () => ({
  createMfaChallenge: jest.fn(),
  getMfaChallenge: jest.fn(),
  recordMfaFailure: jest.fn(),
  consumeMfaChallenge: jest.fn(),
}));

jest.mock("../../src/services/personalPhoneVerificationService", () => ({
  beginPersonalPhoneVerification: mockBeginVerification,
  verifyPersonalPhoneCode: mockVerifyCode,
  consumePersonalPhoneVerification: mockConsumeVerification,
}));

jest.mock("../../src/services/personalTrialEntitlementService", () => ({
  grantPersonalTrial: mockGrantTrial,
}));

const authController = require("../../src/controllers/authController");

const phone = "0241234567";

const installationId = "11111111-1111-4111-8111-111111111111";

const simIccid = "8923301234567890123";

const verificationToken = "v".repeat(48);

const verifiedAt = "2026-08-25T09:00:00.000Z";

const trialExpiry = new Date("2026-09-01T09:00:00.000Z");

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);

  return res;
}

function registrationReq() {
  return {
    body: {
      first_name: "Ama",
      last_name: "Mensah",
      phone,
      email: "ama@example.com",
      password: "StrongPass1",
      phone_verification_token: verificationToken,
      installation_id: installationId,
      sim_iccid: simIccid,
    },
    ip: "127.0.0.1",
    headers: {
      "user-agent": "Gate3 test",
    },
    requestId: "request-1",
  };
}

describe("Personal registration verification controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockBcryptHash.mockImplementation(async (value) => "hash:" + value);

    mockJwtSign.mockReturnValue("access-token");

    mockUuid.mockReturnValue("11111111-2222-4333-8444-555555555555");

    mockAuditLog.mockResolvedValue();

    mockBeginVerification.mockResolvedValue({
      challengeToken: "c".repeat(48),
      expiresInSeconds: 300,
    });

    mockVerifyCode.mockResolvedValue({
      verifiedToken: verificationToken,
      verifiedAt,
      expiresInSeconds: 600,
    });

    mockConsumeVerification.mockResolvedValue({
      verifiedAt,
    });

    mockGrantTrial.mockResolvedValue({
      granted: true,
      reason: "ELIGIBLE",
      expiresAt: trialExpiry,
      entitlementId: "entitlement-1",
    });

    mockWithTransaction.mockImplementation(async (callback) =>
      callback({
        query: mockClientQuery,
      }),
    );

    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes("SELECT id FROM users")) {
        return {
          rows: [],
        };
      }

      if (sql.includes("INSERT INTO refresh_tokens")) {
        return {
          rows: [
            {
              id: "session-1",
            },
          ],
        };
      }

      throw new Error("Unexpected global query");
    });

    mockClientQuery.mockImplementation(async (sql, params) => {
      if (sql.includes("INSERT INTO users")) {
        return {
          rows: [
            {
              id: "user-1",
              role: "customer",
              first_name: "Ama",
              last_name: "Mensah",
              email: "ama@example.com",
              phone,
              phone_verified_at: params[5],
              company_id: null,
              profile_image_url: null,
              must_change_password: false,
            },
          ],
        };
      }

      if (sql.includes("INSERT INTO personal_subscriptions")) {
        return {
          rows: [],
        };
      }

      throw new Error("Unexpected transaction query");
    });
  });

  test("starts verification without creating an account", async () => {
    const res = makeRes();

    await authController.startPersonalPhoneVerification(
      {
        body: {
          phone,
          installation_id: installationId,
          sim_iccid: simIccid,
        },
      },
      res,
    );

    expect(mockBeginVerification).toHaveBeenCalledWith({
      phone,
      installationId,
      simIccid,
    });

    expect(res.status).toHaveBeenCalledWith(202);

    expect(mockWithTransaction).toHaveBeenCalledTimes(0);
  });

  test("verifies code and returns short-lived registration token", async () => {
    const res = makeRes();

    const challengeToken = "c".repeat(48);

    await authController.verifyPersonalPhone(
      {
        body: {
          challenge_token: challengeToken,
          code: "123456",
          phone,
          installation_id: installationId,
          sim_iccid: simIccid,
        },
      },
      res,
    );

    expect(mockVerifyCode).toHaveBeenCalledWith({
      challengeToken,
      code: "123456",
      phone,
      installationId,
      simIccid,
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          verification_token: verificationToken,
        }),
      }),
    );
  });

  test("verified new identity receives one paid trial", async () => {
    const res = makeRes();

    await authController.registerPersonal(registrationReq(), res);

    expect(mockConsumeVerification).toHaveBeenCalledWith({
      verifiedToken: verificationToken,
      phone,
      installationId,
      simIccid,
    });

    const userCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO users"),
    );

    expect(userCall == null).toBe(false);

    expect(userCall[0]).toContain("phone_verified_at");

    expect(userCall[1][5]).toBeInstanceOf(Date);

    expect(mockGrantTrial).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        source: "registration",
        phone,
        installationId,
        simIccid,
      }),
    );

    const subscriptionCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO personal_subscriptions"),
    );

    expect(subscriptionCall[1]).toEqual(["user-1", "paid", trialExpiry]);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({
            personal_subscription_plan: "paid",
            personal_trial_granted: true,
          }),
        }),
      }),
    );
  });

  test("prior trial identity still registers as Free without another trial", async () => {
    mockGrantTrial.mockResolvedValueOnce({
      granted: false,
      reason: "TRIAL_ALREADY_USED",
      expiresAt: null,
    });

    const res = makeRes();

    await authController.registerPersonal(registrationReq(), res);

    const subscriptionCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO personal_subscriptions"),
    );

    expect(subscriptionCall[1]).toEqual(["user-1", "free", null]);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: expect.objectContaining({
            personal_subscription_plan: "free",
            personal_subscription_expires_at: null,
            personal_trial_granted: false,
          }),
        }),
      }),
    );
  });

  test("invalid verified token creates no account", async () => {
    const error = new Error(
      "Verified registration token is invalid or expired.",
    );

    error.code = "PHONE_VERIFICATION_TOKEN_INVALID";

    mockConsumeVerification.mockRejectedValueOnce(error);

    const res = makeRes();

    await authController.registerPersonal(registrationReq(), res);

    expect(mockClientQuery).toHaveBeenCalledTimes(0);

    expect(res.status).toHaveBeenCalledWith(422);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: "PHONE_VERIFICATION_TOKEN_INVALID",
      }),
    );
  });

  test("existing Personal capability remains idempotent without consuming another token", async () => {
    mockClientQuery.mockReset();

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            phone,
            phone_verified_at: verifiedAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            plan: "paid",
            expires_at: trialExpiry,
          },
        ],
      });

    const res = makeRes();

    await authController.addPersonalCapability(
      {
        body: {},
        user: {
          id: "user-1",
          company_id: "company-1",
        },
        ip: "127.0.0.1",
        headers: {
          "user-agent": "Gate3 test",
        },
        requestId: "request-2",
      },
      res,
    );

    expect(mockConsumeVerification).toHaveBeenCalledTimes(0);

    expect(mockGrantTrial).toHaveBeenCalledTimes(0);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          personal_subscription_plan: "paid",
        }),
      }),
    );
  });

  test("new Personal capability consumes verification and does not grant a second trial", async () => {
    mockClientQuery.mockReset();

    mockClientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            phone,
            phone_verified_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            phone,
            phone_verified_at: new Date(verifiedAt),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            plan: "free",
            expires_at: null,
          },
        ],
      });

    mockGrantTrial.mockResolvedValueOnce({
      granted: false,
      reason: "TRIAL_ALREADY_USED",
      expiresAt: null,
    });

    const res = makeRes();

    await authController.addPersonalCapability(
      {
        body: {
          phone_verification_token: verificationToken,
          installation_id: installationId,
          sim_iccid: simIccid,
        },
        user: {
          id: "user-1",
          company_id: "company-1",
        },
        ip: "127.0.0.1",
        headers: {
          "user-agent": "Gate3 test",
        },
        requestId: "request-3",
      },
      res,
    );

    expect(mockConsumeVerification).toHaveBeenCalledWith({
      verifiedToken: verificationToken,
      phone,
      installationId,
      simIccid,
    });

    expect(mockGrantTrial).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        source: "personal_capability",
        phone,
        installationId,
        simIccid,
      }),
    );

    const subscriptionCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO personal_subscriptions"),
    );

    expect(subscriptionCall == null).toBe(false);

    expect(subscriptionCall[1]).toEqual(["user-1", "free", null]);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personal_subscription_plan: "free",
          personal_subscription_expires_at: null,
          personal_trial_granted: false,
        }),
      }),
    );
  });
});
