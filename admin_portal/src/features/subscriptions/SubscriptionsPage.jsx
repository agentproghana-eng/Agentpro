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
import {
  ConfirmDialog,
} from '../../components/ConfirmDialog.jsx';
import API from '../../lib/api.js';

// ── Subscriptions Page ────────────────────────────────────────

export function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState(null);

  const {
    data: businessPayments = [],
    isLoading: businessLoading,
    isError: businessError,
    error: businessLoadError,
    refetch: refetchBusiness,
    isFetching: businessFetching,
  } = useQuery({
    queryKey: ['admin', 'pending-subscription-payments', 'business'],
    queryFn: async () => {
      const response = await API.get(
        '/subscriptions/pending-payments',
      );
      return response.data.data || [];
    },
  });

  const {
    data: personalPayments = [],
    isLoading: personalLoading,
    isError: personalError,
    error: personalLoadError,
    refetch: refetchPersonal,
    isFetching: personalFetching,
  } = useQuery({
    queryKey: ['admin', 'pending-subscription-payments', 'personal'],
    queryFn: async () => {
      const response = await API.get(
        '/personal-subscription/pending-payments',
      );
      return response.data.data || [];
    },
  });

  const {
    data: businessReconciliation = [],
    isLoading: businessReconciliationLoading,
    isError: businessReconciliationError,
    error: businessReconciliationLoadError,
    refetch: refetchBusinessReconciliation,
    isFetching: businessReconciliationFetching,
  } = useQuery({
    queryKey: ['admin', 'subscription-reconciliation', 'business'],
    queryFn: async () => {
      const response = await API.get(
        '/subscriptions/reconciliation-payments',
      );
      return response.data.data || [];
    },
  });

  const {
    data: personalReconciliation = [],
    isLoading: personalReconciliationLoading,
    isError: personalReconciliationError,
    error: personalReconciliationLoadError,
    refetch: refetchPersonalReconciliation,
    isFetching: personalReconciliationFetching,
  } = useQuery({
    queryKey: ['admin', 'subscription-reconciliation', 'personal'],
    queryFn: async () => {
      const response = await API.get(
        '/personal-subscription/reconciliation-payments',
      );
      return response.data.data || [];
    },
  });

  const reconciliationPayments = [
    ...businessReconciliation,
    ...personalReconciliation,
  ];

  const verificationMutation = useMutation({
    mutationFn: async ({
      paymentId,
      action,
      reason,
      accountMode,
    }) => {
      const base =
        accountMode === 'personal'
          ? '/personal-subscription'
          : '/subscriptions';

      const response = await API.patch(
        `${base}/payment/${paymentId}/verify`,
        {
          action,
          rejection_reason:
            reason || undefined,
        },
      );

      return {
        response: response.data,
        action,
      };
    },
    onSuccess: async ({ response, action }) => {
      toast.success(
        response.message ||
          (action === 'approve'
            ? 'Subscription activated.'
            : 'Payment rejected.'),
      );

      setPendingAction(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'admin',
            'pending-subscription-payments',
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'overview'],
        }),
      ]);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError.response?.data?.message ||
          'The payment could not be processed.',
      );
    },
  });

  const loading =
    businessLoading ||
    personalLoading ||
    businessReconciliationLoading ||
    personalReconciliationLoading;

  const hasError =
    businessError ||
    personalError ||
    businessReconciliationError ||
    personalReconciliationError;

  const loadError =
    businessLoadError ||
    personalLoadError ||
    businessReconciliationLoadError ||
    personalReconciliationLoadError;

  const fetching =
    businessFetching ||
    personalFetching ||
    businessReconciliationFetching ||
    personalReconciliationFetching;

  const refreshAll = async () => {
    await Promise.all([
      refetchBusiness(),
      refetchPersonal(),
      refetchBusinessReconciliation(),
      refetchPersonalReconciliation(),
    ]);
  };

  const renderManualPayment = (
    payment,
    accountMode,
  ) => {
    const isPersonal =
      accountMode === 'personal';

    const name = isPersonal
      ? `${payment.first_name || ''} ${payment.last_name || ''}`.trim() ||
        payment.email ||
        'Personal subscriber'
      : payment.company_name ||
        payment.company?.name ||
        'Unknown company';

    return (
      <article
        key={`${accountMode}-${payment.id}`}
        className="rounded-xl bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900">
              {name}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Transaction ID:{' '}
              <span className="font-mono">
                {payment.momo_reference || '—'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {isPersonal ? 'Personal' : 'Business'}
            </span>

            <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
              Manual verification
            </span>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-gray-500">
              Amount
            </dt>
            <dd className="font-semibold text-gray-900">
              GH₵ {Number(payment.amount || 0).toFixed(2)}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">
              Payment phone
            </dt>
            <dd className="font-medium text-gray-900">
              {payment.payment_phone || '—'}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">
              Subscriber
            </dt>
            <dd className="font-medium text-gray-900">
              {payment.email ||
                payment.submitted_by_email ||
                '—'}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">
              Submitted
            </dt>
            <dd className="font-medium text-gray-900">
              {payment.submitted_at
                ? new Date(
                    payment.submitted_at,
                  ).toLocaleString()
                : '—'}
            </dd>
          </div>
        </dl>

        {payment.payment_provider === 'manual_momo' && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                setPendingAction({
                  payment,
                  accountMode,
                  action: 'approve',
                })
              }
              disabled={
                verificationMutation.isPending
              }
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve Payment
            </button>

            <button
              type="button"
              onClick={() =>
                setPendingAction({
                  payment,
                  accountMode,
                  action: 'reject',
                })
              }
              disabled={
                verificationMutation.isPending
              }
              className="flex-1 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Reject Payment
            </button>
          </div>
        )}
      </article>
    );
  };

  if (loading) {
    return (
      <LoadingState label="Loading subscription payment operations..." />
    );
  }

  if (hasError) {
    return (
      <ErrorState
        title="Subscription payment operations could not be loaded"
        message={
          loadError?.response?.data?.message ||
          loadError?.message ||
          'The subscription payment queues are unavailable.'
        }
        onRetry={refreshAll}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Subscription Payments
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Verify manual MoMo submissions and review captured
            Paystack payments that require reconciliation.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          disabled={
            fetching ||
            verificationMutation.isPending
          }
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {fetching
            ? 'Refreshing...'
            : 'Refresh'}
        </button>
      </div>

      {reconciliationPayments.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h3 className="font-bold text-amber-900">
              Paystack Reconciliation Required (
              {reconciliationPayments.length})
            </h3>

            <p className="mt-1 text-sm text-amber-800">
              Paystack confirmed these charges, but AgentPro did
              not grant an additional subscription period.
              Resolve or refund them operationally before treating
              the payment case as complete.
            </p>
          </div>

          <div className="grid gap-4">
            {reconciliationPayments.map(
              (payment) => {
                const personal =
                  payment.account_mode ===
                  'personal';

                const accountName = personal
                  ? `${payment.first_name || ''} ${payment.last_name || ''}`.trim() ||
                    payment.email ||
                    'Personal subscriber'
                  : payment.company_name ||
                    'Business subscriber';

                return (
                  <article
                    key={`reconciliation-${payment.account_mode}-${payment.id}`}
                    className="rounded-xl border border-amber-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-gray-900">
                          {accountName}
                        </h4>

                        <p className="mt-1 text-sm text-gray-500">
                          Paystack reference:{' '}
                          <span className="font-mono">
                            {payment.provider_reference ||
                              '—'}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                          {personal
                            ? 'Personal'
                            : 'Business'}
                        </span>

                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                          Provider: success
                        </span>

                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          Reconciliation required
                        </span>
                      </div>
                    </div>

                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-gray-500">
                          Amount
                        </dt>
                        <dd className="font-semibold text-gray-900">
                          GH₵{' '}
                          {Number(
                            payment.amount || 0,
                          ).toFixed(2)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-gray-500">
                          Provider transaction
                        </dt>
                        <dd className="break-all font-mono text-xs font-medium text-gray-900">
                          {payment.provider_transaction_id ||
                            '—'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-gray-500">
                          Channel
                        </dt>
                        <dd className="font-medium text-gray-900">
                          {payment.provider_channel ||
                            '—'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-gray-500">
                          Detected
                        </dt>
                        <dd className="font-medium text-gray-900">
                          {payment.verified_at ||
                          payment.submitted_at
                            ? new Date(
                                payment.verified_at ||
                                  payment.submitted_at,
                              ).toLocaleString()
                            : '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      <span className="font-semibold">
                        Reason:
                      </span>{' '}
                      {payment.reconciliation_reason ||
                        'Captured Paystack payment requires manual reconciliation.'}
                    </div>

                    <p className="mt-3 text-xs text-gray-500">
                      No approve/reject action is available for
                      Paystack charges. Confirm the provider
                      transaction and handle refund or resolution
                      through the authorized payment operations
                      process.
                    </p>
                  </article>
                );
              },
            )}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="mb-4 text-lg font-bold text-gray-900">
          Business — Manual MoMo
        </h3>

        {businessPayments.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No pending Business manual payments"
            message="New Business manual MoMo references will appear here."
          />
        ) : (
          <div className="grid gap-4">
            {businessPayments.map((payment) =>
              renderManualPayment(
                payment,
                'business',
              ),
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-4 text-lg font-bold text-gray-900">
          Personal — Manual MoMo
        </h3>

        {personalPayments.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No pending Personal manual payments"
            message="New Personal manual MoMo references will appear here."
          />
        ) : (
          <div className="grid gap-4">
            {personalPayments.map((payment) =>
              renderManualPayment(
                payment,
                'personal',
              ),
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.action ===
          'approve'
            ? 'Approve subscription payment?'
            : 'Reject subscription payment?'
        }
        message={
          pendingAction
            ? pendingAction.action ===
              'approve'
              ? `This will activate the ${
                  pendingAction.accountMode ===
                  'personal'
                    ? 'Personal'
                    : 'Business'
                } subscription using the submitted manual MoMo Transaction ID.`
              : 'The manual payment will be rejected and the subscriber will be informed.'
            : ''
        }
        confirmLabel={
          pendingAction?.action ===
          'approve'
            ? 'Approve Payment'
            : 'Reject Payment'
        }
        tone={
          pendingAction?.action ===
          'reject'
            ? 'danger'
            : 'primary'
        }
        requireReason={
          pendingAction?.action ===
          'reject'
        }
        reasonLabel="Rejection reason"
        reasonPlaceholder="Explain why this manual payment could not be verified..."
        loading={
          verificationMutation.isPending
        }
        onClose={() => {
          if (
            !verificationMutation.isPending
          ) {
            setPendingAction(null);
          }
        }}
        onConfirm={(reason) => {
          if (!pendingAction) return;

          verificationMutation.mutate({
            paymentId:
              pendingAction.payment.id,
            accountMode:
              pendingAction.accountMode,
            action:
              pendingAction.action,
            reason,
          });
        }}
      />
    </div>
  );
}
