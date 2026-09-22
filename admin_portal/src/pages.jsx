import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from './lib/api.js';
import toast from 'react-hot-toast';
import {
  Badge,
  Table,
  PageHeader,
  StatCard,
} from './components/AdminUi.jsx';

// ── Shared Admin UI ───────────────────────────────────────────
export {
  Badge,
  Table,
  PageHeader,
  StatCard,
} from './components/AdminUi.jsx';

// ── User Management Pages ─────────────────────────────────────
export {
  CompaniesPage,
  PersonalUsersPage,
  CompanyDetailPage,
} from './features/users/UserManagementPages.jsx';

// ── Marketplace Businesses Page ───────────────────────────────


export { MarketplaceBusinessesPage } from './features/marketplace/MarketplaceBusinessesPage.jsx';

export {
  CommunityModerationPage,
} from './features/community/CommunityModerationPage.jsx';

// ── Shifts Page ────────────────────────────────────────────────
// Shift open/close history with cash variance, sourced from the
// existing cursor endpoint and its role/company/branch scoping.

export function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const latestFlaggedRef = useRef(false);

  const load = async ({
    cursor = null,
    append = false,
    flagged =
      latestFlaggedRef.current,
  } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response =
        await API.get(
          '/shifts/cursor',
          {
            params: {
              flagged_only: flagged,
              limit: 50,
              ...(cursor
                ? { cursor }
                : {}),
            },
          },
        );

      if (
        flagged !==
        latestFlaggedRef.current
      ) {
        return;
      }

      const rows =
        response.data.data || [];

      setShifts(current => {
        if (!append) {
          return rows;
        }

        const seen = new Set(
          current.map(shift => shift.id),
        );

        return [
          ...current,
          ...rows.filter(
            shift =>
              !seen.has(shift.id),
          ),
        ];
      });

      setNextCursor(
        response.data.pagination
          ?.next_cursor || null,
      );

      setHasMore(
        Boolean(
          response.data.pagination
            ?.has_more,
        ),
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load shifts',
      );
    } finally {
      if (
        flagged ===
        latestFlaggedRef.current
      ) {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    }
  };

  useEffect(() => {
    latestFlaggedRef.current =
      flaggedOnly;

    setShifts([]);
    setNextCursor(null);
    setHasMore(false);

    load({
      flagged: flaggedOnly,
    });
  }, [flaggedOnly]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    load({
      cursor: nextCursor,
      append: true,
      flagged:
        latestFlaggedRef.current,
    });
  };

  return (
    <div>
      <PageHeader
        title="Shifts"
        subtitle="Shift open/close history and cash variance"
        action={
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={event =>
                setFlaggedOnly(
                  event.target.checked,
                )
              }
            />
            Flagged only
          </label>
        }
      />

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table
          loading={loading}
          data={shifts}
          emptyMsg="No closed shifts yet"
          columns={[
            {
              key: 'agent',
              label: 'Agent',
              render: row =>
                `${row.first_name} ${row.last_name}`,
            },
            {
              key: 'branch_name',
              label: 'Branch',
              render: row =>
                row.branch_name || '—',
            },
            {
              key: 'opened_at',
              label: 'Opened',
              render: row =>
                row.opened_at
                  ? new Date(
                      row.opened_at,
                    ).toLocaleString()
                  : '—',
            },
            {
              key: 'closed_at',
              label: 'Closed',
              render: row =>
                row.closed_at
                  ? new Date(
                      row.closed_at,
                    ).toLocaleString()
                  : '—',
            },
            {
              key: 'transaction_count',
              label: 'Transactions',
              render: row =>
                row.transaction_count ??
                '—',
            },
            {
              key: 'closing_cash_expected',
              label: 'Expected',
              render: row =>
                `GH₵ ${parseFloat(
                  row.closing_cash_expected ||
                    0,
                ).toFixed(2)}`,
            },
            {
              key: 'closing_cash_actual',
              label: 'Actual',
              render: row =>
                `GH₵ ${parseFloat(
                  row.closing_cash_actual ||
                    0,
                ).toFixed(2)}`,
            },
            {
              key: 'variance',
              label: 'Variance',
              render: row => {
                const value =
                  parseFloat(
                    row.variance || 0,
                  );

                return (
                  <span
                    className={
                      row.flagged
                        ? 'text-red-600 font-bold'
                        : 'text-gray-700'
                    }
                  >
                    {value > 0
                      ? '+'
                      : ''}
                    {value.toFixed(2)}
                    {row.flagged
                      ? ' ⚠️'
                      : ''}
                  </span>
                );
              },
            },
          ]}
        />

        {hasMore && !loading && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={
                loadingMore ||
                !nextCursor
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore
                ? 'Loading...'
                : 'Load more shifts'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { USSDTemplatesPage, FlowsPage } from './features/ussd/UssdAdminPages.jsx';

// ── Audit Logs Page ───────────────────────────────────────────

export function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({ action: '', from_date: '', to_date: '' });

  const load = async ({ cursor = null, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = { limit: 50 };
      if (filters.action) params.action = filters.action;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      if (cursor) params.cursor = cursor;

      const res = await API.get('/admin/audit-logs/cursor', { params });
      const rows = res.data.data || [];
      const meta = res.data.meta || {};

      if (append) {
        setLogs(current => {
          const seen = new Set(current.map(row => row.id));
          return [
            ...current,
            ...rows.filter(row => !seen.has(row.id)),
          ];
        });
      } else {
        setLogs(rows);
      }

      setNextCursor(meta.next_cursor || null);
      setHasMore(meta.has_more === true);
    } catch (_) {
      toast.error('Failed to load audit logs');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const applyFilters = () => {
    setLogs([]);
    setNextCursor(null);
    setHasMore(false);
    load();
  };

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    load({ cursor: nextCursor, append: true });
  };

  useEffect(() => { load(); }, []);

  const resultColor = { success: 'text-green-600', failure: 'text-red-600' };

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Full record of all user and system actions" />

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action Filter</label>
          <input value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
            placeholder="e.g. TRANSACTION"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From Date</label>
          <input type="date" value={filters.from_date}
            onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To Date</label>
          <input type="date" value={filters.to_date}
            onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <button onClick={applyFilters}
          className="bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
          Apply
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table
          loading={loading}
          data={logs}
          emptyMsg="No audit logs found"
          columns={[
            { key: 'created_at', label: 'Time',
              render: r => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
            { key: 'user_email', label: 'User',
              render: r => (
                <div>
                  <p className="font-medium text-xs">{r.user_email || 'System'}</p>
                  <p className="text-gray-400 text-xs">{r.user_role}</p>
                </div>
              )},
            { key: 'action', label: 'Action',
              render: r => <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{r.action}</span> },
            { key: 'entity_type', label: 'Entity',
              render: r => r.entity_type ? (
                <span className="text-xs text-gray-500">{r.entity_type}</span>
              ) : '—' },
            { key: 'details', label: 'Details',
              render: r => {
                const values = r.new_values || r.old_values;
                if (!values || Object.keys(values).length === 0) return '—';
                const summary = Object.entries(values)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join(', ');
                return (
                  <span className="text-xs text-gray-600 truncate max-w-xs block" title={summary}>
                    {summary}
                  </span>
                );
              }},
            { key: 'ip_address', label: 'IP',
              render: r => <span className="font-mono text-xs">{r.ip_address || '—'}</span> },
            { key: 'result', label: 'Result',
              render: r => (
                <span className={`font-semibold text-xs ${resultColor[r.result] || 'text-gray-500'}`}>
                  {r.result?.toUpperCase()}
                </span>
              )},
            { key: 'error_message', label: 'Error',
              render: r => r.error_message ? (
                <span className="text-xs text-red-500 truncate max-w-xs block" title={r.error_message}>
                  {r.error_message}
                </span>
              ) : '—' },
          ]}
        />

        {hasMore && (
          <div className="border-t border-gray-100 p-4 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore || !nextCursor}
              className="border border-gray-200 bg-white px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Commission Rules Page ─────────────────────────────────────

const commissionTypesByProvider = {
  mtn: [
    {
      value: 'send_money',
      label: 'Cash In',
    },
    {
      value: 'cash_out',
      label: 'Cash Out',
    },
  ],
  telecel: [
    {
      value: 'cash_in',
      label: 'Deposit',
    },
    {
      value: 'cash_out',
      label: 'Withdrawal',
    },
  ],
  at_money: [
    {
      value: 'cash_in',
      label: 'Deposit',
    },
    {
      value: 'cash_out',
      label: 'Withdrawal',
    },
  ],
};

export function CommissionsPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    rate_percent: '', threshold_amount: '', cap_amount: '',
    provider: '', transaction_type: '',
    effective_from: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const transactionTypeOptions =
    commissionTypesByProvider[
      form.provider
    ] || [];

  const load = async () => {
    try {
      const res = await API.get('/commissions/rules');
      setRules(res.data.data || []);
    } catch (_) { toast.error('Failed to load rules'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.rate_percent) {
      return toast.error(
        'Rate is required'
      );
    }

    if (!form.provider) {
      return toast.error(
        'Provider is required'
      );
    }

    if (!form.transaction_type) {
      return toast.error(
        'Transaction type is required'
      );
    }

    setSaving(true);
    try {
      await API.post('/commissions/rules', {
        rate_percent: parseFloat(form.rate_percent),
        threshold_amount: form.threshold_amount ? parseFloat(form.threshold_amount) : null,
        cap_amount: form.cap_amount ? parseFloat(form.cap_amount) : null,
        provider: form.provider,
        transaction_type: form.transaction_type,
        effective_from: form.effective_from,
      });
      toast.success('Commission rule created ✅');
      setShowAdd(false);
      load();
    } catch (_) { toast.error('Failed to create rule'); }
    finally { setSaving(false); }
  };

  const exampleCalc = (rule) => {
    const rate = parseFloat(rule.rate_percent);
    const threshold = rule.threshold_amount ? parseFloat(rule.threshold_amount) : null;
    const cap = rule.cap_amount ? parseFloat(rule.cap_amount) : null;

    const amounts = [100, 500, threshold || 1000, (threshold || 1000) + 100].filter(Boolean);
    return amounts.map(amt => {
      let gross = amt * rate;
      if (threshold && cap && amt >= threshold) gross = Math.min(gross, cap);
      gross = Math.round(gross * 100) / 100;
      const net = gross;
      return { amount: amt, gross, net };
    });
  };

  return (
    <div>
      <PageHeader title="Commission Rules"
        subtitle="Global and company-specific commission structures"
        action={
          <button onClick={() => setShowAdd(true)}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-dark transition">
            + Add Rule
          </button>
        } />

      {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : (
        <div className="grid gap-4">
          {rules.map(rule => {
            const examples = exampleCalc(rule);
            return (
              <div key={rule.id} className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex flex-wrap gap-3 items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">
                        {(parseFloat(rule.rate_percent) * 100).toFixed(2)}% commission
                      </span>
                      {rule.threshold_amount && (
                        <span className="text-sm text-gray-500">
                          · capped at GH₵{parseFloat(rule.cap_amount).toFixed(2)} above GH₵{parseFloat(rule.threshold_amount).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {rule.provider ? (
                        <Badge status={rule.provider} />
                      ) : (
                        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Legacy wildcard — ignored</span>
                      )}
                      {rule.transaction_type ? (
                        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                          {rule.transaction_type.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Legacy wildcard — ignored</span>
                      )}
                      {rule.company_id ? (
                        <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">Custom Rule</span>
                      ) : (
                        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Global Rule</span>
                      )}
                      <Badge status={rule.is_active ? 'active' : 'deactivated'} />
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>Full configured commission goes to the agent</p>
                    <p>From: {rule.effective_from}</p>
                  </div>
                </div>

                {/* Example calculations */}
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                    Example Calculations
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-3 py-2 text-gray-500">Transaction</th>
                        <th className="text-left px-3 py-2 text-gray-500">Provider Commission</th>
                        <th className="text-left px-3 py-2 text-gray-500">Agent Receives</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examples.map((ex, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-2">GH₵ {ex.amount.toFixed(2)}</td>
                          <td className="px-3 py-2">GH₵ {ex.gross.toFixed(2)}</td>
                          <td className="px-3 py-2 font-semibold text-green-700">GH₵ {ex.net.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">Add Commission Rule</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate % *</label>
                  <input type="number" step="0.01" value={form.rate_percent}
                    onChange={e => setForm(f => ({ ...f, rate_percent: e.target.value }))}
                    placeholder="e.g. 0.02 for 2%"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Threshold (GH₵)</label>
                  <input type="number" value={form.threshold_amount}
                    onChange={e => setForm(f => ({ ...f, threshold_amount: e.target.value }))}
                    placeholder="Cap applies above this"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cap Amount (GH₵)</label>
                  <input type="number" value={form.cap_amount}
                    onChange={e => setForm(f => ({ ...f, cap_amount: e.target.value }))}
                    placeholder="Max commission"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
                  <select
                    value={form.provider}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        provider: e.target.value,
                        transaction_type: '',
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Select provider</option>
                    <option value="mtn">MTN Mobile Money</option>
                    <option value="telecel">Telecel Cash</option>
                    <option value="at_money">AT Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
                  <select
                    value={form.transaction_type}
                    disabled={!form.provider}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        transaction_type: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400">
                    <option value="">
                      {form.provider
                        ? 'Select transaction type'
                        : 'Select provider first'}
                    </option>
                    {transactionTypeOptions.map(option => (
                      <option
                        key={option.value}
                        value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
                <input type="date" value={form.effective_from}
                  onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition">
                {saving ? 'Saving...' : 'Create Rule'}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
