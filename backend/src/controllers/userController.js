// ============================================================
// userController.js — User management
// ============================================================
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");
const { auditLog } = require("../services/auditService");
const { sendEmail, sendNewEmployeeEmail } = require("../services/emailService");
const { sendNewEmployeeSMS } = require("../services/smsService");
const { getRegisteredProviders } = require("../utils/ussdFlowCapabilities");

const STAFF_SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

async function createStaffSetupArtifacts() {
  // Keep the users.password_hash column populated with a credential that
  // nobody knows. Staff never receive this random bootstrap credential.
  const passwordHash = await bcrypt.hash(
    crypto.randomBytes(48).toString("base64url"),
    parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  );

  // The only usable onboarding credential is a short-lived setup token.
  // Only its bcrypt hash is persisted.
  const setupToken = crypto.randomBytes(32).toString("hex");
  const setupTokenHash = await bcrypt.hash(setupToken, 8);
  const setupExpiresAt = new Date(Date.now() + STAFF_SETUP_TOKEN_TTL_MS);

  return {
    passwordHash,
    setupToken,
    setupTokenHash,
    setupExpiresAt,
  };
}

async function replaceStaffSetupToken(
  client,
  userId,
  setupTokenHash,
  setupExpiresAt,
) {
  await client.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId],
  );

  await client.query(
    `INSERT INTO password_reset_tokens (
       user_id,
       token_hash,
       expires_at
     )
     VALUES ($1, $2, $3)`,
    [userId, setupTokenHash, setupExpiresAt],
  );
}

function buildStaffSetupUrl(userId, setupToken) {
  const appUrl = String(process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!appUrl) return null;

  return (
    `${appUrl}/reset-password` +
    `?token=${encodeURIComponent(setupToken)}` +
    `&uid=${encodeURIComponent(userId)}`
  );
}

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(422).json({
      success: false,
      message: "current_password and new_password are required",
    });
  }

  // Enforce same complexity rules as registration
  const complexityErrors = [];
  if (new_password.length < 8) complexityErrors.push("at least 8 characters");
  if (!/[A-Z]/.test(new_password)) complexityErrors.push("an uppercase letter");
  if (!/[0-9]/.test(new_password)) complexityErrors.push("a number");
  if (complexityErrors.length > 0) {
    return res.status(422).json({
      success: false,
      message: `New password must include: ${complexityErrors.join(", ")}`,
    });
  }

  if (current_password === new_password) {
    return res.status(422).json({
      success: false,
      message: "New password must differ from current password",
    });
  }

  try {
    const result = await query(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];

    // Verify current password before allowing change
    const currentValid = await bcrypt.compare(
      current_password,
      user.password_hash,
    );
    if (!currentValid) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(
      new_password,
      parseInt(process.env.BCRYPT_ROUNDS) || 12,
    );

    await query(
      "UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2",
      [newHash, req.user.id],
    );

    // Revoke all other refresh tokens so other sessions are logged out
    // after a password change — standard security practice
    await query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [req.user.id],
    );

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "PASSWORD_CHANGED",
      entityType: "user",
      entityId: req.user.id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message:
        "Password changed successfully. Other sessions have been logged out.",
    });
  } catch (error) {
    logger.error("Change password error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to change password" });
  }
};

