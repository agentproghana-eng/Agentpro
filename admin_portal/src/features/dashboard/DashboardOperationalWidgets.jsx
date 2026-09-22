import {
  useEffect,
  useRef,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Link,
  useNavigate,
} from 'react-router-dom';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';

// ── USSD Flow Health ─────────────────────────────────────────

async function fetchUssdFlowHealth() {
  const response =
    await API.get(
      '/admin/ussd-flow-health',
      {
        params: {
          limit: 50,
        },
      },
    );

  return response.data.data || [];
}

export function UssdFlowHealthToastWatcher() {
  const initialized =
    useRef(false);

  const seenIncidentIds =
    useRef(new Set());

  const {
    data: incidents = [],
  } = useQuery({
    queryKey: [
      'admin',
      'ussd-flow-health',
    ],
    queryFn:
      fetchUssdFlowHealth,
    refetchInterval:
      15_000,
    staleTime:
      5_000,
    refetchIntervalInBackground:
      true,
  });

  useEffect(() => {
    const currentIds =
      new Set(
        incidents.map(
          incident =>
            String(incident.id),
        ),
      );

    if (!initialized.current) {
      initialized.current =
        true;

      seenIncidentIds.current =
        currentIds;

      if (incidents.length > 0) {
        toast(
          `${incidents.length} possible USSD flow ${
            incidents.length === 1
              ? 'change needs'
              : 'changes need'
          } review.`,
          {
            icon: '⚠️',
            duration: 8_000,
          },
        );
      }

      return;
    }

    const newIncidents =
      incidents.filter(
        incident =>
          !seenIncidentIds
            .current
            .has(
              String(incident.id),
            ),
      );

    if (newIncidents.length > 0) {
      const newest =
        newIncidents[0];

      const provider =
        String(
          newest.provider ||
            'Provider',
        ).toUpperCase();

      const stepIndex =
        Number(
          newest
            .mismatch_step_index,
        );

      const stepCount =
        Number(
          newest.step_count,
        );

      const location =
        Number.isInteger(
          stepIndex,
        ) &&
        Number.isInteger(
          stepCount,
        ) &&
        stepIndex >= stepCount
          ? 'after the final configured step'
          : `at step ${stepIndex + 1}`;

      toast(
        `${provider} USSD flow may have changed ${location}.`,
        {
          icon: '⚠️',
          duration: 10_000,
        },
      );
    }

    seenIncidentIds.current =
      currentIds;
  }, [incidents]);

  return null;
}

