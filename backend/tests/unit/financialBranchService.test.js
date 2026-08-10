const {
  resolveAgentFinancialBranch
} = require('../../src/services/financialBranchService');

describe('Financial branch resolution', () => {
  const agentId = 'agent-1';
  const companyId = 'company-1';

  it('uses the single active primary branch', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        { id: 'branch-primary', is_primary: true },
        { id: 'branch-secondary', is_primary: false }
      ]
    });

    const result = await resolveAgentFinancialBranch({
      queryFn,
      agentId,
      companyId
    });

    expect(result).toEqual({
      ok: true,
      branchId: 'branch-primary'
    });
  });

  it('uses a single active legacy branch even when not marked primary', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        { id: 'branch-legacy', is_primary: false }
      ]
    });

    const result = await resolveAgentFinancialBranch({
      queryFn,
      agentId,
      companyId
    });

    expect(result).toEqual({
      ok: true,
      branchId: 'branch-legacy'
    });
  });

  it('rejects when there is no active branch', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: []
    });

    const result = await resolveAgentFinancialBranch({
      queryFn,
      agentId,
      companyId
    });

    expect(result).toEqual({
      ok: false,
      code: 'NO_ACTIVE_BRANCH'
    });
  });

  it('rejects multiple primary branches', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        { id: 'branch-1', is_primary: true },
        { id: 'branch-2', is_primary: true }
      ]
    });

    const result = await resolveAgentFinancialBranch({
      queryFn,
      agentId,
      companyId
    });

    expect(result).toEqual({
      ok: false,
      code: 'AMBIGUOUS_PRIMARY_BRANCH'
    });
  });

  it('rejects multiple active branches when none is primary', async () => {
    const queryFn = jest.fn().mockResolvedValue({
      rows: [
        { id: 'branch-1', is_primary: false },
        { id: 'branch-2', is_primary: false }
      ]
    });

    const result = await resolveAgentFinancialBranch({
      queryFn,
      agentId,
      companyId
    });

    expect(result).toEqual({
      ok: false,
      code: 'AMBIGUOUS_ACTIVE_BRANCH'
    });
  });
});
