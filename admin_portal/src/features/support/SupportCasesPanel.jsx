import {
  useEffect,
  useState,
} from 'react';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import toast from 'react-hot-toast';

import API from '../../lib/api.js';

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

function dateLabel(value) {
  if (!value) return '—';

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function badgeClasses(value) {
  if (value === 'urgent' || value === 'closed') {
    return 'bg-red-50 text-red-700';
  }

  if (value === 'high' || value === 'in_progress') {
    return 'bg-amber-50 text-amber-700';
  }

  if (value === 'resolved') {
    return 'bg-green-50 text-green-700';
  }

  return 'bg-gray-100 text-gray-700';
}

function CaseBadge({ value, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(value)}`}
    >
      {label || value}
    </span>
  );
}

export default function SupportCasesPanel() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('open');
  const [type, setType] = useState('all');
  const [priority, setPriority] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [extraCases, setExtraCases] = useState([]);
  const [reply, setReply] = useState('');

  useEffect(() => {
    setCursor(null);
    setExtraCases([]);
    setSelectedId(null);
  }, [status, type, priority]);

  const casesQuery = useQuery({
    queryKey: [
      'admin',
      'support-cases',
      status,
      type,
      priority,
      cursor,
    ],
    retry: false,
    queryFn: async () => {
      const response = await API.get('/admin/support/cases', {
        params: {
          status,
          type,
          priority,
          cursor: cursor || undefined,
          limit: 50,
        },
      });

      return response.data.data || {
        cases: [],
        next_cursor: null,
      };
    },
  });

  useEffect(() => {
    if (!casesQuery.data?.cases) return;

    if (!cursor) {
      setExtraCases(casesQuery.data.cases);
      return;
    }

    setExtraCases((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));

      for (const item of casesQuery.data.cases) {
        byId.set(item.id, item);
      }

      return [...byId.values()];
    });
  }, [casesQuery.data, cursor]);

  const detailQuery = useQuery({
    queryKey: [
      'admin',
      'support-case',
      selectedId,
    ],
    enabled: Boolean(selectedId),
    retry: false,
    queryFn: async () => {
      const response = await API.get(
        `/admin/support/cases/${selectedId}`,
      );

      return response.data.data;
    },
  });

  const refreshCases = async () => {
    setCursor(null);
    setExtraCases([]);

    await queryClient.invalidateQueries({
      queryKey: ['admin', 'support-cases'],
    });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ caseId, patch }) => {
      const response = await API.patch(
        `/admin/support/cases/${caseId}`,
        patch,
      );

      return response.data.data;
    },
    onSuccess: async () => {
      toast.success('Support case updated.');
      await refreshCases();
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'support-case', selectedId],
      });
    },
    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          'Support case update failed.',
      );
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const response = await API.post(
        `/admin/support/cases/${selectedId}/reply`,
        {
          message: reply.trim(),
        },
      );

      return response.data.data;
    },
    onSuccess: async () => {
      setReply('');
      toast.success('Reply sent to the user.');
      await refreshCases();
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'support-case', selectedId],
      });
    },
    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          'Support reply failed.',
      );
    },
  });

  const cases = extraCases;
  const detail = detailQuery.data;
  const nextCursor = casesQuery.data?.next_cursor || null;

  return (
    <section
      className="mb-6 rounded-2xl bg-white p-5 shadow-sm"
      aria-labelledby="support-inbox-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="support-inbox-heading"
            className="text-lg font-bold text-gray-900"
          >
            Support Inbox
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Complaints, feedback and suggestions submitted inside AgentPro.
            Message text stays in the support case and is not copied into
            diagnostics or broad audit logs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Support case status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="all">All statuses</option>
          </select>

          <select
            aria-label="Support case type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
            <option value="complaint">Complaints</option>
            <option value="feedback">Feedback</option>
            <option value="suggestion">Suggestions</option>
          </select>

          <select
            aria-label="Support case priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {casesQuery.isLoading && cases.length === 0 && (
        <div className="py-10 text-center text-sm text-gray-500" role="status">
          Loading support cases...
        </div>
      )}

      {casesQuery.isError && cases.length === 0 && (
        <div
          className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          Support cases could not be loaded.
          <button
            type="button"
            onClick={() => casesQuery.refetch()}
            className="ml-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {!casesQuery.isLoading && !casesQuery.isError && cases.length === 0 && (
        <div className="mt-5 rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">
          No support cases match these filters.
        </div>
      )}

      {cases.length > 0 && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
          <div>
            <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {cases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary ${
                    selectedId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {item.reference}
                      </p>
                      <p className="mt-1 truncate font-semibold text-gray-900">
                        {item.subject}
                      </p>
                    </div>
                    <CaseBadge
                      value={item.priority}
                      label={PRIORITY_LABELS[item.priority]}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <CaseBadge
                      value={item.status}
                      label={STATUS_LABELS[item.status]}
                    />
                    <span>{item.type}</span>
                    <span>
                      {item.requester_name || item.requester_email || 'Deleted user'}
                    </span>
                    <span>{dateLabel(item.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>

            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={casesQuery.isFetching}
                  onClick={() => setCursor(nextCursor)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {casesQuery.isFetching ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>

          <div className="min-h-[320px] rounded-xl border border-gray-100 bg-gray-50 p-4">
            {!selectedId && (
              <div className="flex min-h-[280px] items-center justify-center text-center text-sm text-gray-500">
                Select a support case to review it.
              </div>
            )}

            {selectedId && detailQuery.isLoading && (
              <div className="py-12 text-center text-sm text-gray-500" role="status">
                Loading case...
              </div>
            )}

            {selectedId && detailQuery.isError && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
                This support case could not be loaded.
              </div>
            )}

            {detail?.case && (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {detail.case.reference}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-gray-900">
                      {detail.case.subject}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {detail.case.requester_name || 'Deleted user'}
                      {detail.case.requester_email
                        ? ` · ${detail.case.requester_email}`
                        : ''}
                      {detail.case.requester_phone
                        ? ` · ${detail.case.requester_phone}`
                        : ''}
                    </p>
                  </div>

                  <CaseBadge
                    value={detail.case.status}
                    label={STATUS_LABELS[detail.case.status]}
                  />
                </div>

                <div className="mt-4 rounded-lg bg-white p-4 text-sm leading-6 text-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Original message
                  </p>
                  <p className="whitespace-pre-wrap">
                    {detail.case.initial_message}
                  </p>
                </div>

                {detail.messages?.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {detail.messages.map((message) => (
                      <div key={message.id} className="rounded-lg bg-white p-3">
                        <div className="flex justify-between gap-3 text-xs text-gray-400">
                          <span>
                            {message.author_role === 'admin'
                              ? 'AgentPro Support'
                              : 'User'}
                          </span>
                          <span>{dateLabel(message.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                          {message.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Status
                    <select
                      value={detail.case.status}
                      disabled={updateMutation.isPending}
                      onChange={(event) =>
                        updateMutation.mutate({
                          caseId: detail.case.id,
                          patch: { status: event.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-gray-600">
                    Priority
                    <select
                      value={detail.case.priority}
                      disabled={updateMutation.isPending}
                      onChange={(event) =>
                        updateMutation.mutate({
                          caseId: detail.case.id,
                          patch: { priority: event.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="support-reply"
                    className="text-xs font-semibold text-gray-600"
                  >
                    Reply to user
                  </label>
                  <textarea
                    id="support-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={4000}
                    rows={4}
                    disabled={detail.case.status === 'closed'}
                    placeholder={
                      detail.case.status === 'closed'
                        ? 'Reopen this case before replying.'
                        : 'Write a clear support response...'
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                  />

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">
                      {reply.length}/4000
                    </span>
                    <button
                      type="button"
                      disabled={
                        detail.case.status === 'closed' ||
                        reply.trim().length < 2 ||
                        replyMutation.isPending
                      }
                      onClick={() => replyMutation.mutate()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>

                <div className="mt-5 border-t border-gray-200 pt-3 text-xs text-gray-400">
                  <p>Created {dateLabel(detail.case.created_at)}</p>
                  <p className="mt-1">
                    Client: {detail.case.platform || 'unknown'} ·{' '}
                    {detail.case.app_version || 'legacy'}
                    {detail.case.app_build
                      ? ` (${detail.case.app_build})`
                      : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
