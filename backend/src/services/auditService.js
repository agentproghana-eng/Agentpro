const { query } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Record an audit log entry.
 *
 * Default behaviour remains best-effort for ordinary operational events:
 * audit failure is logged but does not break the application.
 *
 * Financial/security-critical callers may provide the PostgreSQL transaction
 * client through dbClient and set strict=true. In that mode:
 *
 * - the audit INSERT uses the caller's exact database transaction;
 * - an audit failure is re-thrown;
 * - PostgreSQL therefore rolls back both the financial mutation and audit.
 */
async function auditLog({
  userId,
  companyId,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
  requestId,
  result = 'success',
  errorMessage,
  dbClient = null,
  strict = false
}) {
  const executeQuery =
    dbClient && typeof dbClient.query === 'function'
      ? dbClient.query.bind(dbClient)
      : query;

  try {
    await executeQuery(
      `INSERT INTO audit_logs (
        user_id, company_id, action, entity_type, entity_id,
        old_values, new_values, ip_address, user_agent,
        request_id, result, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId || null,
        companyId || null,
        action,
        entityType || null,
        entityId || null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress || null,
        userAgent || null,
        requestId || null,
        result,
        errorMessage || null
      ]
    );
  } catch (error) {
    logger.error('Audit log write error:', error);

    if (strict) {
      throw error;
    }
  }
}

module.exports = { auditLog };
