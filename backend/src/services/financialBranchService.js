// Deterministic branch attribution for financial events.
//
// Application flows are designed around one transaction branch per agent,
// but legacy/corrupt data may contain multiple assignments. Financial
// posting must never silently choose an arbitrary branch.

async function resolveAgentFinancialBranch({
  queryFn,
  agentId,
  companyId
}) {
  const result = await queryFn(
    `SELECT b.id, ab.is_primary
     FROM branches b
     INNER JOIN agent_branches ab
       ON ab.branch_id = b.id
     WHERE ab.agent_id = $1
       AND b.company_id = $2
       AND b.status = 'active'
     ORDER BY ab.is_primary DESC, ab.assigned_at ASC, ab.id ASC`,
    [agentId, companyId]
  );

  const rows = result.rows || [];

  if (rows.length === 0) {
    return {
      ok: false,
      code: 'NO_ACTIVE_BRANCH'
    };
  }

  const primaryRows = rows.filter((row) => row.is_primary === true);

  if (primaryRows.length === 1) {
    return {
      ok: true,
      branchId: primaryRows[0].id
    };
  }

  if (primaryRows.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_PRIMARY_BRANCH'
    };
  }

  // Legacy fallback: if there is exactly one active assignment and it was
  // never marked primary, it is still unambiguous and safe to use.
  if (rows.length === 1) {
    return {
      ok: true,
      branchId: rows[0].id
    };
  }

  return {
    ok: false,
    code: 'AMBIGUOUS_ACTIVE_BRANCH'
  };
}

module.exports = {
  resolveAgentFinancialBranch
};
