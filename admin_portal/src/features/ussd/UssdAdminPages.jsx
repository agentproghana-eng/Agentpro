import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import { Badge, PageHeader } from '../../components/AdminUi.jsx';

// ── USSD Templates Page ───────────────────────────────────────

export function USSDTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editJson, setEditJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const load = async () => {
    try {
      const res = await API.get('/admin/ussd-templates');
      setTemplates(res.data.data || []);
    } catch (_) { toast.error('Failed to load templates'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (t) => {
    setEditing(t);
    setValidationError(null);
    setEditJson(JSON.stringify({
      ussd_string_pattern: t.ussd_string_pattern,
      placeholder_fields: t.placeholder_fields,
      pin_prompt_strings: t.pin_prompt_strings,
      success_strings: t.success_strings,
      failure_strings: t.failure_strings,
      timeout_seconds: t.timeout_seconds,
      retry_count: t.retry_count,
      is_active: t.is_active,
    }, null, 2));
  };

  // Catches the most dangerous mistake an admin could make here: adding
  // a PIN placeholder to the dial pattern. This is checked client-side
  // as an immediate guardrail, in addition to whatever the backend does.
  const validate = (parsed) => {
    const pattern = parsed.ussd_string_pattern || '';
    if (/\{pin\}/i.test(pattern)) {
      return 'ussd_string_pattern must never contain a {pin} placeholder. ' +
        'PIN entry is always handled by the network/OS, never by this app.';
    }
    const usedPlaceholders = [...pattern.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]);
    const declared = parsed.placeholder_fields || [];
    const undeclared = usedPlaceholders.filter(p => !declared.includes(p));
    if (undeclared.length > 0) {
      return `Pattern uses {${undeclared.join('}, {')}} but placeholder_fields doesn't list ` +
        `${undeclared.length > 1 ? 'them' : 'it'}. Add to placeholder_fields so the app knows to supply ${undeclared.length > 1 ? 'these values' : 'this value'}.`;
    }
    if (!Array.isArray(parsed.pin_prompt_strings) || parsed.pin_prompt_strings.length === 0) {
      return 'pin_prompt_strings cannot be empty — without it, the app cannot recognize ' +
        'a PIN prompt and pause correctly.';
    }
    if (parsed.retry_count !== undefined) {
      if (!Number.isInteger(parsed.retry_count) || parsed.retry_count < 0 || parsed.retry_count > 3) {
        return 'retry_count must be an integer between 0 and 3. The app only retries a ' +
          'clean no-response timeout on the initial dial — it never retries after a PIN ' +
          'prompt has been seen, regardless of this value.';
      }
    }
    return null;
  };

  const save = async () => {
    setValidationError(null);
    let parsed;
    try {
      parsed = JSON.parse(editJson);
    } catch (_) {
      setValidationError('Invalid JSON — check for missing commas or quotes.');
      return;
    }

    const error = validate(parsed);
    if (error) {
      setValidationError(error);
      return;
    }

    setSaving(true);
    try {
      await API.patch(`/admin/ussd-templates/${editing.id}`, parsed);
      toast.success('Template updated ✅ (no app update needed)');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const providerColor = { mtn: 'text-yellow-600', telecel: 'text-red-600', at_money: 'text-blue-600' };

  return (
    <div>
      <PageHeader title="USSD Templates"
        subtitle="Edit USSD dial patterns without releasing an app update" />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>⚡ Live Updates:</strong> Changes here take effect immediately on all devices.
        Each template is dialed as ONE combined USSD string (Android cannot reply to an
        already-open interactive USSD session — see migration 002 for why). Never add a
        <code className="mx-1 bg-amber-100 px-1 rounded">{'{pin}'}</code>
        placeholder — PIN entry is always handled by the network/OS, never by this app.
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : (
        <div className="grid gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`font-bold text-sm uppercase ${providerColor[t.provider]}`}>
                      {t.provider?.replace('_', ' ')}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="font-semibold text-gray-900">
                      {t.transaction_type?.replace(/_/g, ' ')}
                    </span>
                    <Badge status={t.is_active ? 'active' : 'deactivated'} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                    <span>Pattern: <span className="font-mono font-bold">{t.ussd_string_pattern || '— not set —'}</span></span>
                    <span>Timeout: {t.timeout_seconds}s</span>
                    <span>Retries: {t.retry_count ?? 0}</span>
                    <span>v{t.version}</span>
                  </div>
                </div>
                <button onClick={() => startEdit(t)}
                  className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/20 transition">
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Edit USSD Template</h3>
                <p className="text-sm text-gray-500">
                  {editing.provider?.toUpperCase()} · {editing.transaction_type?.replace(/_/g, ' ')}
                </p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
                🔒 <strong>SECURITY:</strong> Never add a <code>{'{pin}'}</code> placeholder to
                ussd_string_pattern. When the network's response matches pin_prompt_strings,
                the app pauses and lets the network/OS handle PIN entry — it never touches
                the PIN in any form.
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                💡 <strong>Example pattern:</strong> <code>*170*1*2*{'{customer_phone}'}*{'{amount}'}#</code> —
                the entire menu path is one string, dialed once. Placeholders are substituted
                before dialing.
                <br /><br />
                <strong>retry_count</strong> (0–3): only applies when the network gives NO
                response at all to the initial dial. Once a PIN prompt has been seen, the
                app never retries automatically, regardless of this value — that would risk
                double-submitting a transaction that may have already succeeded.
              </div>
              {validationError && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-3 mb-4 text-xs text-red-800 font-medium">
                  ⚠️ {validationError}
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-2">Template JSON</label>
              <textarea value={editJson} onChange={e => { setEditJson(e.target.value); setValidationError(null); }}
                rows={16}
                className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3
                  focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition">
                {saving ? 'Saving...' : '✅ Save & Deploy'}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── USSD Flows (Flow Builder) Page ────────────────────────────
// Interactive multi-step flows - distinct from the older single-dial
// ussd_templates system above (USSDTemplatesPage). This is where MTN
// Cash In/Out/Send Money, Telecel Deposit, Telecel Airtime, and MTN
// Balance Enquiry actually run.

const VALID_FLOW_ACTIONS = ['send_digit', 'send_customer_phone', 'send_account_number', 'send_amount', 'send_operator_id', 'send_reference', 'send_merchant_id', 'send_selection', 'await_user_selection', 'send_literal', 'pin_prompt', 'auto_confirm_once'];
const VALUE_REQUIRED_FLOW_ACTIONS = ['send_digit', 'send_literal', 'auto_confirm_once'];

// Mirrors the backend's validateFlowSteps exactly - this is a UX
// convenience only, the server-side check is what actually matters.
function normalizeFlowSnapshot(flow) {
  const normalizeList = value =>
    Array.isArray(value)
      ? value.map(item => String(item))
      : [];

  const normalizeActionValue = value => {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    return String(value);
  };

  return {
    dial_code:
      flow?.dial_code === null ||
      flow?.dial_code === undefined
        ? null
        : String(flow.dial_code),

    success_markers:
      normalizeList(flow?.success_markers),

    failure_markers:
      normalizeList(flow?.failure_markers),

    is_active:
      flow?.is_active !== false,

    steps:
      Array.isArray(flow?.steps)
        ? flow.steps.map(step => ({
            match_all:
              normalizeList(step?.match_all),
            action:
              String(step?.action || ''),
            action_value:
              normalizeActionValue(
                step?.action_value,
              ),
          }))
        : [],
  };
}

function flowSnapshotsMatch(expected, actual) {
  return (
    JSON.stringify(
      normalizeFlowSnapshot(expected),
    ) ===
    JSON.stringify(
      normalizeFlowSnapshot(actual),
    )
  );
}

function validateFlowSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'At least one step is required.';
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!Array.isArray(step.match_all) || step.match_all.length === 0) {
      return `Step ${i + 1}: match_all cannot be empty — a step with no match text can never fire.`;
    }
    if (!VALID_FLOW_ACTIONS.includes(step.action)) {
      return `Step ${i + 1}: "${step.action}" is not a valid action. Must be one of: ${VALID_FLOW_ACTIONS.join(', ')}.`;
    }
    if (VALUE_REQUIRED_FLOW_ACTIONS.includes(step.action) && !step.action_value) {
      return `Step ${i + 1}: action "${step.action}" requires an action_value.`;
    }
  }
  if (!steps.some(s => s.action === 'pin_prompt')) {
    return 'Flow has no pin_prompt step — without one, the app will never pause for real PIN entry.';
  }
  return null;
}

export function FlowsPage() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editJson, setEditJson] = useState('');
  const [creating, setCreating] = useState(false);
  const [newProvider, setNewProvider] = useState('mtn');
  const [newType, setNewType] = useState('');
  const [newDialCode, setNewDialCode] = useState('');
  const [newJson, setNewJson] = useState(JSON.stringify({
    success_markers: [],
    failure_markers: [],
    steps: [{ match_all: [''], action: 'send_digit', action_value: '' }],
  }, null, 2));
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [testScreenText, setTestScreenText] = useState('');
  const [testFromStep, setTestFromStep] = useState(1);
  const [testResult, setTestResult] = useState(undefined); // undefined = not run, null = no match, object = matched

  const load = async () => {
    try {
      const res = await API.get('/admin/ussd-flows');
      setFlows(res.data.data || []);
    } catch (_) { toast.error('Failed to load flows'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verifyPersistedFlow = async (
    flowId,
    expected,
  ) => {
    const response =
      await API.get(
        `/admin/ussd-flows/${flowId}`,
      );

    const persisted =
      response.data?.data;

    if (
      !persisted ||
      !flowSnapshotsMatch(
        expected,
        persisted,
      )
    ) {
      const error =
        new Error(
          'FLOW_READ_AFTER_WRITE_MISMATCH',
        );

      error.code =
        'FLOW_READ_AFTER_WRITE_MISMATCH';

      throw error;
    }

    return persisted;
  };

  const startEdit = async (f) => {
    setValidationError(null);
    setTestScreenText('');
    setTestFromStep(1);
    setTestResult(undefined);
    try {
      const res = await API.get(`/admin/ussd-flows/${f.id}`);
      const full = res.data.data;
      setEditing(full);
      setEditJson(JSON.stringify({
        dial_code: full.dial_code,
        success_markers: full.success_markers,
        failure_markers: full.failure_markers,
        is_active: full.is_active,
        steps: full.steps.map(s => ({ match_all: s.match_all, action: s.action, action_value: s.action_value })),
      }, null, 2));
    } catch (_) {
      toast.error('Failed to load flow details');
    }
  };

  // Mirrors UssdAccessibilityService.kt's handleGenericStep() matching
  // logic exactly: lowercase the screen text, find the first step at
  // or after fromIndex whose match_all substrings are ALL present.
  // Lets an admin verify a step will actually fire against real
  // screen text (e.g. copied from a screenshot) without needing a
  // live device test.
  const runStepTest = () => {
    let parsed;
    try {
      parsed = JSON.parse(editJson);
    } catch (_) {
      toast.error('Fix the JSON before testing');
      return;
    }
    const steps = parsed.steps || [];
    const lowerScreen = testScreenText.toLowerCase();
    const fromIndex = testFromStep - 1;
    let matched = null;
    for (let i = fromIndex; i < steps.length; i++) {
      const step = steps[i];
      if (Array.isArray(step.match_all) && step.match_all.length > 0 &&
          step.match_all.every(m => lowerScreen.includes(String(m).toLowerCase()))) {
        matched = { matchedIndex: i, step };
        break;
      }
    }
    setTestResult(matched);
  };

  const save = async () => {
    setValidationError(null);
    let parsed;
    try {
      parsed = JSON.parse(editJson);
    } catch (_) {
      setValidationError('Invalid JSON — check for missing commas or quotes.');
      return;
    }
    if (parsed.dial_code && (!parsed.dial_code.startsWith('*') || !parsed.dial_code.endsWith('#'))) {
      setValidationError('dial_code must start with * and end with #.');
      return;
    }
    const stepsError = validateFlowSteps(parsed.steps);
    if (stepsError) {
      setValidationError(stepsError);
      return;
    }
    setSaving(true);

    try {
      await API.patch(
        `/admin/ussd-flows/${editing.id}`,
        parsed,
      );

      await verifyPersistedFlow(
        editing.id,
        {
          ...editing,
          ...parsed,
          steps: parsed.steps,
        },
      );

      toast.success(
        'Flow updated and verified live ✅',
      );

      setEditing(null);
      await load();
    } catch (e) {
      if (
        e?.code ===
        'FLOW_READ_AFTER_WRITE_MISMATCH'
      ) {
        toast.error(
          'Flow save returned success, but the live read-back did not match. Do not test this flow yet.',
        );
      } else {
        toast.error(
          e.response?.data?.message ||
          'Flow save or verification failed',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const createFlow = async () => {
    setValidationError(null);
    if (!newType.trim()) {
      setValidationError('Transaction type is required (e.g. airtime, data_bundle).');
      return;
    }
    if (!newDialCode.startsWith('*') || !newDialCode.endsWith('#')) {
      setValidationError('Dial code must start with * and end with #.');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(newJson);
    } catch (_) {
      setValidationError('Invalid JSON — check for missing commas or quotes.');
      return;
    }
    const stepsError = validateFlowSteps(parsed.steps);
    if (stepsError) {
      setValidationError(stepsError);
      return;
    }
    setSaving(true);

    try {
      const response =
        await API.post(
          '/admin/ussd-flows',
          {
            provider: newProvider,
            transaction_type:
              newType.trim(),
            dial_code:
              newDialCode.trim(),
            success_markers:
              parsed.success_markers || [],
            failure_markers:
              parsed.failure_markers || [],
            steps:
              parsed.steps,
          },
        );

      const created =
        response.data?.data;

      if (!created?.id) {
        throw new Error(
          'FLOW_CREATE_ID_MISSING',
        );
      }

      await verifyPersistedFlow(
        created.id,
        {
          ...created,
          dial_code:
            newDialCode.trim(),
          success_markers:
            parsed.success_markers || [],
          failure_markers:
            parsed.failure_markers || [],
          is_active: true,
          steps:
            parsed.steps,
        },
      );

      toast.success(
        'Flow created and verified live ✅',
      );

      setCreating(false);
      setNewType('');
      setNewDialCode('');

      await load();
    } catch (e) {
      if (
        e?.code ===
        'FLOW_READ_AFTER_WRITE_MISMATCH'
      ) {
        toast.error(
          'Flow creation returned success, but the live read-back did not match. Do not test this flow yet.',
        );
      } else {
        toast.error(
          e.response?.data?.message ||
          'Flow creation or verification failed',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const providerColor = { mtn: 'text-yellow-600', telecel: 'text-red-600', at_money: 'text-blue-600' };

  return (
    <div>
      <PageHeader title="USSD Flows"
        subtitle="Interactive multi-step USSD automation — dial codes, menu navigation, and PIN handoff, editable without an app release"
        action={
          <button onClick={() => { setCreating(true); setValidationError(null); }}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
            + New Flow
          </button>
        } />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>⚡ Live Updates:</strong> Saved changes are read back from the API before
        this portal reports them as live. Supported online app builds resolve the current server flow —
        no Play Store release is required for a normal provider-flow edit. Each step fires when ALL of its <code className="mx-1 bg-amber-100 px-1 rounded">match_all</code> substrings
        appear on the live USSD screen. Every flow must include a <code className="mx-1 bg-amber-100 px-1 rounded">pin_prompt</code> step —
        that's where automation stops and hands PIN entry to the agent and the real network screen.
        Wrong or guessed <code className="mx-1 bg-amber-100 px-1 rounded">match_all</code> text or
        markers can leave a transaction hanging indefinitely — verify against a real device before
        trusting a new flow.
      </div>

      {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : (
        <div className="grid gap-4">
          {flows.map(f => (
            <div key={f.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`font-bold text-sm uppercase ${providerColor[f.provider]}`}>
                      {f.provider?.replace('_', ' ')}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="font-semibold text-gray-900">
                      {f.transaction_type?.replace(/_/g, ' ')}
                    </span>
                    <Badge status={f.is_active ? 'active' : 'deactivated'} />
                    {f.company_id && <span className="text-xs text-gray-400">(company-specific)</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                    <span>Dial: <span className="font-mono font-bold">{f.dial_code}</span></span>
                    <span>{f.step_count} step{f.step_count === 1 ? '' : 's'}</span>
                    <span>{f.success_markers?.length || 0} success marker{(f.success_markers?.length || 0) === 1 ? '' : 's'}</span>
                    <span>{f.failure_markers?.length || 0} failure marker{(f.failure_markers?.length || 0) === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <button onClick={() => startEdit(f)}
                  className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/20 transition">
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Edit USSD Flow</h3>
                <p className="text-sm text-gray-500">
                  {editing.provider?.toUpperCase()} · {editing.transaction_type?.replace(/_/g, ' ')}
                </p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
                🔒 <strong>SECURITY:</strong> Any step that reaches a screen asking for the MoMo
                PIN must use <code>pin_prompt</code> — automation stops there completely and the
                agent enters it directly on the real network screen.
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                💡 <strong>Actions:</strong> <code>send_digit</code>/<code>send_literal</code> type
                a fixed <code>action_value</code>. <code>send_customer_phone</code>, <code>send_account_number</code>,{' '}
                <code>send_amount</code>, <code>send_operator_id</code>, <code>send_reference</code>,{' '}
                <code>send_merchant_id</code> type the transaction's own value automatically.{' '}
                <code>send_selection</code> uses the transaction's next validated dynamic menu selection.{' '}
                <code>auto_confirm_once</code> sends a
                fixed value exactly once, after the PIN.
              </div>
              {validationError && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-3 mb-4 text-xs text-red-800 font-medium">
                  ⚠️ {validationError}
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-2">Flow JSON</label>
              <textarea value={editJson} onChange={e => { setEditJson(e.target.value); setValidationError(null); }}
                rows={20}
                className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3
                  focus:outline-none focus:ring-2 focus:ring-primary resize-none" />

              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">Test a Screen (optional)</label>
                <p className="text-xs text-gray-500 mb-2">
                  Paste real text from a USSD screen (e.g. copied from a screenshot) to see which
                  step would fire — same matching logic the app actually uses.
                </p>
                <textarea value={testScreenText} onChange={e => { setTestScreenText(e.target.value); setTestResult(undefined); }}
                  rows={3} placeholder="e.g. MainMenuAgent 1) Pay To 2) Cash Out 3) Cash In..."
                  className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3 mb-2
                    focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-600">Starting from step:</label>
                  <input type="number" min="1" value={testFromStep}
                    onChange={e => setTestFromStep(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-xs" />
                  <button onClick={runStepTest}
                    className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-900 transition">
                    Simulate
                  </button>
                </div>
                {testResult !== undefined && (
                  testResult ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                      ✅ <strong>Step {testResult.matchedIndex + 1}</strong> would fire — action: <code>{testResult.step.action}</code>
                      {testResult.step.action_value ? <> (value: <code>{testResult.step.action_value}</code>)</> : ''}
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                      ❌ No step matches this text — automation would do nothing here. Check your <code>match_all</code> wording.
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={save} disabled={saving}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition">
                {saving ? 'Saving...' : '✅ Save & Deploy'}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">New USSD Flow</h3>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                  <select value={newProvider} onChange={e => setNewProvider(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm">
                    <option value="mtn">MTN</option>
                    <option value="telecel">Telecel</option>
                    <option value="at_money">AirtelTigo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
                  <input value={newType} onChange={e => setNewType(e.target.value)}
                    placeholder="e.g. airtime, data_bundle"
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm" />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Dial Code</label>
                <input value={newDialCode} onChange={e => setNewDialCode(e.target.value)}
                  placeholder="*171#"
                  className="w-full font-mono border border-gray-200 rounded-lg p-2.5 text-sm" />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                💡 Map this out on a real device first — dial, screenshot every screen, then fill
                in <code>match_all</code> (lowercase text from that screen) and the matching{' '}
                <code>action</code> for each step, in order. Must include a <code>pin_prompt</code> step.
              </div>
              {validationError && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-3 mb-4 text-xs text-red-800 font-medium">
                  ⚠️ {validationError}
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-2">Markers &amp; Steps JSON</label>
              <textarea value={newJson} onChange={e => { setNewJson(e.target.value); setValidationError(null); }}
                rows={16}
                className="w-full font-mono text-xs border border-gray-200 rounded-lg p-3
                  focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={createFlow} disabled={saving}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition">
                {saving ? 'Creating...' : '✅ Create & Deploy'}
              </button>
              <button onClick={() => setCreating(false)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