exports.listUsers = async (req, res) => {
  const {
    role,
    status,
    branch_id,
    company_id,
    personal_only,
    page = 1,
    limit = 20,
  } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (parsedPage - 1) * parsedLimit;

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role !== "superuser") {
      conditions.push(`u.company_id = $${idx++}`);
      params.push(req.user.company_id);
    }

    // Managers only see agents assigned to branches they manage - mirrors
    // the branch scoping already applied to Float accounts. Without this,
    // a manager could see every staff member company-wide even though
    // they can't edit any of them (edit routes are owner/superuser only).
    if (req.user.role === "manager") {
      // Managers manage agents in their assigned branches. Managers,
      // auditors, owners, and other roles must never become visible merely
      // because they also have an agent_branches relationship.
      conditions.push(`u.role = 'agent'`);
      conditions.push(`u.id IN (
        SELECT ab.agent_id FROM agent_branches ab
        WHERE ab.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $${idx++})
      )`);
      params.push(req.user.id);
    }

    if (role) {
      conditions.push(`u.role = $${idx++}`);
      params.push(role);
    }
    if (status) {
      conditions.push(`u.status = $${idx++}`);
      params.push(status);
    }
    // Only meaningful for superuser (business_owner/manager are already
    // scoped to their own company_id above); harmless no-op for other
    // roles since it just ANDs with their existing auto-scope.
    if (company_id) {
      conditions.push(`u.company_id = $${idx++}`);
      params.push(company_id);
    }

    if (personal_only === "true") {
      conditions.push(`EXISTS (
        SELECT 1
        FROM personal_subscriptions ps_filter
        WHERE ps_filter.user_id = u.id
      )`);
    }

    // Staff branch filtering follows the user's own agent_branches
    // assignment, not branch_managers. Managers may oversee multiple
    // branches, but that is a separate authorization relationship.
    if (branch_id) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM agent_branches ab_filter
        WHERE ab_filter.agent_id = u.id
          AND ab_filter.branch_id = $${idx++}
      )`);
      params.push(branch_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [data, count] = await Promise.all([
      query(
        `SELECT u.id, u.role, u.first_name, u.last_name, u.email, u.phone,
                u.status, u.created_at, u.last_login_at, u.profile_image_url,
                u.company_id, c.name as company_name,
                business_subscription.plan as subscription_plan,
                business_subscription.status as subscription_status,
                business_subscription.expires_at as subscription_expires_at,
                ps.plan as personal_subscription_plan,
                ps.expires_at as personal_subscription_expires_at,
                CASE
                  WHEN ps.user_id IS NULL THEN NULL
                  WHEN ps.plan = 'paid'
                    AND ps.expires_at > NOW()
                    THEN 'active'
                  WHEN ps.plan = 'paid' THEN 'expired'
                  ELSE 'free'
                END as personal_subscription_status,
                assigned_branch.branch_id,
                assigned_branch.branch_name
         FROM users u
         LEFT JOIN companies c ON u.company_id = c.id
         LEFT JOIN personal_subscriptions ps
           ON ps.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT
             s.plan,
             s.status,
             s.expires_at
           FROM subscriptions s
           WHERE s.company_id = u.company_id
           ORDER BY s.created_at DESC
           LIMIT 1
         ) business_subscription ON true
         LEFT JOIN LATERAL (
           SELECT ab.branch_id, b.name as branch_name
           FROM agent_branches ab
           INNER JOIN branches b ON b.id = ab.branch_id
           WHERE ab.agent_id = u.id
           ORDER BY ab.is_primary DESC, ab.assigned_at ASC, ab.id ASC
           LIMIT 1
         ) assigned_branch ON true
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parsedLimit, offset],
      ),
      query(`SELECT COUNT(*) FROM users u ${where}`, params),
    ]);

    res.json({
      success: true,
      data: data.rows,
      meta: {
        total: parseInt(count.rows[0].count),
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(parseInt(count.rows[0].count) / parsedLimit),
      },
    });
  } catch (error) {
    logger.error("List users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

exports.createUser = async (req, res) => {
  const { first_name, last_name, email, phone, role, branch_id } = req.body;

  // A creator must never choose or know a staff member's initial password.
  // Staff establish their own password through the one-time setup link.
  if (Object.prototype.hasOwnProperty.call(req.body, "password")) {
    return res.status(422).json({
      success: false,
      message:
        "Do not supply an initial password. Staff set their own password using the secure setup link.",
    });
  }

  // Staff creation is role-sensitive:
  // - superuser: platform-wide administrative roles
  // - business owner: managers, agents, auditors
  // - manager: agents only
  const allowedRoles =
    req.user.role === "superuser"
      ? ["business_owner", "manager", "agent", "auditor", "customer"]
      : req.user.role === "business_owner"
        ? ["manager", "agent", "auditor"]
        : req.user.role === "manager"
          ? ["agent"]
          : [];

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: `Cannot create user with role: ${role}`,
    });
  }

  // Managers may add agents, but an agent created by a manager must always
  // belong to one of that manager's own managed branches.
  if (req.user.role === "manager" && !branch_id) {
    return res.status(422).json({
      success: false,
      message: "Managers must assign agents to a branch they manage",
    });
  }

  try {
    const existing = await query(
      "SELECT id, status, company_id, account_deleted_at FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      if (existingUser.account_deleted_at) {
        return res.status(409).json({
          success: false,
          code: "ACCOUNT_PERMANENTLY_DELETED",
          message:
            "This historical account was permanently deleted and cannot be reactivated.",
        });
      }

      if (existingUser.status !== "deactivated") {
        return res
          .status(409)
          .json({ success: false, message: "Email already in use" });
      }
      if (existingUser.company_id !== req.user.company_id) {
        return res
          .status(409)
          .json({ success: false, message: "Email already in use" });
      }
      return exports.reactivateStaffMember(req, res, existingUser.id, {
        first_name,
        last_name,
        phone,
        role,
        branch_id,
      });
    }

    // Validate branch BEFORE creating the user — failing fast here means
    // no orphaned user record is ever created if the branch is invalid.
    const assignToBranch = branch_id && ["agent", "manager"].includes(role);
    if (assignToBranch) {
      if (req.user.role === "manager") {
        const branchCheck = await query(
          `SELECT b.id
           FROM branches b
           INNER JOIN branch_managers bm ON bm.branch_id = b.id
           WHERE b.id = $1
             AND b.company_id = $2
             AND bm.manager_id = $3`,
          [branch_id, req.user.company_id, req.user.id],
        );
        if (branchCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: "You can only add agents to branches you manage",
          });
        }
      } else {
        const branchCheck = await query(
          "SELECT id FROM branches WHERE id = $1 AND company_id = $2",
          [branch_id, req.user.company_id],
        );
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid branch for your company",
          });
        }
      }
    }

    const { passwordHash, setupToken, setupTokenHash, setupExpiresAt } =
      await createStaffSetupArtifacts();

    // User creation + branch assignment must succeed or fail together —
    // a user with no branch assignment (when one was requested) is an
    // inconsistent state we never want to persist.
    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (company_id, role, first_name, last_name, email, phone, password_hash, status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true) RETURNING id, email, role, status`,
        [
          req.user.company_id,
          role,
          first_name,
          last_name,
          email.toLowerCase(),
          phone,
          passwordHash,
        ],
      );
      const createdUser = result.rows[0];

      if (assignToBranch) {
        // Agents and managers both get an agent_branches entry -
        // this is where they personally process transactions.
        // Managers additionally get a branch_managers entry for
        // administrative oversight of that same branch.
        await client.query(
          `INSERT INTO agent_branches (agent_id, branch_id, assigned_by) VALUES ($1, $2, $3)`,
          [createdUser.id, branch_id, req.user.id],
        );
        if (role === "manager") {
          await client.query(
            `INSERT INTO branch_managers (manager_id, branch_id, assigned_by) VALUES ($1, $2, $3)`,
            [createdUser.id, branch_id, req.user.id],
          );
        }
      }

      await replaceStaffSetupToken(
        client,
        createdUser.id,
        setupTokenHash,
        setupExpiresAt,
      );

      return createdUser;
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: user.id,
      newValues: { email, role },
      ipAddress: req.ip,
      requestId: req.requestId,
    });
    // Fetch company name once, used by both email and SMS notifications
    // below. Wrapped defensively - a failure here should not prevent the
    // 201 response, since user creation itself already succeeded.
    let companyName = "Agent Pro Ghana";
    try {
      const companyResult = await query(
        "SELECT name FROM companies WHERE id = $1",
        [req.user.company_id],
      );
      companyName = companyResult.rows[0]?.name || companyName;
    } catch (e) {
      logger.error("Failed to fetch company name for notifications:", e);
    }

    // The staff member chooses their own password. The setup token is
    // delivered only inside the one-time email link; it is never sent to
    // the creator, SMS, push notifications, API responses, logs, or audit.
    const setupUrl = buildStaffSetupUrl(user.id, setupToken);

    let emailSent = false;

    if (setupUrl) {
      try {
        const emailResult = await sendNewEmployeeEmail(
          user.email,
          first_name,
          last_name,
          role,
          companyName,
          setupUrl,
        );

        emailSent = emailResult?.skipped !== true;
      } catch (emailError) {
        logger.error("Failed to send new employee setup email:", emailError);
      }
    } else {
      logger.error("APP_URL is not configured; staff setup email was not sent");
    }

    let smsSent = false;

    if (phone) {
      try {
        const smsResult = await sendNewEmployeeSMS(
          phone,
          first_name,
          role,
          companyName,
        );

        smsSent = smsResult?.skipped !== true;
      } catch (smsErr) {
        logger.error("Failed to send new employee notification SMS:", smsErr);
      }
    }

    let deliveryMessage;

    if (emailSent && smsSent) {
      deliveryMessage =
        `A secure password setup link was sent to ${user.email}; ` +
        "the staff phone was also notified by SMS.";
    } else if (emailSent) {
      deliveryMessage = `A secure password setup link was sent to ${user.email}.`;
    } else if (smsSent) {
      deliveryMessage =
        "The staff phone was notified, but the setup email was not confirmed. " +
        "Ask the staff member to use Forgot Password if the email does not arrive.";
    } else {
      deliveryMessage =
        "The account was created, but setup delivery was not confirmed. " +
        "Ask the staff member to use Forgot Password to set their password.";
    }

    res.status(201).json({
      success: true,
      data: user,
      message: `${role} account created. ${deliveryMessage}`,
    });
  } catch (error) {
    // Race condition safety net: two concurrent requests could both pass
    // the pre-check above before either commits. The database's UNIQUE
    // constraint on email is the real guarantee; this just gives it the
    // same friendly message as the common (non-race) duplicate-email path.
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ success: false, message: "Email already in use" });
    }
    logger.error("Create user error:", error);
    res.status(500).json({ success: false, message: "Failed to create user" });
  }
};

exports.updateUser = async (req, res) => {
  const { user_id } = req.params;
  const { first_name, last_name, phone, status } = req.body;

  try {
    // Fetch target user first to verify company ownership
    const target = await query(
      "SELECT id, company_id, role, account_deleted_at FROM users WHERE id = $1",
      [user_id],
    );
    if (target.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const targetUser = target.rows[0];

    // Non-superusers can only modify users in their own company
    if (
      req.user.role !== "superuser" &&
      targetUser.company_id !== req.user.company_id
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Business owners cannot modify other business owners or superusers
    if (
      req.user.role === "business_owner" &&
      ["business_owner", "superuser"].includes(targetUser.role)
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Cannot modify this user" });
    }

    if (targetUser.account_deleted_at) {
      return res.status(409).json({
        success: false,
        code: "ACCOUNT_PERMANENTLY_DELETED",
        message:
          "A permanently deleted account cannot be modified or reactivated.",
      });
    }

    // Prevent self-suspension lockout
    if (user_id === req.user.id && status && status !== "active") {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own account status",
      });
    }

    const updateSql = `UPDATE users SET first_name = COALESCE($1, first_name),
       last_name = COALESCE($2, last_name), phone = COALESCE($3, phone),
       status = COALESCE($4, status), updated_at = NOW()
       WHERE id = $5 RETURNING id, email, role, status, first_name, last_name`;

    const updateParams = [first_name, last_name, phone, status, user_id];

    let result;

    // Moving an account away from active and revoking every durable
    // session are one security state transition. They must commit or
    // roll back together; otherwise a partial database failure could
    // leave an inconsistent account/session state.
    if (status && status !== "active") {
      result = await withTransaction(async (client) => {
        const updatedUser = await client.query(updateSql, updateParams);

        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL`,
          [user_id],
        );

        return updatedUser;
      });
    } else {
      // Ordinary profile edits and reactivation do not create or restore
      // session state. Previously revoked sessions remain revoked.
      result = await query(updateSql, updateParams);
    }

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USER_UPDATED",
      entityType: "user",
      entityId: user_id,
      newValues: { first_name, last_name, phone, status },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Update user error:", error);
    res.status(500).json({ success: false, message: "Failed to update user" });
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
      [user_id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const targetUser = result.rows[0];

    // Non-superusers can only view users in their own company
    if (
      req.user.role !== "superuser" &&
      targetUser.company_id !== req.user.company_id
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Managers can only view agents assigned to branches they manage -
    // same restriction as listUsers, enforced here too so a manager can't
    // bypass list-level scoping by requesting a user_id directly. A
    // manager viewing their own record is always allowed.
    if (req.user.role === "manager" && user_id !== req.user.id) {
      // Branch overlap alone is not enough: managers may only read agents.
      // Their own user record remains explicitly allowed above.
      if (targetUser.role !== "agent") {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }

      const managerScope = await query(
        `SELECT 1 FROM agent_branches ab
         WHERE ab.agent_id = $1
           AND ab.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $2)`,
        [user_id, req.user.id],
      );
      if (managerScope.rows.length === 0) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }
    }

    delete targetUser.company_id; // internal field, not part of public response shape
    res.json({ success: true, data: targetUser });
  } catch (error) {
    logger.error("Get user error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

exports.reassignBranch = async (req, res) => {
  const { user_id } = req.params;
  const { branch_id } = req.body;

  if (!branch_id) {
    return res
      .status(422)
      .json({ success: false, message: "branch_id is required" });
  }

  try {
    const userCheck = await query(
      "SELECT id, role, first_name, last_name FROM users WHERE id = $1 AND company_id = $2",
      [user_id, req.user.company_id],
    );
    if (userCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const targetUser = userCheck.rows[0];

    if (!["agent", "manager", "business_owner"].includes(targetUser.role)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign a branch to role: ${targetUser.role}`,
      });
    }

    const branchCheck = await query(
      "SELECT id FROM branches WHERE id = $1 AND company_id = $2",
      [branch_id, req.user.company_id],
    );
    if (branchCheck.rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid branch for your company" });
    }

    await withTransaction(async (client) => {
      await client.query("DELETE FROM agent_branches WHERE agent_id = $1", [
        user_id,
      ]);
      await client.query(
        "INSERT INTO agent_branches (agent_id, branch_id, assigned_by) VALUES ($1, $2, $3)",
        [user_id, branch_id, req.user.id],
      );
      if (targetUser.role === "manager") {
        // Reassigning a manager changes the branch where they personally
        // operate, but must not erase their other branch-management
        // responsibilities. branch_managers is intentionally many-to-many.
        await client.query(
          `INSERT INTO branch_managers (manager_id, branch_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [user_id, branch_id, req.user.id],
        );
      }
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "BRANCH_REASSIGNED",
      entityType: "user",
      entityId: user_id,
      newValues: { branch_id },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: `${targetUser.first_name} ${targetUser.last_name} reassigned successfully.`,
    });
  } catch (error) {
    logger.error("Reassign branch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to reassign branch" });
  }
};

