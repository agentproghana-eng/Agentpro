"use strict";

const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
};

const mockSendSMS = jest.fn();

jest.mock("../../src/config/redis", () => ({
  redisClient: mockRedis,
}));

jest.mock("../../src/services/smsService", () => ({
  sendSMS: mockSendSMS,
}));

const {
  PHONE_CHALLENGE_TTL_SECONDS,
  PHONE_VERIFIED_TOKEN_TTL_SECONDS,
  MAX_PHONE_VERIFICATION_ATTEMPTS,
  beginPersonalPhoneVerification,
  verifyPersonalPhoneCode,
  consumePersonalPhoneVerification,
} = require("../../src/services/personalPhoneVerificationService");

const trialPepper = "gate3-trial-pepper-0123456789-abcdefghijklmnopqrstuvwxyz";

const verificationPepper =
  "gate3-phone-pepper-0123456789-abcdefghijklmnopqrstuvwxyz";

const phone = "0241234567";

const installationId = "11111111-1111-4111-8111-111111111111";

const simIccid = "8923301234567890123";

function extractCode() {
  const message = mockSendSMS.mock.calls[0][1];

  const match = message.match(/\b\d{6}\b/);

  expect(match == null).toBe(false);

  return match[0];
}

function differentCode(realCode) {
  return realCode === "000000" ? "000001" : "000000";
}

