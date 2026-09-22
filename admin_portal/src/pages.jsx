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
