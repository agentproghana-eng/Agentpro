const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../config/redis');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

// ─── JWT Authentication Middleware ────────────────────────────

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify the JWT before doing any external lookup.
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET,
    );

    const sessionId =
      typeof decoded.session_id === 'string'
        ? decoded.session_id.trim()
        : '';

    // Access tokens issued before durable session binding deliberately
    // fail closed. Clients may exchange their still-valid persisted
    // refresh token for a new session-bound access token.
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        message: 'Session must be refreshed. Please try again.',
        code: 'SESSION_REFRESH_REQUIRED',
      });
    }

    // Redis remains a fast revocation/cache layer, but it is no longer
    // the security authority. A Redis miss or outage cannot bypass the
    // PostgreSQL session check below.
    const blacklisted = await isTokenBlacklisted(token);

    if (blacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please login again.',
        code: 'SESSION_REVOKED',
      });
    }

    // Every access token is bound to exactly one persisted refresh-session
    // row. This makes logout, password reset and staff revocation durable
    // even when Redis is unavailable.
    //
    // Role, company and email also come from PostgreSQL rather than stale
    // JWT claims, so privilege changes take effect immediately.
    const sessionResult = await query(
      `SELECT
         u.id,
         u.role,
         u.company_id,
         u.email,
         u.status,
         rt.id AS session_id
       FROM users u
       JOIN refresh_tokens rt
         ON rt.user_id = u.id
       WHERE u.id = $1
         AND u.status = 'active'
         AND rt.id = $2
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
       LIMIT 1`,
      [decoded.id, sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked or is no longer active.',
        code: 'SESSION_REVOKED',
      });
    }

    const activeSession = sessionResult.rows[0];

    req.user = {
      id: activeSession.id,
      role: activeSession.role,
      company_id: activeSession.company_id,
      email: activeSession.email,
      session_id: activeSession.session_id,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }

    logger.error('Auth middleware error:', error);

    // Database/session verification failures must fail closed.
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

// ─── Role-Based Access Control ────────────────────────────────

/**
 * Allow only specified roles
 * Usage: authorize('superuser', 'business_owner')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

/**
 * Ensure user belongs to the company in the route param
 * Superuser bypasses this check
 */
const requireSameCompany = async (req, res, next) => {
  if (req.user.role === 'superuser') return next();

  const companyId = req.params.company_id || req.body.company_id;

  if (companyId && req.user.company_id !== companyId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own company data.'
    });
  }

  next();
};

/**
 * Check active subscription for business features
 */
const requireActiveSubscription = async (req, res, next) => {
  if (req.user.role === 'superuser') return next();

  try {
    const result = await query(
      `SELECT s.plan, s.status, s.expires_at
       FROM subscriptions s
       WHERE s.company_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No subscription found. Please subscribe to access this feature.',
        code: 'NO_SUBSCRIPTION'
      });
    }

    const sub = result.rows[0];

    if (sub.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has been suspended. Please renew to continue.',
        code: 'SUBSCRIPTION_SUSPENDED'
      });
    }

    if (sub.plan === "free") {
      const trialActive = sub.expires_at && new Date(sub.expires_at) > new Date();
      if (!trialActive) {
        return res.status(403).json({
          success: false,
          message: "Your 30-day free trial has ended. Please subscribe to the Business Plan to continue.",
          code: "TRIAL_EXPIRED"
        });
      }
      req.subscription = sub;
      return next();
    }

    if (sub.status !== 'active' && sub.status !== 'grace_period') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription is not active. Please renew.',
        code: 'SUBSCRIPTION_INACTIVE'
      });
    }

    req.subscription = sub;
    next();
  } catch (error) {
    logger.error('Subscription check error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify subscription' });
  }
};

/**
 * Ensure the authenticated user has Personal Subscriber capability
 * enabled (a personal_subscriptions row exists) - independent of their
 * business role, if any. Attaches req.personalSubscription = { plan,
 * expires_at } for downstream use. This only gates "has Personal
 * capability at all" - Free vs Paid plan gating for specific premium
 * features (Reports, USSD Automation, Custom Flows) is a separate,
 * stricter check layered on top where it's actually needed.
 */
const requirePersonalAccount = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT plan, expires_at FROM personal_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Personal account capability is not enabled for this user.',
        code: 'PERSONAL_ACCOUNT_REQUIRED'
      });
    }
    req.personalSubscription = result.rows[0];
    next();
  } catch (error) {
    logger.error('Personal account check error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify personal account status' });
  }
};

/**
 * Ensure the authenticated Personal Subscriber is on the paid plan (not
 * free) and it hasn't expired. Must be used after requirePersonalAccount,
 * which already attaches req.personalSubscription - this just checks
 * its plan/expiry rather than re-querying. Reusable anywhere a feature
 * is Paid-Personal-only (Community posting/commenting now, Reports/
 * USSD Automation/Custom Flows for Personal users later).
 */
const requirePaidPersonalPlan = (req, res, next) => {
  const sub = req.personalSubscription;
  if (!sub || sub.plan !== 'paid' || (sub.expires_at && new Date(sub.expires_at) < new Date())) {
    return res.status(403).json({
      success: false,
      message: 'This feature requires an active Personal subscription (GH₵5/month).',
      code: 'PERSONAL_SUBSCRIPTION_REQUIRED'
    });
  }
  next();
};

/**
 * Ensure auditor only reads (no write access)
 */
const blockAuditor = (req, res, next) => {
  if (req.user.role === 'auditor' && req.method !== 'GET') {
    return res.status(403).json({
      success: false,
      message: 'Auditors have read-only access'
    });
  }
  next();
};

module.exports = {
  authenticate,
  authorize,
  requireSameCompany,
  requireActiveSubscription,
  requirePersonalAccount,
  requirePaidPersonalPlan,
  blockAuditor
};
