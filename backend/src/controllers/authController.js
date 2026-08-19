const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { blacklistToken, isTokenBlacklisted } = require('../config/redis');
const { logger } = require('../utils/logger');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendPasswordResetSMS } = require('../services/smsService');
const { auditLog } = require('../services/auditService');

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
      logger.info(`New Business Owner registration: ${email} — ${company_name}`);
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
    const tokenHash = await bcrypt.hash(refreshToken, 8);

    const sessionResult = await query(
      `INSERT INTO refresh_tokens (
         user_id,
         token_hash,
         expires_at
       )
       VALUES ($1, $2, $3)
       RETURNING id`,
      [user.id, tokenHash, getRefreshTokenExpiry()]
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
      // Increment failed attempts
      const maxAttempts = 5;
      const newAttempts = user.login_attempts + 1;
      let lockUntil = null;

      if (newAttempts >= maxAttempts) {
        const lockMinutes = 30;
        lockUntil = new Date(Date.now() + lockMinutes * 60000);
      }

      await query(
        'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockUntil, user.id]
      );

      return res.status(401).json({ success: false, message: 'Invalid email or password' });
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

    // Create the durable refresh session before issuing its access
    // token. Every access token is bound to exactly one session row.
    const refreshToken = generateRefreshToken(user);
    const tokenHash = await bcrypt.hash(refreshToken, 8);

    const sessionResult = await query(
      `INSERT INTO refresh_tokens (
         user_id,
         token_hash,
         expires_at,
         device_info
       )
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        user.id,
        tokenHash,
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

// ─── Refresh Access Token ─────────────────────────────────────

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

    // A valid JWT signature is not sufficient on its own. Refresh tokens
    // are persisted as bcrypt hashes so password changes, logout, staff
    // suspension/deactivation, and other server-side revocations remain
    // authoritative even if the signed token has not expired yet.
    const storedTokens = await query(
      `SELECT id, token_hash
       FROM refresh_tokens
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [decoded.id]
    );

    const matchedSessions = [];

    for (const storedToken of storedTokens.rows) {
      if (
        await bcrypt.compare(
          refresh_token,
          storedToken.token_hash,
        )
      ) {
        matchedSessions.push(storedToken);
      }
    }

    if (matchedSessions.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is no longer valid',
      });
    }

    // Legacy refresh tokens were issued before each credential carried a
    // unique jti. If one presented credential matches more than one active
    // session row, selecting either session would defeat per-device
    // revocation. Fail closed and require a fresh login instead.
    if (matchedSessions.length > 1) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_AMBIGUOUS',
        message:
          'Refresh token matches more than one session. Please login again.',
      });
    }

    const matchedSession = matchedSessions[0];

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
