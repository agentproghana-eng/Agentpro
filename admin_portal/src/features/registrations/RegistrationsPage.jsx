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

// ── Registrations Page ────────────────────────────────────────

export function RegistrationsPage() {
  const queryClient = useQueryClient();
  const [selectedRegistration, setSelectedRegistration] =
    useState(null);

  const {
    data: registrations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin', 'pending-registrations'],
    queryFn: async () => {
      const response = await API.get('/admin/pending-registrations');
      return response.data.data || [];
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async (companyId) => {
      const response = await API.patch(
        `/admin/pending-registrations/${companyId}/approve`,
      );
      return response.data;
    },
    onSuccess: async (data) => {
      toast.success(
        data.message || 'Registration approved successfully.',
      );
      setSelectedRegistration(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin', 'pending-registrations'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'overview'],
        }),
      ]);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError.response?.data?.message ||
          'Failed to approve registration.',
      );
    },
  });

  if (isLoading) {
    return (
      <LoadingState label="Loading pending registrations..." />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Registrations could not be loaded"
        message={
          error?.response?.data?.message ||
          error?.message ||
          'The registration review queue is unavailable.'
        }
        onRetry={refetch}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Pending Registrations
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Review new companies before granting platform access.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching || approvalMutation.isPending}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {registrations.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No pending registrations"
          message="New company applications will appear here for review."
        />
      ) : (
        <div className="grid gap-4">
          {registrations.map((registration) => (
            <article
              key={registration.id}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-gray-900">
                    {registration.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {registration.registration_number ||
                      'No registration number'}
                  </p>
                </div>

                <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                  Pending
                </span>
              </div>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Owner</dt>
                  <dd className="font-medium text-gray-900">
                    {registration.first_name}{' '}
                    {registration.last_name}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="break-all font-medium text-gray-900">
                    {registration.email}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium text-gray-900">
                    {registration.phone || '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">Ghana Card</dt>
                  <dd className="font-medium text-gray-900">
                    {registration.ghana_card_number || '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">Applied</dt>
                  <dd className="font-medium text-gray-900">
                    {registration.created_at
                      ? new Date(
                          registration.created_at,
                        ).toLocaleDateString()
                      : '—'}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() =>
                  setSelectedRegistration(registration)
                }
                disabled={approvalMutation.isPending}
                className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                Approve and Start 30-Day Free Trial
              </button>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={selectedRegistration !== null}
        title="Approve company registration?"
        message={
          selectedRegistration
            ? `This will activate ${selectedRegistration.name}, activate its owner, create a Main Branch, and start the 30-day free trial.`
            : ''
        }
        confirmLabel="Approve Registration"
        loading={approvalMutation.isPending}
        onClose={() => {
          if (!approvalMutation.isPending) {
            setSelectedRegistration(null);
          }
        }}
        onConfirm={() => {
          if (selectedRegistration) {
            approvalMutation.mutate(selectedRegistration.id);
          }
        }}
      />
    </div>
  );
}
