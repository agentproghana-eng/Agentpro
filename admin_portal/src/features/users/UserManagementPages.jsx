import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  Badge,
  PageHeader,
  Table,
} from '../../components/AdminUi.jsx';

// Companies
export function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const latestSearchRef = useRef('');

  const load = async ({
    cursor = null,
    append = false,
    term = latestSearchRef.current,
  } = {}) => {
    const normalizedTerm = term.trim();

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await API.get(
        '/users/cursor',
        {
          params: {
            role: 'business_owner',
            limit: 50,
            ...(normalizedTerm.length >= 2
              ? { search: normalizedTerm }
              : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      );

      if (normalizedTerm !== latestSearchRef.current) {
        return;
      }

      const rows = response.data.data || [];

      setCompanies((current) =>
        append ? [...current, ...rows] : rows,
      );

      setNextCursor(
        response.data.meta?.next_cursor || null,
      );
      setHasMore(Boolean(response.data.meta?.has_more));
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load companies',
      );
    } finally {
      if (normalizedTerm === latestSearchRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  };

  useEffect(() => {
    const normalizedTerm = search.trim();
    latestSearchRef.current = normalizedTerm;

    const timeout = setTimeout(() => {
      setNextCursor(null);
      setHasMore(false);
      load({ term: normalizedTerm });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const toggleStatus = async (company) => {
    const newStatus =
      company.status === 'active' ? 'suspended' : 'active';

    setUpdatingId(company.id);

    try {
      await API.patch(`/users/${company.id}`, {
        status: newStatus,
      });

      toast.success(
        newStatus === 'active'
          ? 'Business owner activated.'
          : 'Business owner suspended.',
      );

      await load({ term: latestSearchRef.current });
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'The account status could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Manage company accounts, subscriptions, owners, and staff"
        action={
          <div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies..."
              aria-label="Search companies"
              className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search.trim().length === 1 && (
              <p className="mt-1 text-xs text-gray-400">
                Enter at least 2 characters to search.
              </p>
            )}
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <Table
          loading={loading}
          data={companies}
          emptyMsg="No companies found"
          columns={[
            {
              key: 'company_name',
              label: 'Company',
              render: (row) => (
                <div>
                  <p className="font-semibold text-gray-900">
                    {row.company_name || '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Owner: {row.first_name || '—'}{' '}
                    {row.last_name || ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'email',
              label: 'Contact',
              render: (row) => (
                <div>
                  <p>{row.email || '—'}</p>
                  <p className="text-xs text-gray-500">
                    {row.phone || '—'}
                  </p>
                </div>
              ),
            },
            {
              key: 'subscription_plan',
              label: 'Plan',
              render: (row) => (
                <Badge status={row.subscription_plan || 'none'} />
              ),
            },
            {
              key: 'subscription_status',
              label: 'Subscription',
              render: (row) => (
                <Badge status={row.subscription_status || 'none'} />
              ),
            },
            {
              key: 'subscription_expires_at',
              label: 'Expires',
              render: (row) =>
                row.subscription_expires_at
                  ? new Date(row.subscription_expires_at).toLocaleDateString()
                  : '—',
            },
            {
              key: 'status',
              label: 'Owner Account',
              render: (row) => <Badge status={row.status} />,
            },
            {
              key: 'created_at',
              label: 'Joined',
              render: (row) =>
                row.created_at
                  ? new Date(row.created_at).toLocaleDateString()
                  : '—',
            },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <button
                  type="button"
                  disabled={updatingId === row.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleStatus(row);
                  }}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50',
                    row.status === 'active'
                      ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100',
                  ].join(' ')}
                >
                  {updatingId === row.id
                    ? 'Updating...'
                    : row.status === 'active'
                      ? 'Suspend'
                      : 'Activate'}
                </button>
              ),
            },
          ]}
          onRowClick={(row) =>
            navigate(`/companies/${row.company_id}`)
          }
        />

        {hasMore && !loading && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button
              type="button"
              disabled={loadingMore || !nextCursor}
              onClick={() =>
                load({
                  cursor: nextCursor,
                  append: true,
                  term: latestSearchRef.current,
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Personal Users
export function PersonalUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const latestSearchRef = useRef('');

  const load = async ({
    cursor = null,
    append = false,
    term = latestSearchRef.current,
  } = {}) => {
    const normalizedTerm = term.trim();

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await API.get(
        '/users/cursor',
        {
          params: {
            personal_only: true,
            limit: 50,
            ...(normalizedTerm.length >= 2
              ? { search: normalizedTerm }
              : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      );

      if (normalizedTerm !== latestSearchRef.current) {
        return;
      }

      const rows = response.data.data || [];

      setUsers((current) =>
        append ? [...current, ...rows] : rows,
      );

      setNextCursor(response.data.meta?.next_cursor || null);
      setHasMore(Boolean(response.data.meta?.has_more));
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load Personal users',
      );
    } finally {
      if (normalizedTerm === latestSearchRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  };

  useEffect(() => {
    const normalizedTerm = search.trim();
    latestSearchRef.current = normalizedTerm;

    const timeout = setTimeout(() => {
      setNextCursor(null);
      setHasMore(false);
      load({ term: normalizedTerm });
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div>
      <PageHeader
        title="Personal Users"
        subtitle="Personal-capability accounts and subscription state"
        action={
          <div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Personal users..."
              aria-label="Search Personal users"
              className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search.trim().length === 1 && (
              <p className="mt-1 text-xs text-gray-400">
                Enter at least 2 characters to search.
              </p>
            )}
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <Table
          loading={loading}
          data={users}
          emptyMsg="No Personal users found"
          columns={[
            {
              key: 'name',
              label: 'User',
              render: (row) => (
                <div>
                  <p className="font-semibold text-gray-900">
                    {row.first_name || '—'}{' '}
                    {row.last_name || ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.company_name || 'Personal only'}
                  </p>
                </div>
              ),
            },
            {
              key: 'email',
              label: 'Contact',
              render: (row) => (
                <div>
                  <p>{row.email || '—'}</p>
                  <p className="text-xs text-gray-500">
                    {row.phone || '—'}
                  </p>
                </div>
              ),
            },
            {
              key: 'role',
              label: 'Account Role',
              render: (row) => <Badge status={row.role} />,
            },
            {
              key: 'personal_subscription_plan',
              label: 'Personal Plan',
              render: (row) => (
                <Badge status={row.personal_subscription_plan || 'none'} />
              ),
            },
            {
              key: 'personal_subscription_status',
              label: 'Subscription',
              render: (row) => (
                <Badge status={row.personal_subscription_status || 'none'} />
              ),
            },
            {
              key: 'personal_subscription_expires_at',
              label: 'Expires',
              render: (row) =>
                row.personal_subscription_expires_at
                  ? new Date(row.personal_subscription_expires_at).toLocaleDateString()
                  : '—',
            },
            {
              key: 'status',
              label: 'Account',
              render: (row) => <Badge status={row.status} />,
            },
          ]}
        />

        {hasMore && !loading && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button
              type="button"
              disabled={loadingMore || !nextCursor}
              onClick={() =>
                load({
                  cursor: nextCursor,
                  append: true,
                  term: latestSearchRef.current,
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Company Detail
export function CompanyDetailPage() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const loadInitial = async () => {
    setLoading(true);

    try {
      const [ownerResponse, staffResponse] =
        await Promise.all([
          API.get('/users/cursor', {
            params: {
              company_id: companyId,
              role: 'business_owner',
              limit: 1,
            },
          }),
          API.get('/users/cursor', {
            params: {
              company_id: companyId,
              limit: 50,
            },
          }),
        ]);

      setOwner(
        ownerResponse.data.data?.[0] ||
          null,
      );

      const rows =
        staffResponse.data.data || [];

      setStaff(
        rows.filter(
          user =>
            user.role !==
            'business_owner',
        ),
      );

      setNextCursor(
        staffResponse.data.meta
          ?.next_cursor || null,
      );

      setHasMore(
        Boolean(
          staffResponse.data.meta
            ?.has_more,
        ),
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load company details',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const response =
        await API.get('/users/cursor', {
          params: {
            company_id: companyId,
            limit: 50,
            cursor: nextCursor,
          },
        });

      const rows =
        response.data.data || [];

      setStaff(current => {
        const seen = new Set(
          current.map(user => user.id),
        );

        return [
          ...current,
          ...rows.filter(
            user =>
              user.role !==
                'business_owner' &&
              !seen.has(user.id),
          ),
        ];
      });

      setNextCursor(
        response.data.meta
          ?.next_cursor || null,
      );

      setHasMore(
        Boolean(
          response.data.meta
            ?.has_more,
        ),
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to load more staff',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setOwner(null);
    setStaff([]);
    setNextCursor(null);
    setHasMore(false);
    loadInitial();
  }, [companyId]);

  const toggleStatus = async (
    userId,
    currentStatus,
  ) => {
    const newStatus =
      currentStatus === 'active'
        ? 'suspended'
        : 'active';

    setUpdatingId(userId);

    try {
      await API.patch(
        `/users/${userId}`,
        { status: newStatus },
      );

      setStaff(current =>
        current.map(user =>
          user.id === userId
            ? {
                ...user,
                status: newStatus,
              }
            : user,
        ),
      );

      toast.success(
        `User ${newStatus}`,
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Action failed',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          navigate('/companies')
        }
        className="text-sm text-primary hover:underline mb-4 flex items-center gap-1"
      >
        ← Back to Companies
      </button>

      {owner ? (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {owner.company_name || '—'}
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Owner: {owner.first_name}{' '}
                {owner.last_name} · {owner.email} ·{' '}
                {owner.phone || '—'}
              </p>
            </div>

            <Badge status={owner.status} />
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          No business owner found for this company.
        </div>
      )}

      <PageHeader
        title="Staff"
        subtitle={`Loaded ${staff.length} staff member${staff.length === 1 ? '' : 's'}`}
      />

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table
          loading={false}
          data={staff}
          emptyMsg="No other staff yet"
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: row =>
                `${row.first_name} ${row.last_name}`,
            },
            {
              key: 'role',
              label: 'Role',
              render: row => (
                <Badge status={row.role} />
              ),
            },
            {
              key: 'email',
              label: 'Email',
            },
            {
              key: 'phone',
              label: 'Phone',
            },
            {
              key: 'status',
              label: 'Status',
              render: row => (
                <Badge status={row.status} />
              ),
            },
            {
              key: 'created_at',
              label: 'Joined',
              render: row =>
                row.created_at
                  ? new Date(
                      row.created_at,
                    ).toLocaleDateString()
                  : '—',
            },
            {
              key: 'actions',
              label: '',
              render: row => (
                <button
                  type="button"
                  disabled={
                    updatingId === row.id
                  }
                  onClick={event => {
                    event.stopPropagation();

                    toggleStatus(
                      row.id,
                      row.status,
                    );
                  }}
                  className={[
                    'text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50',
                    row.status === 'active'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200',
                  ].join(' ')}
                >
                  {updatingId === row.id
                    ? 'Updating...'
                    : row.status === 'active'
                      ? 'Suspend'
                      : 'Activate'}
                </button>
              ),
            },
          ]}
        />

        {hasMore && (
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
                : 'Load more staff'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