describe("Personal phone verification service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    process.env.TRIAL_IDENTITY_PEPPER = trialPepper;

    process.env.PHONE_VERIFICATION_PEPPER = verificationPepper;

    mockRedis.eval.mockResolvedValue(1);

    mockRedis.setex.mockResolvedValue("OK");

    mockRedis.get.mockResolvedValue(null);

    mockRedis.incr.mockResolvedValue(1);

    mockRedis.expire.mockResolvedValue(1);

    mockRedis.del.mockResolvedValue(1);

    mockSendSMS.mockResolvedValue({
      status: "success",
    });
  });

  test("stores only hashed OTP and identity bindings in Redis", async () => {
    const result = await beginPersonalPhoneVerification({
      phone,
      installationId,
      simIccid,
    });

    expect(result.challengeToken.length).toBeGreaterThanOrEqual(40);

    expect(Object.prototype.hasOwnProperty.call(result, "code")).toBe(false);

    expect(mockSendSMS).toHaveBeenCalledTimes(1);

    const code = extractCode();

    expect(mockRedis.setex).toHaveBeenCalledTimes(1);

    const [redisKey, ttl, rawPayload] = mockRedis.setex.mock.calls[0];

    expect(redisKey.includes(result.challengeToken)).toBe(false);

    expect(ttl).toBe(PHONE_CHALLENGE_TTL_SECONDS);

    expect(rawPayload.includes(phone)).toBe(false);

    expect(rawPayload.includes("+233241234567")).toBe(false);

    expect(rawPayload.includes(installationId)).toBe(false);

    expect(rawPayload.includes(simIccid)).toBe(false);

    expect(rawPayload.includes(code)).toBe(false);

    const payload = JSON.parse(rawPayload);

    expect(payload.codeHash).toMatch(/^[0-9a-f]{64}$/);

    expect(payload.phoneClaim.claimHash).toMatch(/^[0-9a-f]{64}$/);

    expect(payload.simClaim.claimHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("promotes valid OTP into one-time verified token", async () => {
    const started = await beginPersonalPhoneVerification({
      phone,
      installationId,
      simIccid,
    });

    const code = extractCode();

    const rawChallenge = mockRedis.setex.mock.calls[0][2];

    mockRedis.get.mockResolvedValueOnce(rawChallenge);

    mockRedis.eval.mockResolvedValueOnce(1);

    const verified = await verifyPersonalPhoneCode({
      challengeToken: started.challengeToken,
      code,
      phone,
      installationId,
      simIccid,
    });

    expect(verified.verifiedToken.length).toBeGreaterThanOrEqual(40);

    expect(verified.expiresInSeconds).toBe(PHONE_VERIFIED_TOKEN_TTL_SECONDS);

    const promotionCall = mockRedis.eval.mock.calls[1];

    const verifiedRaw = promotionCall[promotionCall.length - 1];

    expect(verifiedRaw.includes(code)).toBe(false);

    expect(verifiedRaw.includes(phone)).toBe(false);

    expect(verifiedRaw.includes(simIccid)).toBe(false);

    mockRedis.get.mockResolvedValueOnce(verifiedRaw);

    mockRedis.eval.mockResolvedValueOnce(verifiedRaw);

    const consumed = await consumePersonalPhoneVerification({
      verifiedToken: verified.verifiedToken,
      phone,
      installationId,
      simIccid,
    });

    expect(consumed.verifiedAt).toBe(verified.verifiedAt);
  });

  test("rejects wrong OTP and counts failure", async () => {
    const started = await beginPersonalPhoneVerification({
      phone,
      installationId,
      simIccid,
    });

    const realCode = extractCode();

    const rawChallenge = mockRedis.setex.mock.calls[0][2];

    mockRedis.get.mockResolvedValueOnce(rawChallenge);

    await expect(
      verifyPersonalPhoneCode({
        challengeToken: started.challengeToken,
        code: differentCode(realCode),
        phone,
        installationId,
        simIccid,
      }),
    ).rejects.toMatchObject({
      code: "PHONE_VERIFICATION_INVALID_CODE",
    });

    expect(mockRedis.incr).toHaveBeenCalledTimes(1);
  });

  test("locks challenge at failed-attempt ceiling", async () => {
    const started = await beginPersonalPhoneVerification({
      phone,
    });

    const realCode = extractCode();

    const rawChallenge = mockRedis.setex.mock.calls[0][2];

    mockRedis.get.mockResolvedValueOnce(rawChallenge);

    mockRedis.incr.mockResolvedValueOnce(MAX_PHONE_VERIFICATION_ATTEMPTS);

    await expect(
      verifyPersonalPhoneCode({
        challengeToken: started.challengeToken,
        code: differentCode(realCode),
        phone,
      }),
    ).rejects.toMatchObject({
      code: "PHONE_VERIFICATION_INVALID_CODE",

      remainingAttempts: 0,
    });

    expect(mockRedis.del).toHaveBeenCalled();
  });

  test("rejects changed SIM binding before verified token", async () => {
    const started = await beginPersonalPhoneVerification({
      phone,
      installationId,
      simIccid,
    });

    const rawChallenge = mockRedis.setex.mock.calls[0][2];

    mockRedis.get.mockResolvedValueOnce(rawChallenge);

    await expect(
      verifyPersonalPhoneCode({
        challengeToken: started.challengeToken,
        code: extractCode(),
        phone,
        installationId,

        simIccid: "8923309876543210123",
      }),
    ).rejects.toMatchObject({
      code: "PHONE_VERIFICATION_BINDING_MISMATCH",
    });
  });

  test.each([
    [-1, "PHONE_VERIFICATION_RESEND_TOO_SOON"],
    [-2, "PHONE_VERIFICATION_RATE_LIMITED"],
  ])(
    "fails closed when phone send guard returns %s",
    async (guardResult, expectedCode) => {
      mockRedis.eval.mockResolvedValueOnce(guardResult);

      await expect(
        beginPersonalPhoneVerification({
          phone,
        }),
      ).rejects.toMatchObject({
        code: expectedCode,
      });

      expect(mockSendSMS).toHaveBeenCalledTimes(0);

      expect(mockRedis.setex).toHaveBeenCalledTimes(0);
    },
  );

  test("fails closed when SMS delivery is skipped", async () => {
    mockSendSMS.mockResolvedValueOnce({
      skipped: true,
    });

    await expect(
      beginPersonalPhoneVerification({
        phone,
      }),
    ).rejects.toMatchObject({
      code: "PHONE_VERIFICATION_DELIVERY_UNAVAILABLE",
    });

    expect(mockRedis.del).toHaveBeenCalled();
  });

  test("fails before Redis or SMS when OTP pepper is missing", async () => {
    process.env.PHONE_VERIFICATION_PEPPER = "";

    await expect(
      beginPersonalPhoneVerification({
        phone,
      }),
    ).rejects.toMatchObject({
      code: "PHONE_VERIFICATION_PROTECTION_UNAVAILABLE",
    });

    expect(mockRedis.eval).toHaveBeenCalledTimes(0);

    expect(mockSendSMS).toHaveBeenCalledTimes(0);
  });
});
