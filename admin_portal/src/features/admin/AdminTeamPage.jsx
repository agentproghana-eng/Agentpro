import {
  useMemo,
  useState,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  adminRoleLabel,
} from '../../lib/adminAccess.js';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/PageState.jsx';

const ADMIN_STAFF_ROLES = [
  'admin_support',
  'admin_operations',
  'admin_finance',
  'admin_content',
];

const ROLE_DESCRIPTIONS = {
  admin_support:
    'Support cases, diagnostics and fraud triage.',
  admin_operations:
    'Registrations, users, shifts and USSD operations.',
  admin_finance:
    'Subscription verification and commission rules.',
  admin_content:
    'Community and Marketplace moderation.',
};

export default function AdminTeamPage() {
  const queryClient =
    useQueryClient();

  const [form, setForm] =
    useState({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role:
        'admin_support',
    });

  const teamQuery =
    useQuery({
      queryKey: [
        'admin',
        'team',
      ],
      retry: false,
      queryFn: async () => {
        const response =
          await API.get(
            '/admin/admin-team',
          );

        return response.data.data;
      },
    });

  const sortedTeam =
    useMemo(
      () =>
        Array.isArray(
          teamQuery.data,
        )
          ? teamQuery.data
          : [],
      [teamQuery.data],
    );

  const createMutation =
    useMutation({
      mutationFn: async () => {
        const response =
          await API.post(
            '/users',
            form,
          );

        return response.data;
      },
      onSuccess:
        async (payload) => {
          toast.success(
            payload?.message ||
              'Administrator account created.',
          );

          setForm({
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            role:
              'admin_support',
          });

          await queryClient
            .invalidateQueries({
              queryKey: [
                'admin',
                'team',
              ],
            });
        },
      onError:
        (error) => {
          toast.error(
            error?.response?.data
              ?.message ||
              'Administrator account could not be created.',
          );
        },
    });

  const updateMutation =
    useMutation({
      mutationFn:
        async ({
          userId,
          role,
          status,
        }) => {
          const response =
            await API.patch(
              `/admin/admin-team/${userId}`,
              {
                ...(role
                  ? { role }
                  : {}),
                ...(status
                  ? { status }
                  : {}),
              },
            );

          return response.data.data;
        },
      onSuccess:
        async () => {
          toast.success(
            'Administrator updated.',
          );

          await queryClient
            .invalidateQueries({
              queryKey: [
                'admin',
                'team',
              ],
            });
        },
      onError:
        (error) => {
          toast.error(
            error?.response?.data
              ?.message ||
              'Administrator update failed.',
          );
        },
    });

  const submit =
    (event) => {
      event.preventDefault();
      createMutation.mutate();
    };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-gray-900">
          Admin Team
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Create least-privilege administrator accounts.
          Every administrator must enroll authenticator MFA.
          Initial passwords are never shown here.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">
          Invite administrator
        </h3>

        <p className="mt-1 text-xs text-gray-500">
          AgentPro sends the existing secure one-time password
          setup link. The invited administrator then enrolls MFA
          on first Admin Portal sign-in.
        </p>

        <form
          onSubmit={submit}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <input
            required
            value={form.first_name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                first_name:
                  event.target.value,
              }))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="First name"
          />

          <input
            required
            value={form.last_name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                last_name:
                  event.target.value,
              }))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Last name"
          />

          <input
            required
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email:
                  event.target.value,
              }))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Email"
          />

          <input
            required
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                phone:
                  event.target.value,
              }))
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Phone"
          />

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Role
            </label>

            <select
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role:
                    event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {ADMIN_STAFF_ROLES.map(
                (role) => (
                  <option
                    key={role}
                    value={role}
                  >
                    {adminRoleLabel(role)}
                  </option>
                ),
              )}
            </select>

            <p className="mt-1 text-xs text-gray-500">
              {
                ROLE_DESCRIPTIONS[
                  form.role
                ]
              }
            </p>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={
                createMutation.isPending
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createMutation.isPending
                ? 'Creating...'
                : 'Send secure invite'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">
          Administrator accounts
        </h3>

        {teamQuery.isLoading ? (
          <LoadingState label="Loading administrators..." />
        ) : teamQuery.isError ? (
          <ErrorState
            title="Admin team could not be loaded"
            message={
              teamQuery.error
                ?.response?.data
                ?.message ||
              teamQuery.error
                ?.message ||
              'Try again.'
            }
            onRetry={
              teamQuery.refetch
            }
          />
        ) : sortedTeam.length ===
          0 ? (
          <EmptyState
            title="No delegated administrators yet"
            message="Superuser remains the only Admin Portal identity."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">
                    Administrator
                  </th>
                  <th className="px-3 py-2">
                    Role
                  </th>
                  <th className="px-3 py-2">
                    MFA
                  </th>
                  <th className="px-3 py-2">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedTeam.map(
                  (member) => (
                    <tr
                      key={member.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">
                          {member.first_name}{' '}
                          {member.last_name}
                        </div>

                        <div className="text-xs text-gray-500">
                          {member.email}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={
                            member.role
                          }
                          disabled={
                            updateMutation
                              .isPending
                          }
                          onChange={(
                            event,
                          ) =>
                            updateMutation
                              .mutate({
                                userId:
                                  member.id,
                                role:
                                  event
                                    .target
                                    .value,
                              })
                          }
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        >
                          {ADMIN_STAFF_ROLES.map(
                            (role) => (
                              <option
                                key={role}
                                value={
                                  role
                                }
                              >
                                {adminRoleLabel(
                                  role,
                                )}
                              </option>
                            ),
                          )}
                        </select>
                      </td>

                      <td className="px-3 py-3 text-xs">
                        {member.mfa_enabled
                          ? 'Enabled'
                          : 'Not enrolled'}
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={
                            member.status
                          }
                          disabled={
                            updateMutation
                              .isPending
                          }
                          onChange={(
                            event,
                          ) =>
                            updateMutation
                              .mutate({
                                userId:
                                  member.id,
                                status:
                                  event
                                    .target
                                    .value,
                              })
                          }
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="active">
                            Active
                          </option>
                          <option value="suspended">
                            Suspended
                          </option>
                          <option value="deactivated">
                            Deactivated
                          </option>
                        </select>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
