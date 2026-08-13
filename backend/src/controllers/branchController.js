const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { getRegisteredProviders } = require('../utils/ussdFlowCapabilities');

exports.listBranches = async (req, res) => {
  const companyId = req.user.role === 'superuser'
    ? (req.query.company_id || null)
    : req.user.company_id;

  try {
    const conditions = companyId ? ['b.company_id = $1'] : [];
    const params = companyId ? [companyId] : [];

    // Managers only see branches they actually manage - without this, a
    // manager sees every branch in the company, same class of gap
    // already fixed for listUsers (Manager visibility scoping,
    // migration/commit earlier tonight) and now listTransactions too.
    if (req.user.role === 'manager') {
      const idx = params.length + 1;
      conditions.push(`b.id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $${idx})`);
      params.push(req.user.id);
    }

    // Agents only see branches to which they are explicitly assigned.
    // This keeps branch discovery aligned with getBranchFloat and
    // submitFloatRequest, both of which already require agent_branches.
    if (req.user.role === 'agent') {
      const idx = params.length + 1;
      conditions.push(`b.id IN (SELECT branch_id FROM agent_branches WHERE agent_id = $${idx})`);
      params.push(req.user.id);
    }

    const result = await query(
      `SELECT b.*,
              COUNT(DISTINCT assigned_agent.id) as agent_count,
              COUNT(DISTINCT assigned_manager.id) as manager_count,
              COALESCE(MAX(fa.total_float), 0) as total_float
       FROM branches b
       LEFT JOIN agent_branches ab ON ab.branch_id = b.id
       LEFT JOIN users assigned_agent
         ON assigned_agent.id = ab.agent_id
        AND assigned_agent.status <> 'deactivated'
       LEFT JOIN branch_managers bm ON bm.branch_id = b.id
       LEFT JOIN users assigned_manager
         ON assigned_manager.id = bm.manager_id
        AND assigned_manager.status <> 'deactivated'
       LEFT JOIN (
         SELECT branch_id, SUM(current_balance) as total_float
         FROM float_accounts
         GROUP BY branch_id
       ) fa ON fa.branch_id = b.id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY b.id
       ORDER BY b.name`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List branches error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch branches' });
  }
};

exports.createBranch = async (req, res) => {
  const { name, location, phone, company_id } = req.body;

  const companyId = req.user.role === 'superuser'
    ? company_id
    : req.user.company_id;

  if (!companyId) {
    return res.status(422).json({
      success: false,
      message: 'company_id is required when creating a branch as superuser',
    });
  }

  try {
    const branch = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO branches (company_id, name, location, phone, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [companyId, name, location, phone, req.user.id]
      );

      const createdBranch = result.rows[0];

      // Keep treasury setup data-driven. Every provider registered in the
      // PostgreSQL provider enum gets its own branch-level float account.
      // New providers therefore require no Branch Management code change.
      const providers = await getRegisteredProviders(client.query.bind(client));

      for (const provider of providers) {
        await client.query(
          `INSERT INTO float_accounts (branch_id, provider)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [createdBranch.id, provider]
        );
      }

      // The owner's first branch also becomes their initial operating branch.
      // Keep this inside the same transaction so a partial branch setup can
      // never survive if treasury or assignment initialization fails.
      if (req.user.role === 'business_owner') {
        const existingAssignment = await client.query(
          'SELECT id FROM agent_branches WHERE agent_id = $1',
          [req.user.id]
        );

        if (existingAssignment.rows.length === 0) {
          await client.query(
            `INSERT INTO agent_branches
               (agent_id, branch_id, assigned_by)
             VALUES ($1, $2, $3)`,
            [req.user.id, createdBranch.id, req.user.id]
          );
        }
      }

      return createdBranch;
    });

    await auditLog({
      userId: req.user.id,
      companyId,
      action: 'BRANCH_CREATED',
      entityType: 'branch',
      entityId: branch.id,
      newValues: {
        name: branch.name,
        location: branch.location,
        phone: branch.phone,
        status: branch.status,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    logger.error('Create branch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create branch',
    });
  }
};

exports.updateBranch = async (req, res) => {
  const { branch_id } = req.params;
  const { name, location, phone, status } = req.body;

  try {
    const updateParams = [
      name,
      location,
      phone,
      status,
      branch_id,
    ];

    let updateSql = `UPDATE branches SET
         name = COALESCE($1, name), location = COALESCE($2, location),
         phone = COALESCE($3, phone), status = COALESCE($4, status),
         updated_at = NOW()
       WHERE id = $5`;

    // Business owners remain strictly company-scoped. Superusers are
    // platform-wide administrators and may update a branch by its globally
    // unique branch ID without needing a company_id on their user record.
    if (req.user.role !== 'superuser') {
      updateParams.push(req.user.company_id);
      updateSql += ' AND company_id = $6';
    }

    updateSql += ' RETURNING *';

    const result = await query(updateSql, updateParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const updatedBranch = result.rows[0];

    await auditLog({
      userId: req.user.id,
      companyId: updatedBranch.company_id || req.user.company_id,
      action: 'BRANCH_UPDATED',
      entityType: 'branch',
      entityId: updatedBranch.id,
      newValues: {
        name: updatedBranch.name,
        location: updatedBranch.location,
        phone: updatedBranch.phone,
        status: updatedBranch.status,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updatedBranch });
  } catch (error) {
    logger.error('Update branch error:', error);
    res.status(500).json({ success: false, message: 'Failed to update branch' });
  }
};

exports.getBranch = async (req, res) => {
  const { branch_id } = req.params;

  try {
    const [branch, agents, managers] = await Promise.all([
      query(`SELECT b.*, c.name as company_name FROM branches b
             LEFT JOIN companies c ON b.company_id = c.id WHERE b.id = $1`, [branch_id]),
      query(`SELECT u.id, u.first_name, u.last_name, u.phone, u.status
             FROM users u INNER JOIN agent_branches ab ON ab.agent_id = u.id
             WHERE ab.branch_id = $1
               AND u.status <> 'deactivated'`, [branch_id]),
      query(`SELECT u.id, u.first_name, u.last_name, u.phone, u.status
             FROM users u INNER JOIN branch_managers bm ON bm.manager_id = u.id
             WHERE bm.branch_id = $1
               AND u.status <> 'deactivated'`, [branch_id]),
    ]);

    if (branch.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const branchData = branch.rows[0];

    // Non-superusers can only view branches in their own company.
    // Agents/managers must additionally be assigned to this specific branch.
    if (req.user.role !== 'superuser') {
      if (branchData.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (['agent', 'manager'].includes(req.user.role)) {
        // agent_branches represents an agent's operating assignment;
        // branch_managers is the authoritative manager oversight relation.
        // Do not let a manager gain direct branch-management visibility
        // merely because they also have an operating/default assignment.
        const isAssigned = req.user.role === 'manager'
          ? managers.rows.some((manager) => manager.id === req.user.id)
          : agents.rows.some((agent) => agent.id === req.user.id);

        if (!isAssigned) {
          return res.status(403).json({
            success: false,
            message: 'You are not assigned to this branch',
          });
        }
      }
    }

    res.json({
      success: true,
      data: { ...branchData, agents: agents.rows, managers: managers.rows },
    });
  } catch (error) {
    logger.error('Get branch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch branch' });
  }
};
