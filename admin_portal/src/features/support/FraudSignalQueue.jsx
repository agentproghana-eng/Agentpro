import {
  useState,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/PageState.jsx';
import API from '../../lib/api.js';
import {
  formatWhen,
  humanize,
  providerLabel,
  ruleTitle,
} from '../../lib/plainText.js';
import {
  PlainRows,
  TechnicalDetails,
} from '../../components/TechnicalDetails.jsx';

function minutesBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.max(1, Math.round((b - a) / 60000));
}

function signalSummary(signal) {
  const count = Number(signal.observed_event_count);
  const minutes = minutesBetween(
    signal.window_started_at,
    signal.window_ended_at,
  );
  const within = minutes ? ` within ${minutes} minutes` : '';

  if (!Number.isFinite(count)) return 'Unusual activity was detected.';

  if (signal.rule_id === 'auth_login_failure_burst_10m') {
    return `${count} failed login attempt${count === 1 ? '' : 's'}${within}.`;
  }

  return `${count} related event${count === 1 ? '' : 's'}${within}.`;
}
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

export function FraudSignalQueue() {
  const queryClient =
    useQueryClient();

  const [
    pendingReview,
    setPendingReview,
  ] = useState(null);

  const [
    fraudStatus,
    setFraudStatus,
  ] = useState('open');

  const [
    fraudSeverity,
    setFraudSeverity,
  ] = useState('all');

  const fraudSignalsQuery =
    useQuery({
      queryKey: [
        'admin',
        'fraud-signals',
        fraudStatus,
        fraudSeverity,
      ],

      retry: false,

      queryFn: async () => {
        const response =
          await API.get(
            '/admin/fraud-signals',
            {
              params: {
                status:
                  fraudStatus,
                severity:
                  fraudSeverity,
                limit: 50,
              },
            },
          );

        return response.data.data;
      },
    });

  const fraudReviewMutation =
    useMutation({
      mutationFn:
        async ({
          signalId,
          status,
        }) => {
          const response =
            await API.patch(
              `/admin/fraud-signals/${signalId}/review`,
              {
                status,
              },
            );

          return response.data.data;
        },

      onSuccess:
        async (
          signal,
        ) => {
          toast.success(
            `Fraud signal marked ${signal.review_status}.`,
          );

          await queryClient
            .invalidateQueries({
              queryKey: [
                'admin',
                'fraud-signals',
              ],
            });
        },

      onError:
        error => {
          toast.error(
            error?.response?.data
              ?.message ||
              'Fraud signal review failed.',
          );
        },
    });

  const REVIEW_LABELS = {
    reviewed:
      'mark this signal as reviewed',
    dismissed:
      'dismiss this signal',
    escalated:
      'escalate this signal for further investigation',
  };

  const reviewFraudSignal =
    (
      signal,
      status,
    ) => {
      if (
        !signal?.id ||
        signal.review_status !==
          'open' ||
        fraudReviewMutation
          .isPending
      ) {
        return;
      }

      setPendingReview({
        signal,
        status,
      });
    };

  return (
    <>
      <div
        className="
          mb-6
          rounded-xl
          bg-white
          p-5
          shadow-sm
        "
      >
        <div
          className="
            flex
            flex-wrap
            items-start
            justify-between
            gap-4
          "
        >
          <div>
            <h2
              className="
                text-lg
                font-bold
                text-gray-900
              "
            >
              Fraud Signal Queue
            </h2>

            <p
              className="
                mt-1
                max-w-2xl
                text-sm
                text-gray-500
              "
            >
              Advisory anomaly signals
              requiring administrator
              review. Reviewing a signal
              does not block users or
              transactions.
            </p>
          </div>

          <div
            className="
              flex
              flex-wrap
              gap-2
            "
          >
            <select
              aria-label="Fraud signal status"
              value={fraudStatus}
              onChange={event =>
                setFraudStatus(
                  event.target.value,
                )
              }
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                px-3 py-2
                text-sm
                text-gray-700
              "
            >
              <option value="open">
                Open
              </option>
              <option value="escalated">
                Escalated
              </option>
              <option value="reviewed">
                Reviewed
              </option>
              <option value="dismissed">
                Dismissed
              </option>
              <option value="all">
                All
              </option>
            </select>

            <select
              aria-label="Fraud signal severity"
              value={fraudSeverity}
              onChange={event =>
                setFraudSeverity(
                  event.target.value,
                )
              }
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                px-3 py-2
                text-sm
                text-gray-700
              "
            >
              <option value="all">
                All severities
              </option>
              <option value="critical">
                Critical
              </option>
              <option value="high">
                High
              </option>
              <option value="medium">
                Medium
              </option>
              <option value="low">
                Low
              </option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          {fraudSignalsQuery
            .isLoading ? (
            <LoadingState
              message="Loading fraud signals..."
            />
          ) : fraudSignalsQuery
              .isError ? (
            <ErrorState
              message={
                fraudSignalsQuery
                  .error?.response
                  ?.data?.message ||
                'Fraud signals could not be loaded.'
              }
            />
          ) : !fraudSignalsQuery
              .data?.signals
              ?.length ? (
            <EmptyState
              message="No fraud signals matched these filters."
            />
          ) : (
            <div
              className="
                space-y-3
              "
            >
              {fraudSignalsQuery
                .data.signals
                .map(signal => (
                  <div
                    key={signal.id}
                    className="
                      rounded-xl
                      border
                      border-gray-100
                      p-4
                    "
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-800">
                        {humanize(signal.severity)} risk
                      </span>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        {signal.risk_score} / 100
                      </span>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        {humanize(signal.review_status)}
                      </span>
                    </div>

                    <p className="mt-3 text-base font-bold text-gray-900">
                      {ruleTitle(signal.rule_id, signal.signal_type)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {signalSummary(signal)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatWhen(signal.created_at)}
                    </p>

                    <PlainRows
                      rows={[
                        {
                          label: 'Provider',
                          value: providerLabel(signal.provider),
                        },
                        {
                          label: 'Events seen',
                          value: String(signal.observed_event_count ?? '—'),
                        },
                        {
                          label: 'Time window',
                          value: `${formatWhen(signal.window_started_at)} to ${formatWhen(signal.window_ended_at)}`,
                        },
                      ]}
                    />

                    <TechnicalDetails
                      rows={[
                        { label: 'Signal ID', value: signal.id },
                        { label: 'Account (user ID)', value: signal.actor_user_id },
                        { label: 'Company ID', value: signal.company_id },
                        { label: 'Rule', value: signal.rule_id },
                        { label: 'Signal type', value: signal.signal_type },
                      ]}
                    />

                    {signal.review_status ===
                      'open' && (
                      <div
                        className="
                          mt-4
                          flex
                          flex-wrap
                          gap-2
                        "
                      >
                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'reviewed',
                            )
                          }
                          className="
                            rounded-lg
                            border
                            border-gray-200
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-gray-700
                            hover:bg-gray-50
                            disabled:opacity-50
                          "
                        >
                          Mark reviewed
                        </button>

                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'dismissed',
                            )
                          }
                          className="
                            rounded-lg
                            border
                            border-gray-200
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-gray-700
                            hover:bg-gray-50
                            disabled:opacity-50
                          "
                        >
                          Dismiss
                        </button>

                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'escalated',
                            )
                          }
                          className="
                            rounded-lg
                            bg-gray-900
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-white
                            hover:bg-gray-800
                            disabled:opacity-50
                          "
                        >
                          Escalate
                        </button>
                      </div>
                    )}
                  </div>
                ))}

              {fraudSignalsQuery
                .data
                ?.truncated && (
                <p
                  className="
                    text-xs
                    text-gray-400
                  "
                >
                  Showing the first
                  bounded set of matching
                  signals. Narrow the
                  filters to review more.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingReview)}
        title="Review this signal?"
        message={
          pendingReview
            ? `Are you sure you want to ${REVIEW_LABELS[pendingReview.status]}? This review state cannot be changed from this screen.`
            : ''
        }
        confirmLabel="Yes, continue"
        tone={
          pendingReview?.status === 'dismissed'
            ? 'danger'
            : 'primary'
        }
        onClose={() => setPendingReview(null)}
        onConfirm={() => {
          const target = pendingReview;
          setPendingReview(null);
          if (target) {
            fraudReviewMutation.mutate({
              signalId: target.signal.id,
              status: target.status,
            });
          }
        }}
      />
    </>
  );
}