// Reactivate a previously deactivated staff member under the same
// company - preserves their original record and history rather than
// creating a brand new one, since the email address is unique across
// the whole platform and cannot simply be reused for a fresh account.
exports.reactivateStaffMember = async (req, res, existingUserId, fields) => {
  const { first_name, last_name, phone, role, branch_id } = fields;

  const allowedRoles =
    req.user.role === "superuser"
      ? ["business_owner", "manager", "agent", "auditor", "customer"]
      : req.user.role === "business_owner"
        ? ["manager", "agent", "auditor"]
        : req.user.role === "manager"
          ? ["agent"]
          : [];
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: `Cannot create user with role: ${role}`,
    });
  }

  if (req.user.role === "manager" && !branch_id) {
    return res.status(422).json({
      success: false,
      message: "Managers must assign agents to a branch they manage",
    });
  }

  try {
    const assignToBranch = branch_id && ["agent", "manager"].includes(role);
    if (assignToBranch) {
      if (req.user.role === "manager") {
        const branchCheck = await query(
          `SELECT b.id
           FROM branches b
           INNER JOIN branch_managers bm ON bm.branch_id = b.id
           WHERE b.id = $1
             AND b.company_id = $2
             AND bm.manager_id = $3`,
          [branch_id, req.user.company_id, req.user.id],
        );
        if (branchCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: "You can only add agents to branches you manage",
          });
        }
      } else {
        const branchCheck = await query(
          "SELECT id FROM branches WHERE id = $1 AND company_id = $2",
          [branch_id, req.user.company_id],
        );
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid branch for your company",
          });
        }
      }
    }

    const { passwordHash, setupToken, setupTokenHash, setupExpiresAt } =
      await createStaffSetupArtifacts();

    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE users SET first_name = $1, last_name = $2, phone = $3, role = $4,
         password_hash = $5, status = 'active', must_change_password = true, updated_at = NOW()
         WHERE id = $6 RETURNING id, email, role, status`,
        [first_name, last_name, phone, role, passwordHash, existingUserId],
      );
      const reactivatedUser = result.rows[0];

      await client.query("DELETE FROM agent_branches WHERE agent_id = $1", [
        existingUserId,
      ]);
      await client.query("DELETE FROM branch_managers WHERE manager_id = $1", [
        existingUserId,
      ]);

      if (assignToBranch) {
        await client.query(
          "INSERT INTO agent_branches (agent_id, branch_id, assigned_by) VALUES ($1, $2, $3)",
          [existingUserId, branch_id, req.user.id],
        );
        if (role === "manager") {
          await client.query(
            "INSERT INTO branch_managers (manager_id, branch_id, assigned_by) VALUES ($1, $2, $3)",
            [existingUserId, branch_id, req.user.id],
          );
        }
      }

      await replaceStaffSetupToken(
        client,
        existingUserId,
        setupTokenHash,
        setupExpiresAt,
      );

      return reactivatedUser;
    });

    let companyName = "Agent Pro Ghana";
    try {
      const companyResult = await query(
        "SELECT name FROM companies WHERE id = $1",
        [req.user.company_id],
      );
      companyName = companyResult.rows[0]?.name || companyName;
    } catch (e) {
      logger.error("Failed to fetch company name for notifications:", e);
    }

    const setupUrl = buildStaffSetupUrl(user.id, setupToken);

    if (setupUrl) {
      try {
        await sendNewEmployeeEmail(
          user.email,
          first_name,
          last_name,
          role,
          companyName,
          setupUrl,
        );
      } catch (emailError) {
        logger.error("Failed to send reactivation setup email:", emailError);
      }
    } else {
      logger.error(
        "APP_URL is not configured; reactivation setup email was not sent",
      );
    }

    if (phone) {
      try {
        await sendNewEmployeeSMS(phone, first_name, role, companyName);
      } catch (smsErr) {
        logger.error("Failed to send reactivation notification SMS:", smsErr);
      }
    }

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USER_REACTIVATED",
      entityType: "user",
      entityId: existingUserId,
      newValues: { email: user.email, role },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    logger.error("Reactivate staff error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to reactivate staff member" });
  }
};

// Self-service update for settings that don't need owner/superuser
// approval - currently just Telecel Operator ID, a fixed per-agent value
// required as part of the USSD dial sequence for Telecel transactions.
// Deliberately scoped to req.user.id only (mirrors changePassword's
// pattern) - a user can only ever update their own record here, never
// another user's, regardless of role.
// App-wide kill-switch / feature-flag mechanism: lets an admin disable
// any provider+transaction_type combo (e.g. "telecel:cash_out")
// without an app release. Fails safe - any error or missing/malformed
// config just returns an empty disabled list rather than blocking the
// whole home screen from loading.
exports.getFeatureFlags = async (req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_config WHERE key = 'disabled_transaction_types'`,
    );
    let disabled = [];
    if (result.rows.length > 0) {
      try {
        const parsed = JSON.parse(result.rows[0].value);
        if (Array.isArray(parsed)) disabled = parsed;
      } catch (_) {
        /* malformed config - fail safe with empty list */
      }
    }
    res.json({ success: true, data: { disabled_transaction_types: disabled } });
  } catch (e) {
    logger.error("Get feature flags error:", e);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch feature flags" });
  }
};

