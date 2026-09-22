import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import API from '../../lib/api.js';
import {
  Badge,
  PageHeader,
  Table,
} from '../../components/AdminUi.jsx';

export function MarketplaceBusinessesPage({
  allowAccountActions = true,
}) {
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
    const normalizedTerm =
      term.trim();

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response =
        await API.get(
          '/admin/marketplace-businesses/cursor',
          {
            params: {
              limit: 50,
              ...(normalizedTerm.length >= 2
                ? {
                    search:
                      normalizedTerm,
                  }
                : {}),
              ...(cursor
                ? { cursor }
                : {}),
            },
          },
        );

      if (
        normalizedTerm !==
        latestSearchRef.current
      ) {
        return;
      }

      const rows =
        response.data.data || [];

      setCompanies(current => {
        if (!append) {
          return rows;
        }

        const seen = new Set(
          current.map(
            company =>
              company.company_id,
          ),
        );

        return [
          ...current,
          ...rows.filter(
            company =>
              !seen.has(
                company.company_id,
              ),
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
          'Failed to load marketplace businesses',
      );
    } finally {
      if (
        normalizedTerm ===
        latestSearchRef.current
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
    const normalizedTerm =
      search.trim();

    latestSearchRef.current =
      normalizedTerm;

    const timeout = setTimeout(
      () => {
        setNextCursor(null);
        setHasMore(false);

        load({
          term: normalizedTerm,
        });
      },
      300,
    );

    return () =>
      clearTimeout(timeout);
  }, [search]);

  const reloadFirstPage = () =>
    load({
      term:
        latestSearchRef.current,
    });

  const toggleStatus = async (
    userId,
    currentStatus,
  ) => {
    if (!userId) {
      toast.error(
        'No marketplace owner account is attached to this company.',
      );
      return;
    }

    const newStatus =
      currentStatus === 'active'
        ? 'suspended'
        : 'active';

    try {
      await API.patch(
        `/users/${userId}`,
        {
          status: newStatus,
        },
      );

      toast.success(
        `User ${newStatus}`,
      );

      await reloadFirstPage();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Action failed',
      );
    }
  };

  const toggleVerification =
    async company => {
      setUpdatingId(
        company.company_id,
      );

      try {
        const response =
          await API.patch(
            `/admin/marketplace-businesses/${company.company_id}/verification`,
            {
              verified:
                !company.marketplace_verified,
            },
          );

        toast.success(
          response.data.message,
        );

        await reloadFirstPage();
      } catch (error) {
        toast.error(
          error.response?.data?.message ||
            'Verification could not be updated.',
        );
      } finally {
        setUpdatingId(null);
      }
    };

  const toggleFeatured =
    async company => {
      let priority =
        company.marketplace_featured_priority ||
        0;

      if (
        !company.marketplace_featured
      ) {
        const entered =
          window.prompt(
            'Featured priority (higher numbers appear first):',
            String(
              priority || 10,
            ),
          );

        if (entered === null) {
          return;
        }

        priority =
          Number(entered);

        if (
          !Number.isInteger(
            priority,
          ) ||
          priority < 0 ||
          priority > 10000
        ) {
          toast.error(
            'Priority must be an integer between 0 and 10000.',
          );
          return;
        }
      }

      setUpdatingId(
        company.company_id,
      );

      try {
        const response =
          await API.patch(
            `/admin/marketplace-businesses/${company.company_id}/featured`,
            {
              featured:
                !company.marketplace_featured,
              priority,
            },
          );

        toast.success(
          response.data.message,
        );

        await reloadFirstPage();
      } catch (error) {
        toast.error(
          error.response?.data?.message ||
            'Featured placement could not be updated.',
        );
      } finally {
        setUpdatingId(null);
      }
    };

  return (
    <div>
      <PageHeader
        title="Marketplace Businesses"
        subtitle="Manage verification, featured placement, and seller trust"
        action={
          <div>
            <input
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search companies or seller email..."
              aria-label="Search marketplace businesses"
              className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
              render: row => (
                <div>
                  <p className="font-semibold text-gray-900">
                    {row.company_name || '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.active_ad_count || 0} active ads
                    {' · '}
                    {Number(
                      row.average_rating || 0,
                    ).toFixed(1)}
                    {' rating'}
                  </p>
                </div>
              ),
            },
            {
              key: 'email',
              label: 'Owner',
              render: row => (
                <div>
                  <p>
                    {row.first_name || '—'}{' '}
                    {row.last_name || ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.email ||
                      row.company_email ||
                      '—'}
                  </p>
                </div>
              ),
            },
            {
              key: 'subscription_plan',
              label: 'Plan',
              render: row => (
                <Badge
                  status={
                    row.subscription_plan ||
                    'free'
                  }
                />
              ),
            },
            {
              key: 'marketplace_verified',
              label: 'Verified',
              render: row =>
                row.marketplace_verified ? (
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                    ✓ Verified
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    Not verified
                  </span>
                ),
            },
            {
              key: 'marketplace_featured',
              label: 'Featured',
              render: row =>
                row.marketplace_featured ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                    ★ Priority{' '}
                    {row.marketplace_featured_priority ||
                      0}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">
                    —
                  </span>
                ),
            },
            {
              key: 'status',
              label: 'Account',
              render: row => (
                <Badge
                  status={row.status}
                />
              ),
            },
            {
              key: 'marketplace_actions',
              label: 'Marketplace Actions',
              render: row => (
                <div
                  className="flex flex-wrap gap-2"
                  onClick={event =>
                    event.stopPropagation()
                  }
                >
                  <button
                    type="button"
                    disabled={
                      updatingId ===
                      row.company_id
                    }
                    onClick={() =>
                      toggleVerification(
                        row,
                      )
                    }
                    className={[
                      'rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50',
                      row.marketplace_verified
                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
                    ].join(' ')}
                  >
                    {row.marketplace_verified
                      ? 'Remove verification'
                      : 'Verify'}
                  </button>

                  <button
                    type="button"
                    disabled={
                      updatingId ===
                      row.company_id
                    }
                    onClick={() =>
                      toggleFeatured(row)
                    }
                    className={[
                      'rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50',
                      row.marketplace_featured
                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {row.marketplace_featured
                      ? 'Remove featured'
                      : 'Feature'}
                  </button>
                </div>
              ),
            },
            {
              key: 'account_action',
              label: '',
              render: row =>
                allowAccountActions ? (
                  <button
                    type="button"
                    disabled={
                      !row.owner_user_id
                    }
                    onClick={event => {
                      event.stopPropagation();

                      toggleStatus(
                        row.owner_user_id,
                        row.status,
                      );
                    }}
                    className={[
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50',
                      row.status === 'active'
                        ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100',
                    ].join(' ')}
                  >
                    {row.owner_user_id
                      ? row.status ===
                        'active'
                        ? 'Suspend'
                        : 'Activate'
                      : 'No owner'}
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">
                    Superuser only
                  </span>
                ),
            },
          ]}
          onRowClick={
            allowAccountActions
              ? row =>
                  navigate(
                    `/companies/${row.company_id}`,
                  )
              : undefined
          }
        />

        {hasMore && !loading && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button
              type="button"
              disabled={
                loadingMore ||
                !nextCursor
              }
              onClick={() =>
                load({
                  cursor: nextCursor,
                  append: true,
                  term:
                    latestSearchRef.current,
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingMore
                ? 'Loading...'
                : 'Load more businesses'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
