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

// ─── Business Owner Registration ─────────────────────────────

exports.register = async (req, res) => {
  const {
    company_name,
    registration_number,
    company_phone,
    company_email,
    first_name,
    last_name,
    phone,
    email,
    password,
    ghana_card_number
  } = req.body;

  try {
    // Check email uniqueness
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await withTransaction(async (client) => {
      // Create company
      const companyResult = await client.query(
        `INSERT INTO companies (name, registration_number, phone, email, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [company_name, registration_number, company_phone, company_email || email]
      );
      const companyId = companyResult.rows[0].id;

      // Create business owner user
      const userResult = await client.query(
        `INSERT INTO users (
          company_id, role, first_name, last_name, email,
          phone, password_hash, ghana_card_number, status
        ) VALUES ($1, 'business_owner', $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id, email, role, status`,
        [companyId, first_name, last_name, email.toLowerCase(), phone, passwordHash, ghana_card_number]
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

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Your account is pending approval. You will be notified once approved.'
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// ─── Personal Subscriber Registration ────────────────────────
// Lightweight, no company involved and no superuser approval gate -
// unlike the Business Owner path above, a Personal account activates
// immediately. Auto-logs the new user in on success (same token/response
// shape as login()) since there's no pending-approval wait to justify a
// separate login step right after.

exports.registerPersonal = async (req, res) => {
  const { first_name, last_name, phone, email, password } = req.body;
  // New Personal Subscribers get 7 days of full Paid access to try
  // everything before deciding whether to pay - reuses the existing
  // plan/expires_at mechanism exactly as a real subscription would, so
  // the daily expirePersonalSubscriptions job auto-reverts this trial
  // to Free with zero new logic needed. Computed once here (rather
  // than via SQL's NOW()) so the exact same value can be used in both
  // the INSERT below and the response JSON without a second query.
  const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const user = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (
          role, first_name, last_name, email, phone, password_hash, status
        ) VALUES ('customer', $1, $2, $3, $4, $5, 'active')
        RETURNING id, role, first_name, last_name, email, phone, company_id, profile_image_url, must_change_password`,
        [first_name, last_name, email.toLowerCase(), phone, passwordHash]
      );
      const newUser = userResult.rows[0];

      await client.query(
        `INSERT INTO personal_subscriptions (user_id, plan, expires_at) VALUES ($1, 'paid', $2)`,
        [newUser.id, trialExpiresAt]
      );

      await auditLog({
        userId: newUser.id,
        companyId: null,
        action: 'PERSONAL_USER_REGISTERED',
        entityType: 'user',
        entityId: newUser.id,
        newValues: { email, role: 'customer' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId
      });

      return newUser;
    });

    // Auto-login: persist the durable session first, then bind the
    // access token to that exact refresh-session row.
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
      [
        user.id,
        tokenHash,
        tokenDigest,
        getRefreshTokenExpiry(),
      ]
    );

    const accessToken = generateAccessToken(
      user,
      sessionResult.rows[0].id,
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
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
          personal_subscription_plan: 'paid',
          personal_subscription_expires_at: trialExpiresAt,
          profile_image_url: user.profile_image_url,
          must_change_password: user.must_change_password,
        }
      }
    });

  } catch (error) {
    logger.error('Personal registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// ─── Add Personal Capability to an Existing Account ───────────
// Lets an existing Business-side user (agent/manager/owner/auditor) also
// gain Personal capability without creating a second account - Option A
// from the account-structure design. Idempotent: calling this again for
// someone who already has it just returns their existing subscription
// rather than erroring.

exports.addPersonalCapability = async (req, res) => {
  try {
    const existing = await query(
      'SELECT plan, expires_at FROM personal_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Personal capability is already enabled on this account.',
        data: {
          personal_subscription_plan: existing.rows[0].plan,
          personal_subscription_expires_at: existing.rows[0].expires_at,
        }
      });
    }

    // Same 7-day trial as new registrations - reuses the existing
    // plan/expires_at mechanism, no new logic needed.
    const inserted = await query(
      `INSERT INTO personal_subscriptions (user_id, plan, expires_at)
       VALUES ($1, 'paid', NOW() + INTERVAL '7 days')
       RETURNING plan, expires_at`,
      [req.user.id]
    );

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'PERSONAL_CAPABILITY_ADDED',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    });

    res.status(201).json({
      success: true,
      message: 'Personal capability enabled — you get 7 days of full Paid access to try everything, then it reverts to Free unless you subscribe.',
      data: {
        personal_subscription_plan: inserted.rows[0].plan,
        personal_subscription_expires_at: inserted.rows[0].expires_at,
      }
    });

  } catch (error) {
    logger.error('Add personal capability error:', error);
    res.status(500).json({ success: false, message: 'Failed to enable Personal capability. Please try again.' });
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

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${minutesLeft} minute(s).`
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      const maxAttempts = 5;
      const lockMinutes = 30;

      // Increment in PostgreSQL itself so concurrent failed logins cannot
      // overwrite one another with the same application-computed value.
      // PostgreSQL remains authoritative for account lockout state.
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

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
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
    const result = await query(
      'SELECT id, first_name, email, phone FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (don't reveal if email exists)
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If that email is registered, you will receive a password reset link shortly.'
      });
    }

    const user = result.rows[0];
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(resetToken, 8);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    // Invalidate existing tokens
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Store new token
    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    // Send email - wrapped defensively so a notification failure does
    // not turn into a 500 for the whole password-reset request
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
    const result = await query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link. Please request a new one.'
      });
    }

    const storedToken = result.rows[0];
    const tokenValid = await bcrypt.compare(token, storedToken.token_hash);

    if (!tokenValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    const passwordHash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await withTransaction(async (client) => {
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
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [storedToken.id]
      );
      // Revoke all refresh tokens
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1',
        [user_id]
      );
    });

    await auditLog({
      userId: user_id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user_id,
      ipAddress: req.ip,
      requestId: req.requestId
    });

    res.json({ success: true, message: 'Password reset successfully. Please login with your new password.' });

  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
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
