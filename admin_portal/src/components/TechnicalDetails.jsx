import { useState } from 'react';
import toast from 'react-hot-toast';

// Collapsed by default. Holds the raw IDs a developer or support
// lead may need, so everyone else sees plain words only.
export function TechnicalDetails({ rows }) {
  const [open, setOpen] = useState(false);
  const shown = (rows || []).filter((row) => row.value);
  if (shown.length === 0) return null;

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Technical details {open ? '▴' : '▾'}
      </button>
      {open && (
        <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3 text-xs">
          {shown.map((row) => (
            <div key={row.label}>
              <dt className="text-gray-400">{row.label}</dt>
              <dd className="flex items-start justify-between gap-2">
                <span className="break-all font-mono text-gray-600">{row.value}</span>
                <button
                  type="button"
                  onClick={() => copy(row.value)}
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  Copy
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PlainRows({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <dl className="mt-3 divide-y divide-gray-100 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 py-1.5">
          <dt className="text-gray-500">{row.label}</dt>
          <dd className="text-right font-medium text-gray-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
