const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');

exports.listBranches = async (req, res) => {
  const companyId = req.user.role === 'superuser'
    ? (req.query.company_id || null)
    : req.user.company_id;

  try {
    const conditions = companyId ? ['b.company_id = $1'] : [];
    const params = companyId ? [companyId] : [];

    const result = await query(
      `SELECT b.*,
              COUNT(DISTINCT ab.agent_id) as agent_count,
              COUNT(DISTINCT bm.manager_id) as manager_count,
              COALESCE(SUM(fa.current_balance), 0) as total_float
       FROM branches b
       LEFT JOIN agent_branches ab ON ab.branch_id = b.id
       LEFT JOIN branch_managers bm ON bm.branch_id = b.id
       LEFT JOIN float_accounts fa ON fa.branch_id = b.id
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
  const { name, location, phone } = req.body;

  try {
    const result = await query(
      `INSERT INTO branches (company_id, name, location, phone, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.company_id, name, location, phone, req.user.id]
    );

    // Create default float accounts for all providers
    const providers = ['mtn', 'telecel', 'at_money'];
    for (const provider of providers) {
      await query(
        'INSERT INTO float_accounts (branch_id, provider) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [result.rows[0].id, provider]
      );
    }

    // If the creating user is the Business Owner and has no branch
    // assignment yet, this becomes their default branch for recording
    // their own transactions (owners have no separate branch_id column
    // on users - agent_branches is the single source of truth for
    // which branch a transaction gets recorded under).
    if (req.user.role === 'business_owner') {
      const existingAssignment = await query(
        'SELECT id FROM agent_branches WHERE agent_id = $1',
        [req.user.id]
      );
      if (existingAssignment.rows.length === 0) {
        await query(
          'INSERT INTO agent_branches (agent_id, branch_id, assigned_by) VALUES ($1, $2, $3)',
          [req.user.id, result.rows[0].id, req.user.id]
        );
      }
    }

    await auditLog({
      userId: req.user.id, companyId: req.user.company_id,
      action: 'BRANCH_CREATED', entityType: 'branch', entityId: result.rows[0].id,
      newValues: { name, location }, ipAddress: req.ip, requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Create branch error:', error);
    res.status(500).json({ success: false, message: 'Failed to create branch' });
  }
};

exports.updateBranch = async (req, res) => {
  const { branch_id } = req.params;
  const { name, location, phone, status } = req.body;

  try {
    const result = await query(
      `UPDATE branches SET
         name = COALESCE($1, name), location = COALESCE($2, location),
         phone = COALESCE($3, phone), status = COALESCE($4, status),
         updated_at = NOW()
       WHERE id = $5 AND company_id = $6 RETURNING *`,
      [name, location, phone, status, branch_id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    res.json({ success: true, data: result.rows[0] });
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
             WHERE ab.branch_id = $1`, [branch_id]),
      query(`SELECT u.id, u.first_name, u.last_name, u.phone, u.status
             FROM users u INNER JOIN branch_managers bm ON bm.manager_id = u.id
             WHERE bm.branch_id = $1`, [branch_id]),
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
        const isAssigned = agents.rows.some(a => a.id === req.user.id) ||
                            managers.rows.some(m => m.id === req.user.id);
        if (!isAssigned) {
          return res.status(403).json({ success: false, message: 'You are not assigned to this branch' });
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
