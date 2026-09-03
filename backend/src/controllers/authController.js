const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { blacklistToken, isTokenBlacklisted } = require('../config/redis');
const { logger } = require('../utils/logger');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendPasswordResetSMS } = require('../services/smsService');
const { auditLog } = require('../services/auditService');
const {
  generateTotpSecret,
  findMatchingTotpCounter,
  buildOtpAuthUri,
} = require('../utils/totp');
const {
  assertMfaEncryptionConfigured,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCodes,
  findRecoveryCodeIndex,
} = require('../utils/mfaCrypto');
const {
  createMfaChallenge,
  getMfaChallenge,
  recordMfaFailure,
  consumeMfaChallenge,
} = require('../services/mfaChallengeService');

const {
  beginPersonalPhoneVerification,
  verifyPersonalPhoneCode,
  consumePersonalPhoneVerification,
} = require("../services/personalPhoneVerificationService");
const {
  grantPersonalTrial,
} = require("../services/personalTrialEntitlementService");
const {
  deleteFile: deleteCloudinaryFile,
} = require('../config/cloudinary');

// ─── Token Helpers ───────────────────────────────────────────

function generateAccessToken(user, sessionId) {
  if (!sessionId) {
    throw new Error(
      'A durable session ID is required to issue an access token'
    );
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      company_id: user.company_id,
      email: user.email,
      session_id: sessionId,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      type: 'refresh',

      // Every newly issued refresh credential must be unique to one
      // login/session even when the same user authenticates concurrently.
      jti: uuidv4(),
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
}

function digestRefreshToken(token) {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function getRefreshTokenExpiry() {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Precomputed bcrypt credential used only to equalize password-verification
// work when a login email does not exist. It must never authenticate a user.
const LOGIN_DUMMY_PASSWORD_HASH =
  '$2b$12$aqbxgu6Uo3qgDdhEOGX8IeAp1dCCjCttgK2cA.lt/s2MQxdrKMv2K';

const PERSONAL_VERIFICATION_CODES = new Set([
  "PHONE_VERIFICATION_RESEND_TOO_SOON",
  "PHONE_VERIFICATION_RATE_LIMITED",
  "PHONE_VERIFICATION_TEMPORARILY_UNAVAILABLE",
  "PHONE_VERIFICATION_PROTECTION_UNAVAILABLE",
  "PHONE_VERIFICATION_DELIVERY_UNAVAILABLE",
  "PHONE_VERIFICATION_INVALID_CODE",
  "PHONE_VERIFICATION_BINDING_MISMATCH",
  "PHONE_VERIFICATION_EXPIRED",
  "PHONE_VERIFICATION_TOKEN_INVALID",
  "INVALID_TRIAL_PHONE",
  "INVALID_TRIAL_INSTALLATION",
  "INVALID_TRIAL_SIM_IDENTITY",
  "TRIAL_IDENTITY_PROTECTION_UNAVAILABLE",
]);

function isPersonalVerificationError(error) {
  return PERSONAL_VERIFICATION_CODES.has(error?.code);
}

function personalVerificationErrorStatus(error) {
  const code = error?.code;

  if (
    [
      "PHONE_VERIFICATION_RESEND_TOO_SOON",
      "PHONE_VERIFICATION_RATE_LIMITED",
    ].includes(code)
  ) {
    return 429;
  }

  if (
    [
      "PHONE_VERIFICATION_TEMPORARILY_UNAVAILABLE",
      "PHONE_VERIFICATION_PROTECTION_UNAVAILABLE",
      "PHONE_VERIFICATION_DELIVERY_UNAVAILABLE",
      "TRIAL_IDENTITY_PROTECTION_UNAVAILABLE",
    ].includes(code)
  ) {
    return 503;
  }

  if (PERSONAL_VERIFICATION_CODES.has(code)) {
    return 422;
  }

  return 500;
}

function respondPersonalVerificationError(res, error) {
  const status = personalVerificationErrorStatus(error);

  const code =
    typeof error?.code === "string"
      ? error.code
      : "PERSONAL_VERIFICATION_FAILED";

  const message =
    status >= 500
      ? "Registration verification is temporarily unavailable."
      : typeof error?.message === "string"
        ? error.message
        : "Registration verification failed.";

  const body = {
    success: false,
    code,
    message,
  };

  if (Number.isInteger(error?.retryAfterSeconds)) {
    body.retry_after_seconds = error.retryAfterSeconds;
  }

  if (Number.isInteger(error?.remainingAttempts)) {
    body.remaining_attempts = error.remainingAttempts;
  }

  return res.status(status).json(body);
}

// ─── Business Owner Registration ─────────────────────────────

function respondBusinessRegistrationSubmitted(res) {
  return res.status(201).json({
    success: true,
    message: 'Registration submitted. Your account is pending approval. You will be notified once approved.'
  });
}

exports.register = async (req, res) => {
  const {
    company_name,
    company_phone,
    company_email,
    first_name,
    last_name,
    phone,
    email,
    password
  } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await withTransaction(async (client) => {
      // Create company
      const companyResult = await client.query(
        `INSERT INTO companies (name, phone, email, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [company_name, company_phone, company_email || email]
      );
      const companyId = companyResult.rows[0].id;

      // Create business owner user
      const userResult = await client.query(
        `INSERT INTO users (
          company_id, role, first_name, last_name, email,
          phone, password_hash, status
        ) VALUES ($1, 'business_owner', $2, $3, $4, $5, $6, 'pending')
        RETURNING id, email, role, status`,
        [companyId, first_name, last_name, email.toLowerCase(), phone, passwordHash]
      );
      const user = userResult.rows[0];

      // Create free subscription
      await client.query(
        `INSERT INTO subscriptions (company_id, plan, status)
         VALUES ($1, 'free', 'pending')`,
        [companyId]
      );

      await auditLog({
        userId: user.id,
        companyId,
        action: 'USER_REGISTERED',
        entityType: 'user',
        entityId: user.id,
        newValues: { email, role: 'business_owner', company_name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId
      });

      // Send notification to superuser (handled by notification service)
      logger.info('New Business Owner registration submitted');
    });

    return respondBusinessRegistrationSubmitted(res);

  } catch (error) {
    if (error?.code === '23505') {
      logger.info('Duplicate business registration suppressed');
      return respondBusinessRegistrationSubmitted(res);
    }

    logger.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// ─── Personal Subscriber Registration ────────────────────────
// Lightweight, no company involved and no superuser approval gate -
// unlike the Business Owner path above, a Personal account activates
// immediately. Auto-logs the new user in on success (same token/response
// shape as login()) since there's no pending-approval wait to justify a
// separate login step right after.

exports.startPersonalPhoneVerification = async (req, res) => {
  const { phone, installation_id, sim_iccid } = req.body;

  try {
    const result = await beginPersonalPhoneVerification({
      phone,
      installationId: installation_id || null,
      simIccid: sim_iccid || null,
    });

    return res.status(202).json({
      success: true,
      code: "PHONE_VERIFICATION_CODE_SENT",
      message: "Verification code sent.",
      data: {
        challenge_token: result.challengeToken,
        expires_in_seconds: result.expiresInSeconds,
      },
    });
  } catch (error) {
    if (isPersonalVerificationError(error)) {
      return respondPersonalVerificationError(res, error);
    }

    logger.error("Personal phone verification start failed", {
      code: error?.code || "UNEXPECTED",
    });

    return res.status(500).json({
      success: false,
      message: "Registration verification is temporarily unavailable.",
    });
  }
};

exports.verifyPersonalPhone = async (req, res) => {
  const { challenge_token, code, phone, installation_id, sim_iccid } = req.body;

  try {
    const result = await verifyPersonalPhoneCode({
      challengeToken: challenge_token,
      code,
      phone,
      installationId: installation_id || null,
      simIccid: sim_iccid || null,
    });

    return res.json({
      success: true,
      code: "PHONE_VERIFICATION_COMPLETE",
      message: "Phone number verified.",
      data: {
        verification_token: result.verifiedToken,
        expires_in_seconds: result.expiresInSeconds,
      },
    });
  } catch (error) {
    if (isPersonalVerificationError(error)) {
      return respondPersonalVerificationError(res, error);
    }

    logger.error("Personal phone verification failed", {
      code: error?.code || "UNEXPECTED",
    });

    return res.status(500).json({
      success: false,
      message: "Registration verification is temporarily unavailable.",
    });
  }
};

exports.registerPersonal = async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    password,
    phone_verification_token,
    installation_id,
    sim_iccid,
  } = req.body;

  try {
    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS) || 12,
    );

    const registration = await withTransaction(async (client) => {
      const verification = await consumePersonalPhoneVerification({
        verifiedToken: phone_verification_token,
        phone,
        installationId: installation_id || null,
        simIccid: sim_iccid || null,
      });

      const phoneVerifiedAt = new Date(verification.verifiedAt);

      if (Number.isNaN(phoneVerifiedAt.getTime())) {
        const error = new Error("Verified phone timestamp is invalid.");

        error.code = "PHONE_VERIFICATION_TOKEN_INVALID";

        throw error;
      }

      const userResult = await client.query(
        `INSERT INTO users (
                role,
                first_name,
                last_name,
                email,
                phone,
                password_hash,
                phone_verified_at,
                status
              )
              VALUES (
                'customer',
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'active'
              )
              RETURNING
                id,
                role,
                first_name,
                last_name,
                email,
                phone,
                phone_verified_at,
                company_id,
                profile_image_url,
                must_change_password`,
        [
          first_name,
          last_name,
          email.toLowerCase(),
          phone,
          passwordHash,
          phoneVerifiedAt,
        ],
      );

      const newUser = userResult.rows[0];

      const trial = await grantPersonalTrial({
        dbClient: client,
        userId: newUser.id,
        source: "registration",
        phone: newUser.phone,
        phoneVerifiedAt: newUser.phone_verified_at,
        installationId: installation_id || null,
        simIccid: sim_iccid || null,
      });

      const personalPlan = trial.granted ? "paid" : "free";

      const personalExpiresAt = trial.granted ? trial.expiresAt : null;

      await client.query(
        `INSERT INTO personal_subscriptions (
               user_id,
               plan,
               expires_at
             )
             VALUES ($1, $2, $3)`,
        [newUser.id, personalPlan, personalExpiresAt],
      );

      await auditLog({
        userId: newUser.id,
        companyId: null,
        action: "PERSONAL_USER_REGISTERED",
        entityType: "user",
        entityId: newUser.id,
        newValues: {
          email,
          role: "customer",
          trial_granted: trial.granted,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.requestId,
      });

      return {
        user: newUser,
        trial,
        personalPlan,
        personalExpiresAt,
      };
    });

    const user = registration.user;

    const refreshToken = generateRefreshToken(user);

    const tokenDigest = digestRefreshToken(refreshToken);

    const tokenHash = await bcrypt.hash(tokenDigest, 8);

    const sessionResult = await query(
      `INSERT INTO refresh_tokens (
           user_id,
           token_hash,
           token_digest,
           expires_at
         )
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
      [user.id, tokenHash, tokenDigest, getRefreshTokenExpiry()],
    );

    const accessToken = generateAccessToken(user, sessionResult.rows[0].id);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          phone_verified_at: user.phone_verified_at,
          company_id: user.company_id,
          personal_subscription_plan: registration.personalPlan,
          personal_subscription_expires_at: registration.personalExpiresAt,
          personal_trial_granted: registration.trial.granted,
          profile_image_url: user.profile_image_url,
          must_change_password: user.must_change_password,
        },
      },
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    if (isPersonalVerificationError(error)) {
      return respondPersonalVerificationError(res, error);
    }

    logger.error("Personal registration error", {
      code: error?.code || "UNEXPECTED",
    });

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
};

// ─── Add Personal Capability to an Existing Account ───────────
// Lets an existing Business-side user (agent/manager/owner/auditor) also
// gain Personal capability without creating a second account - Option A
// from the account-structure design. Idempotent: calling this again for
// someone who already has it just returns their existing subscription
// rather than erroring.

exports.addPersonalCapability = async (req, res) => {
  const { phone_verification_token, installation_id, sim_iccid } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query(
        `SELECT
                 id,
                 phone,
                 phone_verified_at
               FROM users
               WHERE id = $1
               FOR UPDATE`,
        [req.user.id],
      );

      if (userResult.rows.length === 0) {
        const error = new Error("User account was not found.");

        error.code = "PERSONAL_CAPABILITY_USER_NOT_FOUND";

        throw error;
      }

      const accountUser = userResult.rows[0];

      const existing = await client.query(
        `SELECT
                 plan,
                 expires_at
               FROM personal_subscriptions
               WHERE user_id = $1`,
        [req.user.id],
      );

      if (existing.rows.length > 0) {
        return {
          alreadyEnabled: true,
          plan: existing.rows[0].plan,
          expiresAt: existing.rows[0].expires_at,
          trialGranted: false,
        };
      }

      const verification = await consumePersonalPhoneVerification({
        verifiedToken: phone_verification_token,
        phone: accountUser.phone,
        installationId: installation_id || null,
        simIccid: sim_iccid || null,
      });

      const verifiedAt = new Date(verification.verifiedAt);

      if (Number.isNaN(verifiedAt.getTime())) {
        const error = new Error("Verified phone timestamp is invalid.");

        error.code = "PHONE_VERIFICATION_TOKEN_INVALID";

        throw error;
      }

      const verifiedUser = await client.query(
        `UPDATE users
               SET phone_verified_at =
                 COALESCE(
                   phone_verified_at,
                   $2
                 )
               WHERE id = $1
               RETURNING
                 phone,
                 phone_verified_at`,
        [req.user.id, verifiedAt],
      );

      const verifiedPhone = verifiedUser.rows[0];

      const trial = await grantPersonalTrial({
        dbClient: client,
        userId: req.user.id,
        source: "personal_capability",
        phone: verifiedPhone.phone,
        phoneVerifiedAt: verifiedPhone.phone_verified_at,
        installationId: installation_id || null,
        simIccid: sim_iccid || null,
      });

      const plan = trial.granted ? "paid" : "free";

      const expiresAt = trial.granted ? trial.expiresAt : null;

      const inserted = await client.query(
        `INSERT INTO personal_subscriptions (
                 user_id,
                 plan,
                 expires_at
               )
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id)
               DO NOTHING
               RETURNING
                 plan,
                 expires_at`,
        [req.user.id, plan, expiresAt],
      );

      let finalPlan = plan;

      let finalExpiresAt = expiresAt;

      let created = inserted.rows.length > 0;

      if (created === false) {
        const concurrent = await client.query(
          `SELECT
                   plan,
                   expires_at
                 FROM personal_subscriptions
                 WHERE user_id = $1`,
          [req.user.id],
        );

        if (concurrent.rows.length === 0) {
          throw new Error("Personal capability state could not be resolved.");
        }

        finalPlan = concurrent.rows[0].plan;

        finalExpiresAt = concurrent.rows[0].expires_at;
      }

      if (created) {
        await auditLog({
          userId: req.user.id,
          companyId: req.user.company_id,
          action: "PERSONAL_CAPABILITY_ADDED",
          entityType: "user",
          entityId: req.user.id,
          newValues: {
            trial_granted: trial.granted,
            personal_subscription_plan: finalPlan,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          requestId: req.requestId,
        });
      }

      return {
        alreadyEnabled: created === false,
        plan: finalPlan,
        expiresAt: finalExpiresAt,
        trialGranted: trial.granted && finalPlan === "paid",
      };
    });

    if (result.alreadyEnabled) {
      return res.json({
        success: true,
        message: "Personal capability is already enabled on this account.",
        data: {
          personal_subscription_plan: result.plan,
          personal_subscription_expires_at: result.expiresAt,
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: result.trialGranted
        ? "Personal capability enabled with your one-time trial."
        : "Personal capability enabled on the Free plan.",
      data: {
        personal_subscription_plan: result.plan,
        personal_subscription_expires_at: result.expiresAt,
        personal_trial_granted: result.trialGranted,
      },
    });
  } catch (error) {
    if (error?.code === "PERSONAL_CAPABILITY_USER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "User account was not found.",
      });
    }

    if (isPersonalVerificationError(error)) {
      return respondPersonalVerificationError(res, error);
    }

    logger.error("Add personal capability error", {
      code: error?.code || "UNEXPECTED",
    });

    return res.status(500).json({
      success: false,
      message: "Failed to enable Personal capability. Please try again.",
    });
  }
};

// ─── Login ────────────────────────────────────────────────────

exports.login = async (req, res) => {
  const { email, password, fcm_token, device_info } = req.body;

  try {
    // Fetch user with company subscription status
    const result = await query(
      `SELECT u.*, c.name as company_name, c.status as company_status,
              s.plan as subscription_plan, s.status as subscription_status,
              s.expires_at as subscription_expires_at,
              ps.plan as personal_subscription_plan,
              ps.expires_at as personal_subscription_expires_at
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN subscriptions s ON c.id = s.company_id
       LEFT JOIN personal_subscriptions ps ON ps.user_id = u.id
       WHERE u.email = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0] || null;

    // Always perform bcrypt verification, including when the email does not
    // exist, so account existence is not exposed by skipping password work.
    const comparisonHash =
      user?.password_hash ||
      LOGIN_DUMMY_PASSWORD_HASH;

    const passwordValid =
      await bcrypt.compare(
        password,
        comparisonHash
      );

    const now = new Date();

    const lockedUntil =
      user?.locked_until
        ? new Date(user.locked_until)
        : null;

    const isLocked =
      lockedUntil instanceof Date &&
      !Number.isNaN(lockedUntil.getTime()) &&
      lockedUntil > now;

    if (!user || !passwordValid) {
      // Preserve the existing atomic PostgreSQL failed-attempt counter for
      // real, currently-unlocked accounts. Locked accounts and nonexistent
      // accounts both return the same generic credential failure.
      if (user && !isLocked) {
        const maxAttempts = 5;
        const lockMinutes = 30;

        await query(
          `UPDATE users
           SET login_attempts = login_attempts + 1,
               locked_until = CASE
                 WHEN login_attempts + 1 >= $1
                 THEN NOW() + ($2 * INTERVAL '1 minute')
                 ELSE locked_until
               END
           WHERE id = $3
           RETURNING login_attempts, locked_until`,
          [
            maxAttempts,
            lockMinutes,
            user.id,
          ]
        );
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Only disclose lockout state after the caller has demonstrated knowledge
    // of the correct password for the account.
    if (isLocked) {
      const minutesLeft =
        Math.ceil(
          (lockedUntil - now) / 60000
        );

      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${minutesLeft} minute(s).`
      });
    }

    // Check account status
    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. You will receive an email once approved.'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (user.status === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated.'
      });
    }

    if (user.role === 'superuser') {
      try {
        assertMfaEncryptionConfigured();
      } catch (configurationError) {
        return res.status(503).json({
          success: false,
          code: 'MFA_TEMPORARILY_UNAVAILABLE',
          message:
            'Administrator authentication is temporarily unavailable.',
        });
      }

      if (
        user.mfa_enabled &&
        !user.mfa_totp_secret_enc
      ) {
        return res.status(503).json({
          success: false,
          code: 'MFA_CONFIGURATION_INVALID',
          message:
            'Administrator authentication is temporarily unavailable.',
        });
      }

      if (user.mfa_enabled) {
        const challengeToken =
          await createMfaChallenge({
            userId: user.id,
            purpose: 'verify',
            deviceInfo:
              device_info ?? null,
            fcmToken:
              fcm_token ?? null,
          });

        return res.status(202).json({
          success: true,
          code: 'MFA_REQUIRED',
          message:
            'Authenticator verification is required.',
          data: {
            mfa_required: true,
            mfa_enrollment_required: false,
            challenge_token: challengeToken,
          },
        });
      }

      const totpSecret =
        generateTotpSecret();

      const encryptedSecret =
        encryptTotpSecret(
          totpSecret,
        );

      const challengeToken =
        await createMfaChallenge({
          userId: user.id,
          purpose: 'enroll',
          secret: encryptedSecret,
          deviceInfo:
            device_info ?? null,
          fcmToken:
            fcm_token ?? null,
        });

      await auditLog({
        userId: user.id,
        companyId:
          user.company_id,
        action:
          'MFA_ENROLLMENT_STARTED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent:
          req.headers[
            'user-agent'
          ],
        requestId:
          req.requestId,
      });

      return res.status(202).json({
        success: true,
        code: 'MFA_ENROLLMENT_REQUIRED',
        message:
          'Authenticator enrollment is required.',
        data: {
          mfa_required: true,
          mfa_enrollment_required: true,
          challenge_token: challengeToken,
          enrollment: {
            secret: totpSecret,
            otpauth_uri:
              buildOtpAuthUri({
                secret: totpSecret,
                accountName:
                  user.email,
              }),
          },
        },
      });
    }

    // Create the durable refresh session before issuing its access
    // token. Every access token is bound to exactly one session row.
    const refreshToken = generateRefreshToken(user);
    const tokenDigest = digestRefreshToken(refreshToken);
    const tokenHash = await bcrypt.hash(tokenDigest, 8);

    const sessionResult = await query(
      `INSERT INTO refresh_tokens (
         user_id,
         token_hash,
         token_digest,
         expires_at,
         device_info
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        user.id,
        tokenHash,
        tokenDigest,
        getRefreshTokenExpiry(),
        device_info ? JSON.stringify(device_info) : null,
      ]
    );

    const accessToken = generateAccessToken(
      user,
      sessionResult.rows[0].id,
    );

    // Update FCM token and last login
    await query(
      `UPDATE users SET last_login_at = NOW(), login_attempts = 0,
       locked_until = NULL, fcm_token = COALESCE($1, fcm_token)
       WHERE id = $2`,
      [fcm_token || null, user.id]
    );

    await auditLog({
      userId: user.id,
      companyId: user.company_id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          company_id: user.company_id,
          company_name: user.company_name,
          subscription_plan: user.subscription_plan,
          subscription_status: user.subscription_status,
          subscription_expires_at: user.subscription_expires_at,
          personal_subscription_plan: user.personal_subscription_plan,
          personal_subscription_expires_at: user.personal_subscription_expires_at,
          profile_image_url: user.profile_image_url,
          telecel_operator_id: user.telecel_operator_id,
          must_change_password: user.must_change_password
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// ─── Complete Superuser MFA ──────────────────────────────────

exports.completeMfa = async (req, res) => {
  const challengeToken =
    String(
      req.body.challenge_token || '',
    ).trim();

  const totpCode =
    typeof req.body.code === 'string'
      ? req.body.code.trim()
      : '';

  const recoveryCode =
    typeof req.body.recovery_code === 'string'
      ? req.body.recovery_code.trim()
      : '';

  const makeMfaError = (
    code,
    message,
    statusCode = 401,
  ) => {
    const error =
      new Error(message);

    error.code = code;
    error.statusCode =
      statusCode;

    return error;
  };

  let challenge = null;

  try {
    assertMfaEncryptionConfigured();

    challenge =
      await getMfaChallenge(
        challengeToken,
      );

    if (!challenge) {
      return res.status(401).json({
        success: false,
        code: 'MFA_CHALLENGE_EXPIRED',
        message:
          'The MFA challenge has expired. Please sign in again.',
      });
    }

    if (
      challenge.purpose === 'enroll' &&
      !totpCode
    ) {
      return res.status(422).json({
        success: false,
        code: 'MFA_ENROLLMENT_TOTP_REQUIRED',
        message:
          'Enter the six-digit authenticator code to complete enrollment.',
      });
    }

    const result =
      await withTransaction(
        async (client) => {
          const userResult =
            await client.query(
              `SELECT
                 id,
                 company_id,
                 role,
                 first_name,
                 last_name,
                 email,
                 phone,
                 status,
                 profile_image_url,
                 telecel_operator_id,
                 must_change_password,
                 mfa_enabled,
                 mfa_enabled_at,
                 mfa_totp_secret_enc,
                 mfa_recovery_code_hashes,
                 mfa_last_totp_counter
               FROM users
               WHERE id = $1
               FOR UPDATE`,
              [challenge.userId],
            );

          if (
            userResult.rows.length !==
            1
          ) {
            throw makeMfaError(
              'MFA_USER_INVALID',
              'Administrator account is unavailable.',
            );
          }

          const user =
            userResult.rows[0];

          if (
            user.role !==
              'superuser' ||
            user.status !==
              'active'
          ) {
            throw makeMfaError(
              'MFA_USER_INVALID',
              'Administrator account is unavailable.',
            );
          }

          let recoveryCodes = null;
          let recoveryUsed = false;

          if (
            challenge.purpose ===
            'enroll'
          ) {
            if (user.mfa_enabled) {
              throw makeMfaError(
                'MFA_CHALLENGE_STALE',
                'MFA is already enabled. Please sign in again.',
                409,
              );
            }

            let secret;

            try {
              secret =
                decryptTotpSecret(
                  challenge.secret,
                );
            } catch (_) {
              throw makeMfaError(
                'MFA_CHALLENGE_INVALID',
                'The MFA challenge is invalid. Please sign in again.',
              );
            }

            const matchedTotpCounter =
              findMatchingTotpCounter(
                secret,
                totpCode,
              );

            if (
              matchedTotpCounter ===
              null
            ) {
              throw makeMfaError(
                'MFA_CODE_INVALID',
                'Invalid authenticator code.',
              );
            }

            const consumed =
              await consumeMfaChallenge(
                challengeToken,
              );

            if (
              !consumed ||
              consumed.userId !==
                challenge.userId ||
              consumed.purpose !==
                'enroll'
            ) {
              throw makeMfaError(
                'MFA_CHALLENGE_EXPIRED',
                'The MFA challenge has expired. Please sign in again.',
              );
            }

            recoveryCodes =
              generateRecoveryCodes();

            const recoveryHashes =
              hashRecoveryCodes(
                recoveryCodes,
              );

            await client.query(
              `UPDATE users
               SET mfa_enabled = TRUE,
                   mfa_enabled_at = NOW(),
                   mfa_totp_secret_enc = $1,
                   mfa_recovery_code_hashes = $2::jsonb,
                   mfa_last_totp_counter = $3,
                   updated_at = NOW()
               WHERE id = $4`,
              [
                challenge.secret,
                JSON.stringify(
                  recoveryHashes,
                ),
                matchedTotpCounter
                  .toString(),
                user.id,
              ],
            );

            // First enrollment invalidates every durable session that
            // predates MFA. Those sessions have no cryptographic proof that
            // the second factor was satisfied.
            await client.query(
              `UPDATE refresh_tokens
               SET revoked_at = COALESCE(
                 revoked_at,
                 NOW()
               )
               WHERE user_id = $1
                 AND revoked_at IS NULL`,
              [user.id],
            );

            user.mfa_enabled = true;
          } else if (
            challenge.purpose ===
            'verify'
          ) {
            if (
              !user.mfa_enabled ||
              !user.mfa_totp_secret_enc
            ) {
              throw makeMfaError(
                'MFA_NOT_ENROLLED',
                'Authenticator MFA is not enrolled. Please sign in again.',
              );
            }

            let valid = false;
            let recoveryIndex = -1;
            let matchedTotpCounter = null;

            if (totpCode) {
              let secret;

              try {
                secret =
                  decryptTotpSecret(
                    user.mfa_totp_secret_enc,
                  );
              } catch (_) {
                throw makeMfaError(
                  'MFA_CONFIGURATION_INVALID',
                  'Administrator authentication is temporarily unavailable.',
                  503,
                );
              }

              matchedTotpCounter =
                findMatchingTotpCounter(
                  secret,
                  totpCode,
                );

              const lastTotpCounter =
                user.mfa_last_totp_counter ==
                null
                  ? null
                  : BigInt(
                      user.mfa_last_totp_counter,
                    );

              valid =
                matchedTotpCounter !==
                  null &&
                (
                  lastTotpCounter ===
                    null ||
                  matchedTotpCounter >
                    lastTotpCounter
                );
            } else if (
              recoveryCode
            ) {
              recoveryIndex =
                findRecoveryCodeIndex(
                  recoveryCode,
                  user.mfa_recovery_code_hashes,
                );

              valid =
                recoveryIndex >= 0;
            }

            if (!valid) {
              throw makeMfaError(
                'MFA_CODE_INVALID',
                'Invalid MFA credential.',
              );
            }

            const consumed =
              await consumeMfaChallenge(
                challengeToken,
              );

            if (
              !consumed ||
              consumed.userId !==
                challenge.userId ||
              consumed.purpose !==
                'verify'
            ) {
              throw makeMfaError(
                'MFA_CHALLENGE_EXPIRED',
                'The MFA challenge has expired. Please sign in again.',
              );
            }

            if (
              matchedTotpCounter !==
              null
            ) {
              await client.query(
                `UPDATE users
                 SET mfa_last_totp_counter = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [
                  matchedTotpCounter
                    .toString(),
                  user.id,
                ],
              );
            }

            if (
              recoveryIndex >= 0
            ) {
              const remaining =
                Array.isArray(
                  user.mfa_recovery_code_hashes,
                )
                  ? [
                      ...user
                        .mfa_recovery_code_hashes,
                    ]
                  : [];

              remaining.splice(
                recoveryIndex,
                1,
              );

              await client.query(
                `UPDATE users
                 SET mfa_recovery_code_hashes = $1::jsonb,
                     updated_at = NOW()
                 WHERE id = $2`,
                [
                  JSON.stringify(
                    remaining,
                  ),
                  user.id,
                ],
              );

              recoveryUsed = true;
            }
          } else {
            throw makeMfaError(
              'MFA_CHALLENGE_INVALID',
              'The MFA challenge is invalid. Please sign in again.',
            );
          }

          const refreshToken =
            generateRefreshToken(
              user,
            );

          const tokenDigest =
            digestRefreshToken(
              refreshToken,
            );

          const tokenHash =
            await bcrypt.hash(
              tokenDigest,
              8,
            );

          const sessionResult =
            await client.query(
              `INSERT INTO refresh_tokens (
                 user_id,
                 token_hash,
                 token_digest,
                 expires_at,
                 device_info,
                 mfa_verified_at
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 NOW()
               )
               RETURNING id`,
              [
                user.id,
                tokenHash,
                tokenDigest,
                getRefreshTokenExpiry(),
                challenge.deviceInfo
                  ? JSON.stringify(
                      challenge.deviceInfo,
                    )
                  : null,
              ],
            );

          await client.query(
            `UPDATE users
             SET last_login_at = NOW(),
                 login_attempts = 0,
                 locked_until = NULL,
                 fcm_token = COALESCE(
                   $1,
                   fcm_token
                 )
             WHERE id = $2`,
            [
              challenge.fcmToken ?? null,
              user.id,
            ],
          );

          return {
            user,
            refreshToken,
            sessionId:
              sessionResult.rows[0]
                .id,
            recoveryCodes,
            recoveryUsed,
            enrolled:
              challenge.purpose ===
              'enroll',
          };
        },
      );

    const accessToken =
      generateAccessToken(
        result.user,
        result.sessionId,
      );

    await auditLog({
      userId:
        result.user.id,
      companyId:
        result.user.company_id,
      action: 'MFA_VERIFIED',
      entityType: 'user',
      entityId:
        result.user.id,
      ipAddress: req.ip,
      userAgent:
        req.headers[
          'user-agent'
        ],
      requestId:
        req.requestId,
    });

    if (result.enrolled) {
      await auditLog({
        userId:
          result.user.id,
        companyId:
          result.user.company_id,
        action: 'MFA_ENROLLED',
        entityType: 'user',
        entityId:
          result.user.id,
        ipAddress: req.ip,
        userAgent:
          req.headers[
            'user-agent'
          ],
        requestId:
          req.requestId,
      });
    }

    if (result.recoveryUsed) {
      await auditLog({
        userId:
          result.user.id,
        companyId:
          result.user.company_id,
        action:
          'MFA_RECOVERY_CODE_USED',
        entityType: 'user',
        entityId:
          result.user.id,
        ipAddress: req.ip,
        userAgent:
          req.headers[
            'user-agent'
          ],
        requestId:
          req.requestId,
      });
    }

    await auditLog({
      userId:
        result.user.id,
      companyId:
        result.user.company_id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId:
        result.user.id,
      ipAddress: req.ip,
      userAgent:
        req.headers[
          'user-agent'
        ],
      requestId:
        req.requestId,
    });

    return res.json({
      success: true,
      message:
        result.enrolled
          ? 'MFA enrollment complete'
          : 'Login successful',
      data: {
        access_token:
          accessToken,
        refresh_token:
          result.refreshToken,
        user: {
          id:
            result.user.id,
          role:
            result.user.role,
          first_name:
            result.user
              .first_name,
          last_name:
            result.user
              .last_name,
          email:
            result.user.email,
          phone:
            result.user.phone,
          company_id:
            result.user
              .company_id,
          profile_image_url:
            result.user
              .profile_image_url,
          telecel_operator_id:
            result.user
              .telecel_operator_id,
          must_change_password:
            result.user
              .must_change_password,
          mfa_enabled: true,
        },
        ...(result.recoveryCodes
          ? {
              recovery_codes:
                result.recoveryCodes,
            }
          : {}),
      },
    });
  } catch (error) {
    if (
      error.code ===
      'MFA_CODE_INVALID'
    ) {
      try {
        const failure =
          await recordMfaFailure(
            challengeToken,
          );

        if (challenge?.userId) {
          await auditLog({
            userId:
              challenge.userId,
            companyId: null,
            action:
              'MFA_VERIFICATION_FAILED',
            entityType:
              'user',
            entityId:
              challenge.userId,
            newValues: {
              locked:
                failure.locked,
            },
            ipAddress:
              req.ip,
            userAgent:
              req.headers[
                'user-agent'
              ],
            requestId:
              req.requestId,
          });
        }

        return res.status(401).json({
          success: false,
          code:
            failure.locked
              ? 'MFA_CHALLENGE_LOCKED'
              : 'MFA_CODE_INVALID',
          message:
            failure.locked
              ? 'Too many invalid MFA attempts. Please sign in again.'
              : 'Invalid MFA credential.',
          data: {
            remaining_attempts:
              failure.remaining,
          },
        });
      } catch (_) {
        return res.status(503).json({
          success: false,
          code:
            'MFA_TEMPORARILY_UNAVAILABLE',
          message:
            'Administrator authentication is temporarily unavailable.',
        });
      }
    }

    if (
      error.code ===
      'MFA_TEMPORARILY_UNAVAILABLE' ||
      error.code ===
      'MFA_ENCRYPTION_KEY_REQUIRED' ||
      error.code ===
      'MFA_CONFIGURATION_INVALID'
    ) {
      return res.status(503).json({
        success: false,
        code:
          'MFA_TEMPORARILY_UNAVAILABLE',
        message:
          'Administrator authentication is temporarily unavailable.',
      });
    }

    if (
      error.code &&
      error.code.startsWith(
        'MFA_',
      )
    ) {
      return res
        .status(
          error.statusCode || 401,
        )
        .json({
          success: false,
          code: error.code,
          message:
            error.message,
        });
    }

    logger.error(
      'MFA completion error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        'MFA verification failed. Please try again.',
    });
  }
};

