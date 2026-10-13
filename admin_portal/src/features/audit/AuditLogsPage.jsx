import {
  useEffect,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import { attributeRows, formatWhen, humanize } from '../../lib/plainText.js';
import {
  PageHeader,
  Table,
} from '../../components/AdminUi.jsx';

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
              render: r => r.created_at ? formatWhen(r.created_at) : '—' },
            { key: 'user_email', label: 'User',
              render: r => (
                <div>
                  <p className="font-medium text-xs">{r.user_email || 'System'}</p>
                  <p className="text-gray-400 text-xs">{r.user_role}</p>
                </div>
              )},
            { key: 'action', label: 'Action',
              render: r => (
                <span className="text-xs font-medium text-gray-800" title={r.action}>
                  {humanize(r.action)}
                </span>
              ) },
            { key: 'entity_type', label: 'What it affected',
              render: r => r.entity_type ? (
                <span className="text-xs text-gray-500" title={r.entity_type}>{humanize(r.entity_type)}</span>
              ) : '—' },
            { key: 'details', label: 'Details',
              render: r => {
                const values = r.new_values || r.old_values;
                if (!values || Object.keys(values).length === 0) return '—';
                const rows = attributeRows(values);
                return (
                  <ul className="max-w-xs space-y-0.5 text-xs text-gray-600">
                    {rows.map(row => (
                      <li key={row.label}>
                        <span className="text-gray-400">{row.label}:</span>{' '}
                        {row.value}
                      </li>
                    ))}
                  </ul>
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
