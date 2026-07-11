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

    // Check blacklist
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please login again.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Attach user to request
    req.user = {
      id: decoded.id,
      role: decoded.role,
      company_id: decoded.company_id,
      email: decoded.email
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
    return res.status(500).json({ success: false, message: 'Authentication failed' });
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
  blockAuditor
};
