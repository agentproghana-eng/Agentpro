// Turns machine names and raw data into wording any admin can read.
// Raw values are never thrown away: callers keep them behind
// "Technical details" or a tooltip.

export function humanize(value) {
  const text = String(value ?? '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

const EVENT_TITLES = {
  'transaction.initiated': 'Transaction started',
  'transaction.pending_confirmation': 'Waiting for confirmation',
  'transaction.completed': 'Transaction completed',
  'transaction.success': 'Transaction completed',
  'transaction.failed': 'Transaction failed',
};

export function eventTitle(name) {
  return EVENT_TITLES[name] || humanize(name) || 'Event';
}

const RULE_TITLES = {
  auth_login_failure_burst_10m: 'Repeated failed logins',
};

export function ruleTitle(ruleId, signalType) {
  return RULE_TITLES[ruleId] || humanize(ruleId || signalType) || 'Fraud signal';
}

const PROVIDERS = {
  mtn: 'MTN',
  telecel: 'Telecel',
  vodafone: 'Telecel',
  airteltigo: 'AirtelTigo',
  at: 'AirtelTigo',
};

export function providerLabel(value) {
  const key = String(value || '').toLowerCase();
  if (!key || key === 'unknown') return 'Not applicable';
  return PROVIDERS[key] || humanize(key);
}

const SIM_ROLES = {
  agent: 'Agent SIM',
  personal: 'Personal SIM',
  merchant: 'Merchant SIM',
};

const KEY_LABELS = {
  amount: 'Amount',
  currency: 'Currency',
  status: 'Status',
  provider: 'Provider',
  sim_role: 'SIM used',
  transaction_type: 'Type',
  reason: 'Reason',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
  name: 'Name',
};

export function keyLabel(key) {
  return KEY_LABELS[key] || humanize(key);
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const text = date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return text.replace('Sept', 'Sep').replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

export function formatValue(key, value, attrs = {}) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'provider') return providerLabel(value);
  if (key === 'sim_role') return SIM_ROLES[String(value).toLowerCase()] || humanize(value);
  if (key === 'amount' && !Number.isNaN(Number(value))) {
    const currency = String(attrs.currency || 'GHS').toUpperCase();
    const symbol = currency === 'GHS' ? 'GH₵' : currency;
    return `${symbol} ${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'string') {
    if (ISO.test(value)) return formatWhen(value);
    if (/^[a-z]+(_[a-z]+)+$/.test(value) || key === 'status' || key === 'transaction_type') {
      return humanize(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(key, item, attrs)).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${keyLabel(k)}: ${formatValue(k, v, value)}`)
      .join(' · ');
  }
  return String(value);
}

// Rows of { label, value } for a flat attributes object. The
// currency row is folded into the amount.
export function attributeRows(attrs) {
  if (!attrs || typeof attrs !== 'object') return [];
  return Object.entries(attrs)
    .filter(([key]) => !(key === 'currency' && 'amount' in attrs))
    .map(([key, value]) => ({
      label: keyLabel(key),
      value: formatValue(key, value, attrs),
    }));
}

// One short sentence about an operational event, when we can.
export function eventSummary(attrs) {
  if (!attrs || attrs.amount === undefined || !attrs.transaction_type) return '';
  const what = humanize(attrs.transaction_type);
  const amount = formatValue('amount', attrs.amount, attrs);
  const provider = attrs.provider ? ` on ${providerLabel(attrs.provider)}` : '';
  return `${what} of ${amount}${provider}`;
}
