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
  ADMIN_STAFF_ROLES,
  adminRoleLabel,
} from '../../lib/adminAccess.js';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/PageState.jsx';

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

function normalizeMember(member) {
  return {
    ...member,
    admin_roles:
      Array.isArray(member?.admin_roles)
        ? member.admin_roles
        : [],
  };
}

function roleSummary(member) {
  const roles =
    normalizeMember(member)
      .admin_roles;

  return roles.length > 0
    ? roles
        .map(adminRoleLabel)
        .join(', ')
    : 'No admin access';
}

export default function AdminTeamPage() {
  const queryClient =
    useQueryClient();

  const [invite, setInvite] =
    useState({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role:
        'admin_support',
    });

  const [search, setSearch] =
    useState('');

  const [editing, setEditing] =
    useState(null);

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

  const candidateQuery =
    useQuery({
      queryKey: [
        'admin',
        'team',
        'candidates',
        search.trim(),
      ],
      enabled:
        search.trim().length >= 2,
      retry: false,
      queryFn: async () => {
        const response =
          await API.get(
            '/admin/admin-team/candidates',
            {
              params: {
                q: search.trim(),
              },
            },
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
              .map(normalizeMember)
          : [],
      [teamQuery.data],
    );

  const openEditor =
    (member) => {
      const normalized =
        normalizeMember(member);

      setEditing({
        id: normalized.id,
        primary_role:
          normalized.primary_role ||
          normalized.role ||
          'customer',
        first_name:
          normalized.first_name || '',
        last_name:
          normalized.last_name || '',
        email:
          normalized.email || '',
        phone:
          normalized.phone || '',
        status:
          normalized.status || 'active',
        admin_roles:
          [...normalized.admin_roles],
        mfa_enabled:
          normalized.mfa_enabled === true,
      });
    };

  const createMutation =
    useMutation({
      mutationFn: async () => {
        const response =
          await API.post(
            '/users',
            invite,
          );

        return response.data;
      },
      onSuccess:
        async (payload) => {
          toast.success(
            payload?.message ||
              'Administrator account created.',
          );

          setInvite({
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
        async (form) => {
          const response =
            await API.patch(
              `/admin/admin-team/${form.id}`,
              {
                first_name:
                  form.first_name,
                last_name:
                  form.last_name,
                email:
                  form.email,
                phone:
                  form.phone,
                status:
                  form.status,
                admin_roles:
                  form.admin_roles,
              },
            );

          return response.data.data;
        },
      onSuccess:
        async (payload) => {
          toast.success(
            payload?.sessions_revoked
              ? 'Account updated. Existing sessions were revoked for security.'
              : 'Account updated.',
          );

          setEditing(null);

          await Promise.all([
            queryClient
              .invalidateQueries({
                queryKey: [
                  'admin',
                  'team',
                ],
              }),
            queryClient
              .invalidateQueries({
                queryKey: [
                  'admin',
                  'team',
                  'candidates',
                ],
              }),
          ]);
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

  const toggleRole =
    (role) => {
      setEditing(
        (current) => {
          if (!current) {
            return current;
          }

          const hasRole =
            current.admin_roles
              .includes(role);

          return {
            ...current,
            admin_roles:
              hasRole
                ? current.admin_roles
                    .filter(
                      (value) =>
                        value !== role,
                    )
                : [
                    ...current.admin_roles,
                    role,
                  ],
          };
        },
      );
    };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-gray-900">
          Admin Team
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Grant several administrator roles to one registered AgentPro
          account without replacing its normal Customer or Business role.
          Admin privileges require an MFA-verified Admin Portal session.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">
          Grant access to a registered user
        </h3>

        <p className="mt-1 text-xs text-gray-500">
          Search by name, email or phone, then edit profile information and
          select any combination of administrator roles.
        </p>

        <input
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value,
            )
          }
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Search registered users..."
        />

        {search.trim().length >= 2 && (
          <div className="mt-3 rounded-lg border border-gray-200">
            {candidateQuery.isLoading ? (
              <LoadingState label="Searching users..." />
            ) : candidateQuery.isError ? (
              <ErrorState
                title="User search failed"
                message={
                  candidateQuery.error
                    ?.response?.data
                    ?.message ||
                  'Try again.'
                }
                onRetry={
                  candidateQuery.refetch
                }
              />
            ) : (
              <div className="divide-y">
                {(
                  candidateQuery.data ||
                  []
                ).map(
                  (member) => (
                    <button
                      type="button"
                      key={member.id}
                      onClick={() =>
                        openEditor(member)
                      }
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <span>
                        <span className="block text-sm font-medium text-gray-900">
                          {member.first_name}{' '}
                          {member.last_name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {member.email}
                          {member.phone
                            ? ` · ${member.phone}`
                            : ''}
                        </span>
                      </span>

                      <span className="text-right text-xs text-gray-500">
                        <span className="block">
                          Primary: {member.primary_role}
                        </span>
                        <span className="block">
                          {roleSummary(member)}
                        </span>
                      </span>
                    </button>
                  ),
                )}

                {(
                  candidateQuery.data ||
                  []
                ).length === 0 && (
                  <div className="p-4 text-sm text-gray-500">
                    No matching registered user.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {editing && (
        <section className="rounded-xl border border-primary/30 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">
                Edit account & admin access
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Primary account role: {editing.primary_role}. This remains
                separate from delegated administrator roles.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setEditing(null)
              }
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Close
            </button>
          </div>

          <form
            className="mt-4 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate(
                editing,
              );
            }}
          >
            <input
              required
              value={editing.first_name}
              onChange={(event) =>
                setEditing(
                  (current) => ({
                    ...current,
                    first_name:
                      event.target.value,
                  }),
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="First name"
            />

            <input
              required
              value={editing.last_name}
              onChange={(event) =>
                setEditing(
                  (current) => ({
                    ...current,
                    last_name:
                      event.target.value,
                  }),
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Last name"
            />

            <input
              required
              type="email"
              value={editing.email}
              onChange={(event) =>
                setEditing(
                  (current) => ({
                    ...current,
                    email:
                      event.target.value,
                  }),
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Email"
            />

            <input
              value={editing.phone}
              onChange={(event) =>
                setEditing(
                  (current) => ({
                    ...current,
                    phone:
                      event.target.value,
                  }),
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Phone"
            />

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                Status
              </label>
              <select
                value={editing.status}
                onChange={(event) =>
                  setEditing(
                    (current) => ({
                      ...current,
                      status:
                        event.target.value,
                    }),
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              MFA: {editing.mfa_enabled
                ? 'Already enrolled'
                : 'Required when Admin Portal access is used'}
            </div>

            <div className="md:col-span-2">
              <p className="mb-2 text-xs font-semibold text-gray-600">
                Administrator roles
              </p>

              <div className="grid gap-2 md:grid-cols-2">
                {ADMIN_STAFF_ROLES.map(
                  (role) => (
                    <label
                      key={role}
                      className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-3"
                    >
                      <input
                        type="checkbox"
                        checked={
                          editing.admin_roles
                            .includes(role)
                        }
                        onChange={() =>
                          toggleRole(role)
                        }
                      />

                      <span>
                        <span className="block text-sm font-medium text-gray-900">
                          {adminRoleLabel(role)}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {ROLE_DESCRIPTIONS[role]}
                        </span>
                      </span>
                    </label>
                  ),
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Clearing all boxes revokes Admin Portal access. Changing
                admin roles, email, phone or status revokes existing sessions.
                A phone change also clears the old phone-verification state.
              </p>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={
                  updateMutation.isPending
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {updateMutation.isPending
                  ? 'Saving...'
                  : 'Save account & roles'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900">
          Invite a new administrator
        </h3>

        <p className="mt-1 text-xs text-gray-500">
          Use this only when the person does not already have AgentPro.
          The secure one-time password setup link remains the initial
          credential path. Additional roles can be added afterward.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <input
            required
            value={invite.first_name}
            onChange={(event) =>
              setInvite(
                (current) => ({
                  ...current,
                  first_name:
                    event.target.value,
                }),
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="First name"
          />

          <input
            required
            value={invite.last_name}
            onChange={(event) =>
              setInvite(
                (current) => ({
                  ...current,
                  last_name:
                    event.target.value,
                }),
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Last name"
          />

          <input
            required
            type="email"
            value={invite.email}
            onChange={(event) =>
              setInvite(
                (current) => ({
                  ...current,
                  email:
                    event.target.value,
                }),
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Email"
          />

          <input
            required
            value={invite.phone}
            onChange={(event) =>
              setInvite(
                (current) => ({
                  ...current,
                  phone:
                    event.target.value,
                }),
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Phone"
          />

          <select
            value={invite.role}
            onChange={(event) =>
              setInvite(
                (current) => ({
                  ...current,
                  role:
                    event.target.value,
                }),
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
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
                    User
                  </th>
                  <th className="px-3 py-2">
                    Primary role
                  </th>
                  <th className="px-3 py-2">
                    Admin roles
                  </th>
                  <th className="px-3 py-2">
                    MFA
                  </th>
                  <th className="px-3 py-2">
                    Status
                  </th>
                  <th className="px-3 py-2">
                    Action
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
                        {member.phone && (
                          <div className="text-xs text-gray-400">
                            {member.phone}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-xs">
                        {member.primary_role}
                      </td>

                      <td className="px-3 py-3 text-xs">
                        {roleSummary(member)}
                      </td>

                      <td className="px-3 py-3 text-xs">
                        {member.mfa_enabled
                          ? 'Enabled'
                          : 'Not enrolled'}
                      </td>

                      <td className="px-3 py-3 text-xs">
                        {member.status}
                      </td>

                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            openEditor(member)
                          }
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
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
