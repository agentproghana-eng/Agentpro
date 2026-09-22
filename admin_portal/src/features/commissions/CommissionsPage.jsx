import {
  useEffect,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  Badge,
  PageHeader,
} from '../../components/AdminUi.jsx';

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