// ─── Refresh Access Token ─────────────────────────────────────

// ─── FCM Device Registration ─────────────────────────────────

exports.updateFcmToken = async (req, res) => {
  const fcmToken = String(req.body.fcm_token || '').trim();

  try {
    await withTransaction(async (client) => {
      // One Firebase registration token represents one app installation.
      // Serialize assignment of the same token so concurrent account
      // switches cannot leave one device routed to multiple users.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [fcmToken]
      );

      // Remove stale ownership first. This prevents notifications for a
      // previous account on this phone from leaking to the current user.
      await client.query(
        `UPDATE users
         SET fcm_token = NULL
         WHERE fcm_token = $1
           AND id <> $2`,
        [fcmToken, req.user.id]
      );

      const updated = await client.query(
        `UPDATE users
         SET fcm_token = $1
         WHERE id = $2
         RETURNING id`,
        [fcmToken, req.user.id]
      );

      if (updated.rows.length !== 1) {
        throw new Error(
          'Authenticated user unavailable for FCM registration'
        );
      }
    });

    return res.json({
      success: true,
      message: 'Notification device registered'
    });
  } catch (error) {
    logger.error('FCM token registration error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to register notification device'
    });
  }
};

exports.refreshToken = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(401).json({ success: false, message: 'Refresh token required' });
  }

  try {
    // Verify refresh token signature
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    // Check the fast Redis blacklist first.
    const blacklisted = await isTokenBlacklisted(refresh_token);
    if (blacklisted) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    // A valid JWT signature is not sufficient on its own. PostgreSQL
    // remains authoritative for revocation and expiry, while the exact
    // SHA-256 digest identifies one durable refresh session without
    // bcrypt's 72-byte input truncation or a user-wide hash scan.
    const tokenDigest = digestRefreshToken(refresh_token);

    const storedTokens = await query(
      `SELECT
         id,
         mfa_verified_at
       FROM refresh_tokens
       WHERE user_id = $1
         AND token_digest = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [
        decoded.id,
        tokenDigest,
      ]
    );

    if (storedTokens.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is no longer valid',
      });
    }

    // The database unique index makes this impossible during normal
    // operation. Preserve a fail-closed integrity guard in case the
    // persistence contract is ever violated.
    if (storedTokens.rows.length > 1) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_AMBIGUOUS',
        message:
          'Refresh token matches more than one session. Please login again.',
      });
    }

    const matchedSession = storedTokens.rows[0];

    // Fetch user only after the refresh session itself has been validated.
    // Suspended/deactivated users cannot exchange even a still-stored token.
    const result = await query(
      `SELECT u.*, c.name as company_name
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1 AND u.status = 'active'`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    const user = result.rows[0];

    // A durable session created before mandatory MFA cannot be upgraded
    // merely by presenting its old refresh credential. Superusers must
    // return through password + MFA authentication.
    if (
      user.role === 'superuser' &&
      (
        !user.mfa_enabled ||
        !matchedSession.mfa_verified_at
      )
    ) {
      return res.status(401).json({
        success: false,
        code: 'MFA_REAUTH_REQUIRED',
        message:
          'Administrator MFA authentication is required. Please sign in again.',
      });
    }

    const newAccessToken = generateAccessToken(
      user,
      matchedSession.id,
    );

    res.json({
      success: true,
      data: { access_token: newAccessToken }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired. Please login again.',
      });
    }

    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'NotBeforeError'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    logger.error('Token refresh error:', error);

    return res.status(503).json({
      success: false,
      code: 'SESSION_REFRESH_TEMPORARILY_UNAVAILABLE',
      message: 'Unable to refresh session. Please try again.',
    });
  }
};

// ─── Logout ───────────────────────────────────────────────────

exports.logout = async (req, res) => {
  const authHeader = req.headers.authorization;
  const fcmToken =
    typeof req.body.fcm_token === 'string'
      ? req.body.fcm_token.trim()
      : '';

  try {
    const sessionId = req.user.session_id;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        message: 'Session is no longer valid',
        code: 'SESSION_REVOKED',
      });
    }

    // PostgreSQL is authoritative: revoke exactly the authenticated
    // device/session. Other devices keep their own refresh rows.
    await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND revoked_at IS NULL`,
      [sessionId, req.user.id]
    );

    // Stop routing pushes to this phone after explicit/session-ending
    // logout. Match the token so logging out an older installation
    // cannot clear a newer installation that has since claimed the
    // user's single current push destination.
    if (fcmToken) {
      await query(
        `UPDATE users
         SET fcm_token = NULL
         WHERE id = $1
           AND fcm_token = $2`,
        [req.user.id, fcmToken]
      );
    }

    // Keep Redis only as a fast cache. A Redis outage cannot undo the
    // durable database revocation above.
    if (authHeader) {
      const accessToken = authHeader.split(' ')[1];

      try {
        const decoded = jwt.decode(accessToken);

        if (decoded) {
          const expiresIn =
            decoded.exp - Math.floor(Date.now() / 1000);

          if (expiresIn > 0) {
            await blacklistToken(
              accessToken,
              expiresIn,
            );
          }
        }
      } catch (e) {
        // PostgreSQL already revoked the session.
      }
    }

    await auditLog({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);

    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const lookup = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (don't reveal if email exists).
    if (lookup.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If that email is registered, you will receive a password reset link shortly.'
      });
    }

    // Prepare the credential before taking the database row lock so bcrypt
    // work does not unnecessarily extend the transaction or lock duration.
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(resetToken, 8);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
    const userId = lookup.rows[0].id;

    const issuance = await withTransaction(async (client) => {
      // Lock the stable user row so all reset/setup-token replacement paths
      // serialize on the same per-user database row.
      const result = await client.query(
        `SELECT id, first_name, email, phone
         FROM users
         WHERE id = $1
           AND email = $2
         FOR UPDATE`,
        [userId, email.toLowerCase()]
      );

      // The account may have changed or disappeared between lookup and lock.
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );

      await client.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      return { user };
    });

    if (!issuance) {
      return res.json({
        success: true,
        message: 'If that email is registered, you will receive a password reset link shortly.'
      });
    }

    const { user } = issuance;

    // Notifications remain post-commit. Delivery failure must not roll back
    // the securely issued database credential.
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}&uid=${user.id}`;
    try {
      await sendPasswordResetEmail(user.email, user.first_name, resetUrl);
    } catch (emailErr) {
      logger.error("Failed to send password reset email:", emailErr);
    }

    if (user.phone) {
      try {
        await sendPasswordResetSMS(user.phone, user.first_name);
      } catch (smsErr) {
        logger.error("Failed to send password reset SMS:", smsErr);
      }
    }

    res.json({
      success: true,
      message: 'If that email is registered, you will receive a password reset link shortly.'
    });

  } catch (error) {
    logger.error('Password reset request error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
};

// ─── Reset Password ───────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  const { user_id, token, new_password } = req.body;

  try {
    // Hash before acquiring the reset-token row lock so bcrypt does not
    // unnecessarily extend the PostgreSQL critical section.
    const passwordHash = await bcrypt.hash(
      new_password,
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    const resetResult = await withTransaction(async (client) => {
      // Serialize concurrent attempts to consume the same reset credential.
      const result = await client.query(
        `SELECT *
         FROM password_reset_tokens
         WHERE user_id = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [user_id]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          reason: 'INVALID_OR_EXPIRED'
        };
      }

      const storedToken = result.rows[0];
      const tokenValid = await bcrypt.compare(
        token,
        storedToken.token_hash
      );

      if (!tokenValid) {
        return {
          success: false,
          reason: 'INVALID_TOKEN'
        };
      }

      await client.query(
        `UPDATE users
         SET password_hash = $1,
             login_attempts = 0,
             locked_until = NULL,
             must_change_password = false,
             updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, user_id]
      );

      const consumeResult = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE id = $1
           AND used_at IS NULL`,
        [storedToken.id]
      );

      if (consumeResult.rowCount !== 1) {
        const error = new Error(
          'Password reset token was not consumed'
        );
        error.code = 'PASSWORD_RESET_TOKEN_CONSUME_CONFLICT';
        throw error;
      }

      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user_id]
      );

      return { success: true };
    });

    if (!resetResult.success) {
      if (resetResult.reason === 'INVALID_OR_EXPIRED') {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset link. Please request a new one.'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    await auditLog({
      userId: user_id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user_id,
      ipAddress: req.ip,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.'
    });

  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

function cloudinaryPublicIdFromUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    const marker = '/upload/';
    const markerIndex =
      parsed.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    let remainder =
      decodeURIComponent(
        parsed.pathname.slice(
          markerIndex + marker.length,
        ),
      );

    const segments =
      remainder
        .split('/')
        .filter(Boolean);

    if (
      segments.length > 0 &&
      /^v\d+$/.test(segments[0])
    ) {
      segments.shift();
    }

    if (segments.length === 0) {
      return null;
    }

    const filename =
      segments.pop();

    const publicFilename =
      filename.replace(
        /\.[^.\/]+$/,
        '',
      );

    if (!publicFilename) {
      return null;
    }

    segments.push(publicFilename);

    return segments.join('/');
  } catch (_) {
    return null;
  }
}

function addDeletionMediaAsset(
  assets,
  value,
  resourceType,
) {
  const publicId =
    cloudinaryPublicIdFromUrl(value);

  if (!publicId) {
    return;
  }

  assets.push({
    publicId,
    resourceType,
  });
}

exports.deleteAccount = async (
  req,
  res,
) => {
  const password =
    String(
      req.body?.password || '',
    );

  try {
    const deletion =
      await withTransaction(
        async (client) => {
          const userResult =
            await client.query(
              `SELECT
                 id,
                 role,
                 company_id,
                 password_hash,
                 profile_image_url,
                 account_deleted_at
               FROM users
               WHERE id = $1
               FOR UPDATE`,
              [req.user.id],
            );

          if (
            userResult.rows.length === 0
          ) {
            return {
              statusCode: 404,
              success: false,
              code: 'ACCOUNT_NOT_FOUND',
              message:
                'Account not found.',
            };
          }

          const user =
            userResult.rows[0];

          if (
            user.account_deleted_at
          ) {
            return {
              statusCode: 410,
              success: false,
              code:
                'ACCOUNT_ALREADY_DELETED',
              message:
                'This account has already been deleted.',
            };
          }

          if (
            user.role === 'superuser'
          ) {
            return {
              statusCode: 403,
              success: false,
              code:
                'SUPERUSER_SELF_DELETION_FORBIDDEN',
              message:
                'Administrator accounts cannot be deleted from the mobile app.',
            };
          }

          const passwordValid =
            await bcrypt.compare(
              password,
              user.password_hash,
            );

          if (!passwordValid) {
            return {
              statusCode: 401,
              success: false,
              code:
                'ACCOUNT_DELETION_PASSWORD_INVALID',
              message:
                'Current password is incorrect.',
            };
          }

          const openShift =
            await client.query(
              `SELECT id
               FROM shifts
               WHERE agent_id = $1
                 AND status = 'open'
               LIMIT 1`,
              [user.id],
            );

          if (
            openShift.rows.length > 0
          ) {
            return {
              statusCode: 409,
              success: false,
              code:
                'ACCOUNT_DELETION_OPEN_SHIFT',
              message:
                'Close your open shift before deleting your account.',
            };
          }

          const replacementPassword =
            crypto
              .randomBytes(48)
              .toString('hex');

          const replacementPasswordHash =
            await bcrypt.hash(
              replacementPassword,
              parseInt(
                process.env.BCRYPT_ROUNDS,
                10,
              ) || 12,
            );

          const mediaAssets = [];

          addDeletionMediaAsset(
            mediaAssets,
            user.profile_image_url,
            'image',
          );

          const adMediaResult =
            await client.query(
              `SELECT
                 image_urls,
                 video_url
               FROM advertisements
               WHERE posted_by = $1`,
              [user.id],
            );

          for (
            const row
            of adMediaResult.rows
          ) {
            for (
              const imageUrl
              of row.image_urls || []
            ) {
              addDeletionMediaAsset(
                mediaAssets,
                imageUrl,
                'image',
              );
            }

            addDeletionMediaAsset(
              mediaAssets,
              row.video_url,
              'video',
            );
          }

          const agentVoiceResult =
            await client.query(
              `SELECT audio_url
               FROM agent_posts
               WHERE author_id = $1
                 AND audio_url IS NOT NULL`,
              [user.id],
            );

          for (
            const row
            of agentVoiceResult.rows
          ) {
            addDeletionMediaAsset(
              mediaAssets,
              row.audio_url,
              'video',
            );
          }

          const personalVoiceResult =
            await client.query(
              `SELECT audio_url
               FROM personal_posts
               WHERE author_id = $1
                 AND audio_url IS NOT NULL`,
              [user.id],
            );

          for (
            const row
            of personalVoiceResult.rows
          ) {
            addDeletionMediaAsset(
              mediaAssets,
              row.audio_url,
              'video',
            );
          }

          await client.query(
            `UPDATE personal_trial_entitlements
             SET user_id = NULL
             WHERE user_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE personal_transactions
             SET recipient_phone = NULL,
                 sim_iccid = NULL,
                 sim_slot = NULL,
                 notes = NULL,
                 failure_reason = NULL,
                 ussd_session_log = NULL,
                 client_operation_id = NULL,
                 client_operation_fingerprint = NULL
             WHERE user_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE personal_subscription_payments
             SET payment_phone = NULL,
                 authorization_url = NULL
             WHERE user_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE agent_posts
             SET content = '[deleted]',
                 audio_url = NULL,
                 status = 'removed',
                 removed_reason =
                   'Account deleted'
             WHERE author_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE agent_post_comments
             SET content = '[deleted]'
             WHERE author_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE personal_posts
             SET content = '[deleted]',
                 audio_url = NULL,
                 status = 'removed',
                 removed_reason =
                   'Account deleted'
             WHERE author_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE personal_post_comments
             SET content = '[deleted]'
             WHERE author_id = $1`,
            [user.id],
          );

          await client.query(
            `UPDATE advertisements
             SET title = 'Deleted listing',
                 description =
                   'Listing removed after account deletion.',
                 location = NULL,
                 contact_phone = NULL,
                 contact_email = NULL,
                 image_urls = '{}'::TEXT[],
                 video_url = NULL,
                 status = CASE
                   WHEN status IN (
                     'draft',
                     'pending_review',
                     'pending_payment',
                     'active'
                   )
                   THEN 'suspended'::ad_status
                   ELSE status
                 END,
                 updated_at = NOW()
             WHERE posted_by = $1`,
            [user.id],
          );

          const deleteQueries = [
            `DELETE FROM
               marketplace_conversations
             WHERE customer_id = $1
                OR seller_id = $1`,
            `DELETE FROM
               marketplace_saved_ads
             WHERE user_id = $1`,
            `DELETE FROM
               advertisement_views
             WHERE viewed_by = $1`,
            `DELETE FROM
               ad_ratings
             WHERE rated_by = $1`,
            `DELETE FROM
               agent_post_likes
             WHERE user_id = $1`,
            `DELETE FROM
               agent_post_comment_reactions
             WHERE user_id = $1`,
            `DELETE FROM
               personal_post_likes
             WHERE user_id = $1`,
            `DELETE FROM
               personal_post_comment_reactions
             WHERE user_id = $1`,
            `DELETE FROM
               agent_post_reports
             WHERE reported_by = $1`,
            `DELETE FROM
               agent_comment_reports
             WHERE reported_by = $1`,
            `DELETE FROM
               agent_community_blocks
             WHERE blocker_id = $1
                OR blocked_user_id = $1`,
            `DELETE FROM
               agent_saved_posts
             WHERE user_id = $1`,
            `DELETE FROM
               notifications
             WHERE user_id = $1`,
            `DELETE FROM
               ai_conversations
             WHERE user_id = $1`,
            `DELETE FROM
               personal_subscriptions
             WHERE user_id = $1`,
            `DELETE FROM
               user_sim_purposes
             WHERE user_id = $1`,
            `DELETE FROM
               agent_sim_registry
             WHERE agent_id = $1`,
            `DELETE FROM
               agent_ussd_overrides
             WHERE agent_id = $1`,
            `DELETE FROM
               ussd_flows
             WHERE owner_user_id = $1`,
            `DELETE FROM
               branch_managers
             WHERE manager_id = $1`,
            `DELETE FROM
               agent_branches
             WHERE agent_id = $1`,
            `DELETE FROM
               password_reset_tokens
             WHERE user_id = $1`,
            `DELETE FROM
               refresh_tokens
             WHERE user_id = $1`,
          ];

          for (
            const sql
            of deleteQueries
          ) {
            await client.query(
              sql,
              [user.id],
            );
          }

          await client.query(
            `UPDATE users
             SET first_name = 'Deleted',
                 last_name = 'User',
                 email =
                   'deleted+' ||
                   REPLACE(
                     id::text,
                     '-',
                     ''
                   ) ||
                   '@deleted.agentpro.invalid',
                 phone = NULL,
                 password_hash = $1,
                 ghana_card_number = NULL,
                 profile_image_url = NULL,
                 status = 'deactivated',
                 last_login_at = NULL,
                 login_attempts = 0,
                 locked_until = NULL,
                 fcm_token = NULL,
                 must_change_password = FALSE,
                 telecel_operator_id = NULL,
                 agent_quick_actions =
                   '{}'::jsonb,
                 personal_quick_actions =
                   '{}'::jsonb,
                 evd_quick_actions =
                   '{}'::jsonb,
                 merchant_quick_actions =
                   '{}'::jsonb,
                 mfa_enabled = FALSE,
                 mfa_enabled_at = NULL,
                 mfa_totp_secret_enc = NULL,
                 mfa_recovery_code_hashes =
                   '[]'::jsonb,
                 mfa_last_totp_counter = NULL,
                 phone_verified_at = NULL,
                 account_deleted_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            [
              replacementPasswordHash,
              user.id,
            ],
          );

          await auditLog({
            userId: user.id,
            companyId:
              user.company_id,
            action:
              'ACCOUNT_DELETED',
            entityType: 'user',
            entityId: user.id,
            newValues: {
              account_deleted: true,
              retained_records: [
                'financial',
                'transaction',
                'fraud_prevention',
                'security',
                'audit',
              ],
            },
            ipAddress: req.ip,
            userAgent:
              req.headers[
                'user-agent'
              ],
            requestId:
              req.requestId,
            dbClient: client,
            strict: true,
          });

          return {
            statusCode: 200,
            success: true,
            mediaAssets,
          };
        },
      );

    if (!deletion.success) {
      return res
        .status(
          deletion.statusCode,
        )
        .json({
          success: false,
          code: deletion.code,
          message:
            deletion.message,
        });
    }

    const uniqueAssets =
      Array.from(
        new Map(
          deletion.mediaAssets.map(
            (asset) => [
              `${asset.resourceType}:${asset.publicId}`,
              asset,
            ],
          ),
        ).values(),
      );

    let mediaCleanupFailures = 0;

    if (uniqueAssets.length > 0) {
      const cleanupResults =
        await Promise.allSettled(
          uniqueAssets.map(
            (asset) =>
              deleteCloudinaryFile(
                asset.publicId,
                {
                  resource_type:
                    asset.resourceType,
                  invalidate: true,
                },
              ),
          ),
        );

      mediaCleanupFailures =
        cleanupResults.filter(
          (result) =>
            result.status ===
            'rejected',
        ).length;
    }

    if (
      mediaCleanupFailures > 0
    ) {
      logger.error(
        'Account deletion media cleanup incomplete',
        {
          failed_asset_count:
            mediaCleanupFailures,
          requestId:
            req.requestId,
        },
      );
    }

    return res.status(200).json({
      success: true,
      code: 'ACCOUNT_DELETED',
      message:
        'Your AgentPro account has been permanently deleted.',
      data: {
        media_cleanup_pending:
          mediaCleanupFailures > 0,
        retained_record_categories: [
          'financial',
          'transaction',
          'fraud_prevention',
          'security',
          'audit',
        ],
      },
    });
  } catch (error) {
    logger.error(
      'Account deletion error:',
      error,
    );

    return res.status(500).json({
      success: false,
      code:
        'ACCOUNT_DELETION_FAILED',
      message:
        'Your account could not be deleted. Please try again.',
    });
  }
};

// ─── Get Current User Profile ─────────────────────────────────

exports.getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.role, u.first_name, u.last_name, u.email, u.phone,
              u.ghana_card_number, u.profile_image_url, u.status, u.last_login_at,
              u.company_id, c.name as company_name, c.status as company_status,
              s.plan as subscription_plan, s.status as subscription_status,
              s.expires_at as subscription_expires_at,
              ps.plan as personal_subscription_plan,
              ps.expires_at as personal_subscription_expires_at
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN subscriptions s ON c.id = s.company_id
       LEFT JOIN personal_subscriptions ps ON ps.user_id = u.id
       WHERE u.id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};