export function UssdFlowHealthAlerts() {
  const navigate =
    useNavigate();

  const queryClient =
    useQueryClient();

  const {
    data: incidents = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      'admin',
      'ussd-flow-health',
    ],
    queryFn:
      fetchUssdFlowHealth,
    refetchInterval:
      15_000,
    staleTime:
      5_000,
    refetchIntervalInBackground:
      true,
  });

  const dismissMutation =
    useMutation({
      mutationFn:
        async incidentId => {
          const response =
            await API.patch(
              `/admin/ussd-flow-health/${incidentId}/dismiss`,
            );

          return response.data.data;
        },

      onSuccess:
        async () => {
          toast.success(
            'Flow-health alert dismissed.',
          );

          await queryClient
            .invalidateQueries({
              queryKey: [
                'admin',
                'ussd-flow-health',
              ],
            });
        },

      onError:
        mutationError => {
          toast.error(
            mutationError
              ?.response
              ?.data
              ?.message ||
              'Flow-health alert could not be dismissed.',
          );
        },
    });

  if (
    isLoading ||
    (
      !isError &&
      incidents.length === 0
    )
  ) {
    return null;
  }

  if (isError) {
    return (
      <section
        className="
          mb-8 rounded-xl
          border border-amber-200
          bg-amber-50 p-5
        "
      >
        <div
          className="
            flex flex-wrap
            items-center
            justify-between gap-3
          "
        >
          <div>
            <h3
              className="
                font-bold
                text-amber-900
              "
            >
              USSD Flow Health unavailable
            </h3>

            <p
              className="
                mt-1 text-sm
                text-amber-800
              "
            >
              {
                error?.response
                  ?.data
                  ?.message ||
                'AgentPro could not load provider-flow alerts.'
              }
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="
              rounded-lg
              border border-amber-300
              bg-white px-3 py-2
              text-sm font-medium
              text-amber-900
            "
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="
        mb-8 rounded-xl
        border border-amber-200
        bg-amber-50 p-5
        shadow-sm
      "
      aria-labelledby="ussd-flow-health-title"
    >
      <div
        className="
          flex flex-wrap
          items-start
          justify-between gap-3
        "
      >
        <div>
          <h3
            id="ussd-flow-health-title"
            className="
              font-bold
              text-amber-950
            "
          >
            ⚠️ Possible provider flow changes
          </h3>

          <p
            className="
              mt-1 text-sm
              text-amber-800
            "
          >
            AgentPro stopped automation after repeated
            provider screens no longer matched the
            configured Flow Builder steps.
          </p>
        </div>

        <span
          className="
            rounded-full
            bg-amber-200
            px-2.5 py-1
            text-xs font-bold
            text-amber-950
          "
        >
          {incidents.length} open
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {incidents.map(
          incident => {
            const provider =
              String(
                incident.provider ||
                  '',
              ).toUpperCase();

            const type =
              String(
                incident
                  .transaction_type ||
                  '',
              ).replaceAll(
                '_',
                ' ',
              );

            const stepIndex =
              Number(
                incident
                  .mismatch_step_index,
              );

            const stepCount =
              Number(
                incident
                  .step_count,
              );

            const location =
              Number.isInteger(
                stepIndex,
              ) &&
              Number.isInteger(
                stepCount,
              ) &&
              stepIndex >= stepCount
                ? 'After the final configured step'
                : `Step ${stepIndex + 1} stopped matching`;

            return (
              <article
                key={incident.id}
                className="
                  rounded-xl
                  border
                  border-amber-200
                  bg-white p-4
                "
              >
                <div
                  className="
                    flex flex-wrap
                    items-start
                    justify-between
                    gap-4
                  "
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="
                        text-sm
                        font-bold
                        text-gray-900
                      "
                    >
                      {provider}
                      {' · '}
                      {type}
                    </p>

                    <p
                      className="
                        mt-1 text-sm
                        text-gray-600
                      "
                    >
                      {location}.
                      {' '}
                      Detected{' '}
                      {incident.occurrence_count}{' '}
                      time{
                        Number(
                          incident.occurrence_count,
                        ) === 1
                          ? ''
                          : 's'
                      }.
                    </p>

                    <p
                      className="
                        mt-2 text-xs
                        text-gray-400
                      "
                    >
                      Last detected{' '}
                      {
                        incident.last_detected_at
                          ? new Date(
                              incident.last_detected_at,
                            ).toLocaleString()
                          : '—'
                      }

                      {
                        incident.last_app_build
                          ? ` · App build ${incident.last_app_build}`
                          : ''
                      }
                    </p>

                    {
                      incident.last_source_commit && (
                        <p
                          className="
                            mt-1 break-all
                            text-xs text-gray-400
                          "
                        >
                          Source{' '}
                          {
                            incident
                              .last_source_commit
                          }
                        </p>
                      )
                    }

                    {
                      Array.isArray(
                        incident.step_match_all,
                      ) &&
                      incident
                        .step_match_all
                        .length > 0 && (
                        <p
                          className="
                            mt-2 text-xs
                            text-gray-500
                          "
                        >
                          Configured matcher:{' '}
                          {
                            incident
                              .step_match_all
                              .join(' + ')
                          }
                        </p>
                      )
                    }
                  </div>

                  <div
                    className="
                      flex shrink-0
                      flex-wrap gap-2
                    "
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/flows')
                      }
                      className="
                        rounded-lg
                        bg-primary
                        px-3 py-2
                        text-xs font-semibold
                        text-white
                      "
                    >
                      Review Flow
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        dismissMutation
                          .mutate(
                            incident.id,
                          )
                      }
                      disabled={
                        dismissMutation
                          .isPending
                      }
                      className="
                        rounded-lg
                        border border-gray-200
                        bg-white
                        px-3 py-2
                        text-xs font-semibold
                        text-gray-600
                        disabled:opacity-50
                      "
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}

// ── Operational Health Widget ─────────────────────────────────

export function OperationalHealthWidget() {
  const {
    data: status,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      'admin',
      'operational-status',
    ],
    queryFn: async () => {
      const response =
        await API.get(
          '/admin/operational-status',
        );

      return response.data.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const statusMeta = (
    value,
  ) => {
    switch (value) {
      case 'operational':
        return {
          label: 'Operational',
          classes:
            'bg-green-100 text-green-700',
        };

      case 'degraded':
        return {
          label: 'Degraded',
          classes:
            'bg-amber-100 text-amber-800',
        };

      case 'major_outage':
        return {
          label: 'Major outage',
          classes:
            'bg-red-100 text-red-700',
        };

      default:
        return {
          label:
            'Insufficient data',
          classes:
            'bg-gray-100 text-gray-600',
        };
    }
  };

  if (isLoading) {
    return (
      <div
        className="
          mb-8 rounded-xl bg-white
          p-6 shadow-sm
        "
      >
        <p
          className="
            text-sm text-gray-500
          "
        >
          Loading provider and platform
          health...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="
          mb-8 rounded-xl
          border border-amber-200
          bg-amber-50 p-6
        "
      >
        <div
          className="
            flex flex-wrap
            items-center
            justify-between gap-3
          "
        >
          <div>
            <h3
              className="
                font-bold
                text-amber-900
              "
            >
              Operational status unavailable
            </h3>

            <p
              className="
                mt-1 text-sm
                text-amber-800
              "
            >
              AgentPro could not load the
              current health snapshot.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="
              rounded-lg
              border border-amber-300
              bg-white px-3 py-2
              text-sm font-medium
              text-amber-900
            "
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const platform =
    Object.values(
      status?.platform || {},
    );

  const providers =
    status?.providers || [];

  const cards = [
    ...providers.map(
      (item) => ({
        key:
          `provider-${item.key}`,
        label: item.label,
        status: item.status,
        detail:
          item.failure_rate == null
            ? 'Waiting for enough transactions'
            : `${
                Math.round(
                  item.failure_rate *
                    1000,
                ) / 10
              }% failure rate`,
      }),
    ),

    ...platform.map(
      (item) => ({
        key:
          `platform-${item.label}`,
        label: item.label,
        status: item.status,
        detail: null,
      }),
    ),
  ];

  return (
    <section
      className="
        mb-8 rounded-xl
        bg-white p-6
        shadow-sm
      "
      aria-labelledby="operational-health-title"
    >
      <div
        className="
          mb-5 flex flex-wrap
          items-start
          justify-between gap-3
        "
      >
        <div>
          <h3
            id="operational-health-title"
            className="
              font-bold
              text-gray-900
            "
          >
            Provider & Platform Health
          </h3>

          <p
            className="
              mt-1 text-sm
              text-gray-500
            "
          >
            Live operational view of
            AgentPro and external
            dependencies.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="
            rounded-lg
            border border-gray-200
            bg-white px-3 py-2
            text-sm font-medium
            text-gray-700
            hover:bg-gray-50
            disabled:opacity-50
          "
        >
          {isFetching
            ? 'Refreshing...'
            : 'Refresh'}
        </button>
      </div>

      <div
        className="
          grid grid-cols-1 gap-3
          sm:grid-cols-2
          lg:grid-cols-4
        "
      >
        {cards.map((item) => {
          const meta =
            statusMeta(
              item.status,
            );

          return (
            <div
              key={item.key}
              className="
                rounded-xl
                border
                border-gray-100
                p-4
              "
            >
              <div
                className="
                  flex items-center
                  justify-between
                  gap-3
                "
              >
                <p
                  className="
                    text-sm
                    font-semibold
                    text-gray-900
                  "
                >
                  {item.label}
                </p>

                <span
                  className={`
                    rounded-full
                    px-2 py-1
                    text-xs
                    font-medium
                    ${meta.classes}
                  `}
                >
                  {meta.label}
                </span>
              </div>

              {item.detail && (
                <p
                  className="
                    mt-2 text-xs
                    text-gray-500
                  "
                >
                  {item.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {status?.alerts?.length >
        0 && (
        <div
          className="
            mt-5 rounded-lg
            border border-amber-100
            bg-amber-50 p-4
          "
        >
          <p
            className="
              text-sm font-semibold
              text-amber-900
            "
          >
            Active operational alerts
          </p>

          <ul
            className="
              mt-2 space-y-1
              text-sm
              text-amber-800
            "
          >
            {status.alerts.map(
              (alert) => (
                <li
                  key={alert.code}
                >
                  {alert.message}
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {status?.timestamp && (
        <p
          className="
            mt-4 text-xs
            text-gray-400
          "
        >
          Last checked{' '}
          {new Date(
            status.timestamp,
          ).toLocaleString()}
        </p>
      )}
    </section>
  );
}

// ── Pending Registrations Widget ──────────────────────────────

export function PendingRegistrationsWidget() {
  const {
    data: registrations = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'pending-registrations'],
    queryFn: async () => {
      const response = await API.get('/admin/pending-registrations');
      return response.data.data || [];
    },
  });

  if (isLoading || isError || registrations.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-900">
          Pending Registrations ({registrations.length})
        </h3>

        <Link
          to="/registrations"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="space-y-3">
        {registrations.slice(0, 5).map((registration) => (
          <div
            key={registration.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {registration.name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {registration.email} · {registration.phone}
              </p>
            </div>

            <Link
              to="/registrations"
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
            >
              Review
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