exports.updateMySettings = async (req, res) => {
  const { telecel_operator_id } = req.body;

  if (
    telecel_operator_id !== undefined &&
    typeof telecel_operator_id !== "string"
  ) {
    return res.status(422).json({
      success: false,
      message: "telecel_operator_id must be a string",
    });
  }

  try {
    const result = await query(
      `UPDATE users SET telecel_operator_id = COALESCE($1, telecel_operator_id), updated_at = NOW()
       WHERE id = $2 RETURNING id, telecel_operator_id`,
      [telecel_operator_id, req.user.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "SETTINGS_UPDATED",
      entityType: "user",
      entityId: req.user.id,
      newValues: { telecel_operator_id },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Update my settings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update settings" });
  }
};

const QUICK_ACTION_ICON_COLORS = new Set([
  "#00897B",
  "#1565C0",
  "#6A1B9A",
  "#D84315",
  "#C62828",
  "#FDD835",
  "#F9A825",
  "#455A64",
  "#3949AB",
  "#D81B60",
]);

function validateQuickActionPreferences(value, fieldName, registeredProviders) {
  if (value === undefined) return null;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `${fieldName} must be an object keyed by provider`;
  }

  for (const [provider, actions] of Object.entries(value)) {
    if (!registeredProviders.has(provider)) {
      return `Invalid provider in ${fieldName}: ${provider}`;
    }

    if (!Array.isArray(actions)) {
      return `${fieldName}.${provider} must be an array`;
    }

    if (actions.length > 9) {
      return `${fieldName}.${provider} cannot contain more than 9 actions`;
    }

    const actionIdentities = [];

    for (let index = 0; index < actions.length; index += 1) {
      const item = actions[index];

      // Backward compatibility:
      // Existing users may still have ["cash_in", "cash_out"].
      if (typeof item === "string") {
        const actionKey = item.trim();

        if (!actionKey) {
          return `${fieldName}.${provider}[${index}] must not be empty`;
        }

        actionIdentities.push(`${actionKey}||`);
        continue;
      }

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return `${fieldName}.${provider}[${index}] must be a string or action object`;
      }

      const {
        action_key,
        custom_name,
        icon_key,
        icon_color,
        icon_background_color,
        bundle_category,
        recipient_mode,
        position,
        is_visible,
      } = item;

      if (typeof action_key !== "string" || action_key.trim().length === 0) {
        return `${fieldName}.${provider}[${index}].action_key is required`;
      }

      if (
        custom_name !== undefined &&
        custom_name !== null &&
        (typeof custom_name !== "string" ||
          custom_name.trim().length === 0 ||
          custom_name.trim().length > 25)
      ) {
        return `${fieldName}.${provider}[${index}].custom_name must be 1-25 characters`;
      }

      if (
        icon_key !== undefined &&
        icon_key !== null &&
        (typeof icon_key !== "string" ||
          icon_key.trim().length === 0 ||
          icon_key.trim().length > 50)
      ) {
        return `${fieldName}.${provider}[${index}].icon_key is invalid`;
      }

      if (
        icon_color !== undefined &&
        icon_color !== null &&
        (typeof icon_color !== "string" ||
          !QUICK_ACTION_ICON_COLORS.has(icon_color.trim().toUpperCase()))
      ) {
        return `${fieldName}.${provider}[${index}].icon_color is invalid`;
      }

      if (
        icon_background_color !== undefined &&
        icon_background_color !== null &&
        (typeof icon_background_color !== "string" ||
          !QUICK_ACTION_ICON_COLORS.has(
            icon_background_color.trim().toUpperCase(),
          ))
      ) {
        return `${fieldName}.${provider}[${index}].icon_background_color is invalid`;
      }

      if (
        bundle_category !== undefined &&
        bundle_category !== null &&
        (typeof bundle_category !== "string" ||
          bundle_category.trim().length === 0 ||
          bundle_category.trim().length > 100)
      ) {
        return `${fieldName}.${provider}[${index}].bundle_category is invalid`;
      }

      if (
        recipient_mode !== undefined &&
        recipient_mode !== null &&
        (typeof recipient_mode !== "string" ||
          recipient_mode.trim().length === 0 ||
          recipient_mode.trim().length > 100)
      ) {
        return `${fieldName}.${provider}[${index}].recipient_mode is invalid`;
      }

      if (
        position !== undefined &&
        (!Number.isInteger(position) || position < 0 || position > 8)
      ) {
        return `${fieldName}.${provider}[${index}].position must be an integer from 0 to 8`;
      }

      if (is_visible !== undefined && typeof is_visible !== "boolean") {
        return `${fieldName}.${provider}[${index}].is_visible must be boolean`;
      }

      const normalizedBundleCategory =
        typeof bundle_category === "string" ? bundle_category.trim() : "";

      const normalizedRecipientMode =
        typeof recipient_mode === "string" ? recipient_mode.trim() : "";

      actionIdentities.push(
        `${action_key.trim()}|${normalizedBundleCategory}|${normalizedRecipientMode}`,
      );
    }

    if (new Set(actionIdentities).size !== actionIdentities.length) {
      return `${fieldName}.${provider} cannot contain duplicate action variants`;
    }
  }

  return null;
}

