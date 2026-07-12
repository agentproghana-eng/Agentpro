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

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      company_id: user.company_id,
      email: user.email
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
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

// ─── Login ────────────────────────────────────────────────────

exports.login = async (req, res) => {
  const { email, password, fcm_token, device_info } = req.body;

  try {
    // Fetch user with company subscription status
    const result = await query(
      `SELECT u.*, c.name as company_name, c.status as company_status,
              s.plan as subscription_plan, s.status as subscription_status,
              s.expires_at as subscription_expires_at
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN subscriptions s ON c.id = s.company_id
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

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info)
       VALUES ($1, $2, $3, $4)`,
      [user.id, tokenHash, getRefreshTokenExpiry(), device_info ? JSON.stringify(device_info) : null]
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
          profile_image_url: user.profile_image_url,
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

    // Check if blacklisted
    const blacklisted = await isTokenBlacklisted(refresh_token);
    if (blacklisted) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    // Fetch user
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
    const newAccessToken = generateAccessToken(user);

    res.json({
      success: true,
      data: { access_token: newAccessToken }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Refresh token expired. Please login again.' });
    }
    logger.error('Token refresh error:', error);
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
};

// ─── Logout ───────────────────────────────────────────────────

exports.logout = async (req, res) => {
  const { refresh_token } = req.body;
  const authHeader = req.headers.authorization;

  try {
    // Blacklist access token
    if (authHeader) {
      const accessToken = authHeader.split(' ')[1];
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded) {
          const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
          if (expiresIn > 0) {
            await blacklistToken(accessToken, expiresIn);
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Revoke refresh token
    if (refresh_token) {
      const tokenHash = await bcrypt.hash(refresh_token, 8);
      await query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [req.user.id]
      );
      await blacklistToken(refresh_token, 30 * 24 * 3600);
    }

    await auditLog({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
      requestId: req.requestId
    });

    res.json({ success: true, message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

// ─── Request Password Reset ───────────────────────────────────

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
        'UPDATE users SET password_hash = $1, login_attempts = 0, locked_until = NULL WHERE id = $2',
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
              s.expires_at as subscription_expires_at
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN subscriptions s ON c.id = s.company_id
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
