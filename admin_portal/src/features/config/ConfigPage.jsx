import {
  useEffect,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import { humanize } from '../../lib/plainText.js';

const UNITS = { days: 'days', minutes: 'minutes', hours: 'hours', seconds: 'seconds' };

// "ad_duration_days" -> "Ad duration (days)"
function settingLabel(key) {
  const parts = String(key).split('_');
  const unit = UNITS[parts[parts.length - 1]];
  if (unit && parts.length > 1) {
    return `${humanize(parts.slice(0, -1).join('_'))} (${unit})`;
  }
  return humanize(key);
}

function displayValue(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === '[]' || text === '{}' || text === 'null') {
    return 'None set';
  }
  return text;
}

// ── System Config Page ────────────────────────────────────────

export function ConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [editing, setEditing] = useState({});
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const visible = term
    ? configs.filter(c =>
        [c.key, settingLabel(c.key), c.description]
          .some(v => String(v || '').toLowerCase().includes(term)),
      )
    : configs;

  useEffect(() => {
    API.get('/admin/config').then(r => setConfigs(r.data.data || []));
  }, []);

  const save = async (key, value) => {
    try {
      await API.patch(`/admin/config/${key}`, { value });
      toast.success('Config updated');
      setEditing(prev => ({ ...prev, [key]: undefined }));
      API.get('/admin/config').then(r => setConfigs(r.data.data || []));
    } catch (_) { toast.error('Failed to update'); }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">System Configuration</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Settings that change how AgentPro behaves. Changes take effect straight away.
      </p>

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Search settings"
        placeholder="Search settings…"
        className="mb-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-72"
      />

      <div className="space-y-3 md:hidden">
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No settings match your search.</p>
        )}
        {visible.map(c => (
          <div key={c.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-base font-bold text-gray-900">{settingLabel(c.key)}</p>
            {c.description && <p className="mt-1 text-sm text-gray-500">{c.description}</p>}
            {editing[c.key] !== undefined ? (
              <div className="mt-3">
                <input value={editing[c.key]}
                  onChange={e => setEditing(prev => ({ ...prev, [c.key]: e.target.value }))}
                  aria-label={settingLabel(c.key)}
                  className="w-full rounded-lg border-2 border-primary px-3 py-2.5 text-base focus:outline-none" />
                <div className="mt-3 flex gap-2">
                  <button onClick={() => save(c.key, editing[c.key])}
                    className="flex-1 rounded-lg bg-primary py-3 text-sm font-semibold text-white">Save</button>
                  <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: undefined }))}
                    className="flex-1 rounded-lg border border-gray-300 py-3 text-sm text-gray-700">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="min-w-0 break-all text-lg font-bold text-gray-900">{displayValue(c.value)}</span>
                <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: c.value }))}
                  className="shrink-0 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary">Edit</button>
              </div>
            )}
            <p className="mt-2 break-all font-mono text-[11px] text-gray-400">{c.key}</p>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 font-semibold">Key</th>
              <th className="text-left p-4 font-semibold">Value</th>
              <th className="text-left p-4 font-semibold">Description</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(c => (
              <tr key={c.key}>
                <td className="p-4 font-mono text-xs text-gray-600">{c.key}</td>
                <td className="p-4">
                  {editing[c.key] !== undefined ? (
                    <input value={editing[c.key]}
                      onChange={e => setEditing(prev => ({ ...prev, [c.key]: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-primary" />
                  ) : (
                    <span className="font-semibold">{displayValue(c.value)}</span>
                  )}
                </td>
                <td className="p-4 text-gray-500 text-xs">{c.description}</td>
                <td className="p-4">
                  {editing[c.key] !== undefined ? (
                    <div className="flex gap-2">
                      <button onClick={() => save(c.key, editing[c.key])}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded">Save</button>
                      <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: undefined }))}
                        className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: c.value }))}
                      className="text-xs text-primary hover:underline">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
