// ============================================================
// userController.js — User management
// ============================================================
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendEmail, sendNewEmployeeEmail } = require('../services/emailService');
const { sendNewEmployeeSMS } = require('../services/smsService');

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(422).json({ success: false, message: 'current_password and new_password are required' });
  }

  // Enforce same complexity rules as registration
  const complexityErrors = [];
  if (new_password.length < 8) complexityErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(new_password)) complexityErrors.push('an uppercase letter');
  if (!/[0-9]/.test(new_password)) complexityErrors.push('a number');
  if (complexityErrors.length > 0) {
    return res.status(422).json({
      success: false,
      message: `New password must include: ${complexityErrors.join(', ')}`
    });
  }

  if (current_password === new_password) {
    return res.status(422).json({ success: false, message: 'New password must differ from current password' });
  }

  try {
    const result = await query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password before allowing change
    const currentValid = await bcrypt.compare(current_password, user.password_hash);
    if (!currentValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.id]
    );

    // Revoke all other refresh tokens so other sessions are logged out
    // after a password change — standard security practice
    await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [req.user.id]
    );

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Password changed successfully. Other sessions have been logged out.' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

exports.listUsers = async (req, res) => {
  const { role, status, branch_id, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role !== 'superuser') {
      conditions.push(`u.company_id = $${idx++}`);
      params.push(req.user.company_id);
    }
    if (role) { conditions.push(`u.role = $${idx++}`); params.push(role); }
    if (status) { conditions.push(`u.status = $${idx++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [data, count] = await Promise.all([
      query(
        `SELECT u.id, u.role, u.first_name, u.last_name, u.email, u.phone,
                u.status, u.created_at, u.last_login_at, u.profile_image_url,
                c.name as company_name
         FROM users u
         LEFT JOIN companies c ON u.company_id = c.id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(`SELECT COUNT(*) FROM users u ${where}`, params),
    ]);

    res.json({
      success: true,
      data: data.rows,
      meta: {
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

exports.createUser = async (req, res) => {
  const { first_name, last_name, email, phone, role, password, branch_id } = req.body;

  // Business owners can only create managers, agents, auditors
  const allowedRoles = req.user.role === 'superuser'
    ? ['business_owner', 'manager', 'agent', 'auditor', 'customer']
    : ['manager', 'agent', 'auditor'];

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ success: false, message: `Cannot create user with role: ${role}` });
  }

  // Generate a cryptographically secure temporary password if none was provided.
  // This is NEVER returned in the API response and is only ever sent via email.
  const tempPassword = password || generateTempPassword();

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    // Validate branch BEFORE creating the user — failing fast here means
    // no orphaned user record is ever created if the branch is invalid.
    const assignToBranch = branch_id && ['agent', 'manager'].includes(role);
    if (assignToBranch) {
      const branchCheck = await query(
        'SELECT id FROM branches WHERE id = $1 AND company_id = $2',
        [branch_id, req.user.company_id]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid branch for your company' });
      }
    }

    const passwordHash = await bcrypt.hash(
      tempPassword,
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    // User creation + branch assignment must succeed or fail together —
    // a user with no branch assignment (when one was requested) is an
    // inconsistent state we never want to persist.
    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (company_id, role, first_name, last_name, email, phone, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id, email, role, status`,
        [req.user.company_id, role, first_name, last_name, email.toLowerCase(), phone, passwordHash]
      );
      const createdUser = result.rows[0];

      if (assignToBranch) {
        const table = role === 'agent' ? 'agent_branches' : 'branch_managers';
        const col = role === 'agent' ? 'agent_id' : 'manager_id';
        await client.query(
          `INSERT INTO ${table} (${col}, branch_id, assigned_by) VALUES ($1, $2, $3)`,
          [createdUser.id, branch_id, req.user.id]
        );
      }

      return createdUser;
    });

    await auditLog({
      userId: req.user.id, companyId: req.user.company_id,
      action: 'USER_CREATED', entityType: 'user', entityId: user.id,
      newValues: { email, role }, ipAddress: req.ip, requestId: req.requestId,
      // Note: tempPassword is intentionally NOT included in audit log values
    });
    // Fetch company name once, used by both email and SMS notifications
    // below. Wrapped defensively - a failure here should not prevent the
    // 201 response, since user creation itself already succeeded.
    let companyName = "Agent Pro Ghana";
    try {
      const companyResult = await query("SELECT name FROM companies WHERE id = $1", [req.user.company_id]);
      companyName = companyResult.rows[0]?.name || companyName;
    } catch (e) {
      logger.error("Failed to fetch company name for notifications:", e);
    }

    // Email the temporary password - this is the only place it is ever transmitted
    let emailSent = true;
    try {
      await sendNewEmployeeEmail(user.email, first_name, last_name, role, companyName, tempPassword);
    } catch (emailError) {
      logger.error("Failed to send new employee email:", emailError);
      emailSent = false;
    }

    if (phone) {
      try {
        await sendNewEmployeeSMS(phone, first_name, role, companyName);
      } catch (smsErr) {
        logger.error("Failed to send new employee SMS:", smsErr);
      }
    }


    res.status(201).json({
      success: true,
      data: user,
      message: emailSent
        ? `${role} account created. Login details have been emailed to ${user.email}.`
        : `${role} account created, but the welcome email could not be sent. Please use password reset to set their initial password.`,
    });
  } catch (error) {
    // Race condition safety net: two concurrent requests could both pass
    // the pre-check above before either commits. The database's UNIQUE
    // constraint on email is the real guarantee; this just gives it the
    // same friendly message as the common (non-race) duplicate-email path.
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    logger.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
};

/**
 * Generate a cryptographically secure temporary password.
 * Meets the same complexity rules enforced at registration:
 * min 8 chars, at least one uppercase letter, at least one number.
 */
function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid ambiguity
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;

  const pick = (charset) => charset[crypto.randomInt(charset.length)];

  // Guarantee at least one of each required character class
  let pwd = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 9; i++) pwd += pick(all);

  // Shuffle so the guaranteed characters aren't always in the same position
  return pwd.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

exports.updateUser = async (req, res) => {
  const { user_id } = req.params;
  const { first_name, last_name, phone, status } = req.body;

  try {
    // Fetch target user first to verify company ownership
    const target = await query('SELECT id, company_id, role FROM users WHERE id = $1', [user_id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetUser = target.rows[0];

    // Non-superusers can only modify users in their own company
    if (req.user.role !== 'superuser' && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Business owners cannot modify other business owners or superusers
    if (req.user.role === 'business_owner' && ['business_owner', 'superuser'].includes(targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Cannot modify this user' });
    }

    // Prevent self-suspension lockout
    if (user_id === req.user.id && status && status !== 'active') {
      return res.status(400).json({ success: false, message: 'You cannot change your own account status' });
    }

    const result = await query(
      `UPDATE users SET first_name = COALESCE($1, first_name),
       last_name = COALESCE($2, last_name), phone = COALESCE($3, phone),
       status = COALESCE($4, status), updated_at = NOW()
       WHERE id = $5 RETURNING id, email, role, status, first_name, last_name`,
      [first_name, last_name, phone, status, user_id]
    );

    await auditLog({
      userId: req.user.id, companyId: req.user.company_id,
      action: 'USER_UPDATED', entityType: 'user', entityId: user_id,
      newValues: { first_name, last_name, phone, status },
      ipAddress: req.ip, requestId: req.requestId,
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

exports.getUser = async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await query(
      `SELECT u.id, u.role, u.first_name, u.last_name, u.email, u.phone,
              u.ghana_card_number, u.profile_image_url, u.status,
              u.created_at, u.last_login_at, u.company_id, c.name as company_name
       FROM users u LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetUser = result.rows[0];

    // Non-superusers can only view users in their own company
    if (req.user.role !== 'superuser' && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    delete targetUser.company_id; // internal field, not part of public response shape
    res.json({ success: true, data: targetUser });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};