function quickActionGroupForType(transactionType) {
  const normalized = String(transactionType || "")
    .trim()
    .toLowerCase();

  if (
    normalized.includes("airtime") ||
    normalized.includes("data") ||
    normalized.includes("bundle") ||
    normalized.includes("mashup")
  ) {
    return "Airtime & Data";
  }

  if (
    normalized.includes("balance") ||
    normalized.includes("statement") ||
    normalized.includes("commission")
  ) {
    return "Balances & Commission";
  }

  if (
    normalized.includes("cash") ||
    normalized.includes("deposit") ||
    normalized.includes("withdraw") ||
    normalized.includes("float") ||
    normalized.includes("working")
  ) {
    return "Cash & Float";
  }

  if (
    normalized.includes("send") ||
    normalized.includes("transfer") ||
    normalized.includes("payment") ||
    normalized.includes("merchant") ||
    normalized.includes("bill") ||
    normalized.startsWith("pay_")
  ) {
    return "Transfers & Payments";
  }

  return "Other Services";
}

function quickActionDisplayLabel(provider, transactionType, capabilityLabel) {
  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();
  const normalizedType = String(transactionType || "")
    .trim()
    .toLowerCase();

  // MTN Agent terminology: this internal send_money transaction is the
  // customer Cash In operation.
  if (normalizedProvider === "mtn" && normalizedType === "send_money") {
    return "Cash In";
  }

  // Pay to Agent uses its own canonical transaction type.
  if (normalizedType === "pay_to_agent") {
    return "Pay to Agent";
  }

  const normalizedLabel = String(capabilityLabel || "").trim();

  return (
    normalizedLabel ||
    normalizedType
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function normalizeBusinessQuickActionActions(provider, actionMap) {
  const actions = Array.from(actionMap.values());

  if (
    String(provider || "")
      .trim()
      .toLowerCase() !== "mtn"
  ) {
    return actions;
  }

  const legacyCashInIndex = actions.findIndex(
    (action) => action.transaction_type === "cash_in",
  );

  const canonicalCashInIndex = actions.findIndex(
    (action) => action.transaction_type === "send_money",
  );

  if (legacyCashInIndex < 0 || canonicalCashInIndex < 0) {
    return actions;
  }

  const canonicalCashIn = actions[canonicalCashInIndex];

  return actions.flatMap((action, index) => {
    if (index === legacyCashInIndex) {
      // Real MTN Cash In takes the old Cash In position.
      return [canonicalCashIn];
    }

    if (index === canonicalCashInIndex) {
      // Remove the duplicate later Send Money/Cash In position.
      return [];
    }

    return [action];
  });
}

exports.getMyQuickActionCatalog = async (req, res) => {
  const requestedMode = String(req.query.mode || "business")
    .trim()
    .toLowerCase();

  const accountMode = requestedMode === "agent" ? "business" : requestedMode;

  if (accountMode !== "business" && accountMode !== "personal") {
    return res.status(422).json({
      success: false,
      message: "mode must be business, agent, or personal",
    });
  }

  try {
    const result = await query(
      `SELECT
         f.provider::text AS provider,
         f.transaction_type::text AS transaction_type,
         COALESCE(
           NULLIF(BTRIM(c.display_label), ''),
           INITCAP(REPLACE(f.transaction_type::text, '_', ' '))
         ) AS display_label,
         f.bundle_category,
         f.recipient_mode
       FROM ussd_flows f
       INNER JOIN ussd_flow_capabilities c
         ON c.transaction_type = f.transaction_type
        AND c.account_mode = $1
       WHERE f.company_id IS NULL
         AND f.owner_user_id IS NULL
         AND f.is_active = TRUE
         AND c.is_active = TRUE
         AND c.can_initiate = TRUE
       ORDER BY
         f.provider::text,
         display_label,
         f.transaction_type::text,
         COALESCE(f.bundle_category, ''),
         COALESCE(f.recipient_mode, '')`,
      [accountMode],
    );

    const providerMap = new Map();

    for (const row of result.rows) {
      const provider = String(row.provider || "").trim();
      const transactionType = String(row.transaction_type || "").trim();

      if (!provider || !transactionType) {
        continue;
      }

      if (!providerMap.has(provider)) {
        providerMap.set(provider, new Map());
      }

      const actions = providerMap.get(provider);

      if (!actions.has(transactionType)) {
        actions.set(transactionType, {
          provider,
          transaction_type: transactionType,
          display_label: quickActionDisplayLabel(
            provider,
            transactionType,
            row.display_label,
          ),
          quick_action_group: quickActionGroupForType(transactionType),
          variants: [],
        });
      }

      const bundleCategory =
        row.bundle_category === null || row.bundle_category === undefined
          ? null
          : String(row.bundle_category).trim() || null;

      const recipientMode =
        row.recipient_mode === null || row.recipient_mode === undefined
          ? null
          : String(row.recipient_mode).trim() || null;

      if (bundleCategory !== null || recipientMode !== null) {
        const action = actions.get(transactionType);

        const alreadyPresent = action.variants.some(
          (variant) =>
            variant.bundle_category === bundleCategory &&
            variant.recipient_mode === recipientMode,
        );

        if (!alreadyPresent) {
          action.variants.push({
            bundle_category: bundleCategory,
            recipient_mode: recipientMode,
          });
        }
      }
    }

    const providers = [];

    for (const [provider, actionMap] of providerMap.entries()) {
      providers.push({
        provider,
        actions: normalizeBusinessQuickActionActions(provider, actionMap),
      });
    }

    res.json({
      success: true,
      data: {
        mode: accountMode,
        providers,
      },
    });
  } catch (error) {
    logger.error("Get my Quick Action catalog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Quick Action catalog",
    });
  }
};

exports.getMyQuickActions = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         agent_quick_actions,
         personal_quick_actions,
         evd_quick_actions,
         merchant_quick_actions
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        agent: user.agent_quick_actions || {},
        // Keep "personal" during rollout because older app builds read it.
        personal: user.personal_quick_actions || {},
        subscriber: user.personal_quick_actions || {},
        evd: user.evd_quick_actions || {},
        merchant: user.merchant_quick_actions || {},
      },
    });
  } catch (error) {
    logger.error("Get my quick actions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch Quick Action preferences",
    });
  }
};

exports.updateMyQuickActions = async (req, res) => {
  const {
    agent_quick_actions,
    personal_quick_actions,
    subscriber_quick_actions,
    evd_quick_actions,
    merchant_quick_actions,
  } = req.body;

  const subscriberValue =
    subscriber_quick_actions !== undefined
      ? subscriber_quick_actions
      : personal_quick_actions;

  if (
    agent_quick_actions === undefined &&
    subscriberValue === undefined &&
    evd_quick_actions === undefined &&
    merchant_quick_actions === undefined
  ) {
    return res.status(422).json({
      success: false,
      message:
        "Provide agent_quick_actions, subscriber_quick_actions, " +
        "evd_quick_actions, or merchant_quick_actions",
    });
  }

  let registeredQuickActionProviders;

  try {
    registeredQuickActionProviders = new Set(await getRegisteredProviders());
  } catch (error) {
    logger.error("Load registered Quick Action providers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to validate Quick Action providers",
    });
  }

  const preferenceFields = [
    [agent_quick_actions, "agent_quick_actions"],
    [subscriberValue, "subscriber_quick_actions"],
    [evd_quick_actions, "evd_quick_actions"],
    [merchant_quick_actions, "merchant_quick_actions"],
  ];

  for (const [value, fieldName] of preferenceFields) {
    const validationError = validateQuickActionPreferences(
      value,
      fieldName,
      registeredQuickActionProviders,
    );

    if (validationError) {
      return res.status(422).json({
        success: false,
        message: validationError,
      });
    }
  }

  try {
    const result = await query(
      `UPDATE users
       SET
         agent_quick_actions =
           COALESCE($1::jsonb, agent_quick_actions),
         personal_quick_actions =
           COALESCE($2::jsonb, personal_quick_actions),
         evd_quick_actions =
           COALESCE($3::jsonb, evd_quick_actions),
         merchant_quick_actions =
           COALESCE($4::jsonb, merchant_quick_actions),
         updated_at = NOW()
       WHERE id = $5
       RETURNING
         agent_quick_actions,
         personal_quick_actions,
         evd_quick_actions,
         merchant_quick_actions`,
      [
        agent_quick_actions === undefined
          ? null
          : JSON.stringify(agent_quick_actions),
        subscriberValue === undefined ? null : JSON.stringify(subscriberValue),
        evd_quick_actions === undefined
          ? null
          : JSON.stringify(evd_quick_actions),
        merchant_quick_actions === undefined
          ? null
          : JSON.stringify(merchant_quick_actions),
        req.user.id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updated = result.rows[0];

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "QUICK_ACTIONS_UPDATED",
      entityType: "user",
      entityId: req.user.id,
      newValues: {
        if_agent_updated: agent_quick_actions !== undefined,
        if_subscriber_updated: subscriberValue !== undefined,
        if_evd_updated: evd_quick_actions !== undefined,
        if_merchant_updated: merchant_quick_actions !== undefined,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      data: {
        agent: updated.agent_quick_actions || {},
        personal: updated.personal_quick_actions || {},
        subscriber: updated.personal_quick_actions || {},
        evd: updated.evd_quick_actions || {},
        merchant: updated.merchant_quick_actions || {},
      },
    });
  } catch (error) {
    logger.error("Update my quick actions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update Quick Action preferences",
    });
  }
};
