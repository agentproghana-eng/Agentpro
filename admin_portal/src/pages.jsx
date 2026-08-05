import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
API.interceptors.request.use(cfg => {
  const t = localStorage.getItem('access_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ── Shared Components ─────────────────────────────────────────

export function Badge({ status }) {
  const colors = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    suspended: 'bg-red-100 text-red-700',
    deactivated: 'bg-gray-100 text-gray-500',
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    business: 'bg-blue-100 text-blue-700',
    free: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
      {status?.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

export function Table({ columns, data, loading, emptyMsg = 'No data', onRowClick }) {
  if (loading) return <div className="text-center py-16 text-gray-400">Loading...</div>;
  if (!data.length) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-3xl mb-3">📭</p><p>{emptyMsg}</p>
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>{columns.map(c => (
            <th key={c.key} className="text-left px-4 py-3 font-semibold text-gray-600">{c.label}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row, i) => (
            <tr key={row.id || i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`hover:bg-gray-50 transition ${onRowClick ? 'cursor-pointer' : ''}`}>
              {columns.map(c => (
                <td key={c.key} className="px-4 py-3 text-gray-700">
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon, sub, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Companies Page ────────────────────────────────────────────

export function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    setLoading(true);

    try {
      const response = await API.get(
        '/users?role=business_owner&limit=100',
      );

      setCompanies(response.data.data || []);
    } catch (_) {
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = companies.filter((company) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return (
      company.company_name?.toLowerCase().includes(term) ||
      company.email?.toLowerCase().includes(term) ||
      company.phone?.toLowerCase().includes(term)
    );
  });

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

      await load();
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
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search marketplace businesses..."
            className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        }
      />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <Table
          loading={loading}
          data={filtered}
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
                <Badge
                  status={row.subscription_plan || 'free'}
                />
              ),
            },
            {
              key: 'subscription_status',
              label: 'Subscription',
              render: (row) => (
                <Badge
                  status={row.subscription_status || 'pending'}
                />
              ),
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
      </div>
    </div>
  );
}

// ── Marketplace Businesses Page ───────────────────────────────


export function MarketplaceBusinessesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    setLoading(true);

    try {
      const response = await API.get(
        '/admin/marketplace-businesses',
      );

      setCompanies(response.data.data || []);
    } catch (_) {
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = companies.filter((company) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return (
      company.company_name?.toLowerCase().includes(term) ||
      company.email?.toLowerCase().includes(term) ||
      company.company_email?.toLowerCase().includes(term)
    );
  });

  const toggleStatus = async (userId, currentStatus) => {
    const newStatus =
      currentStatus === 'active' ? 'suspended' : 'active';

    try {
      await API.patch(`/users/${userId}`, {
        status: newStatus,
      });

      toast.success(`User ${newStatus}`);
      await load();
    } catch (_) {
      toast.error('Action failed');
    }
  };

  const toggleVerification = async (company) => {
    setUpdatingId(company.company_id);

    try {
      const response = await API.patch(
        `/admin/marketplace-businesses/${company.company_id}/verification`,
        {
          verified: !company.marketplace_verified,
        },
      );

      toast.success(response.data.message);
      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Verification could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleFeatured = async (company) => {
    let priority = company.marketplace_featured_priority || 0;

    if (!company.marketplace_featured) {
      const entered = window.prompt(
        'Featured priority (higher numbers appear first):',
        String(priority || 10),
      );

      if (entered === null) return;

      priority = Number(entered);

      if (
        !Number.isInteger(priority) ||
        priority < 0 ||
        priority > 10000
      ) {
        toast.error(
          'Priority must be an integer between 0 and 10000.',
        );
        return;
      }
    }

    setUpdatingId(company.company_id);

    try {
      const response = await API.patch(
        `/admin/marketplace-businesses/${company.company_id}/featured`,
        {
          featured: !company.marketplace_featured,
          priority,
        },
      );

      toast.success(response.data.message);
      await load();
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
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search companies..."
            className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        }
      />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <Table
          loading={loading}
          data={filtered}
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
                    {row.active_ad_count || 0} active ads
                    {' · '}
                    {Number(row.average_rating || 0).toFixed(1)}
                    {' rating'}
                  </p>
                </div>
              ),
            },
            {
              key: 'email',
              label: 'Owner',
              render: (row) => (
                <div>
                  <p>
                    {row.first_name} {row.last_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.email || '—'}
                  </p>
                </div>
              ),
            },
            {
              key: 'subscription_plan',
              label: 'Plan',
              render: (row) => (
                <Badge
                  status={row.subscription_plan || 'free'}
                />
              ),
            },
            {
              key: 'marketplace_verified',
              label: 'Verified',
              render: (row) =>
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
              render: (row) =>
                row.marketplace_featured ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                    ★ Priority{' '}
                    {row.marketplace_featured_priority || 0}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                ),
            },
            {
              key: 'status',
              label: 'Account',
              render: (row) => <Badge status={row.status} />,
            },
            {
              key: 'marketplace_actions',
              label: 'Marketplace Actions',
              render: (row) => (
                <div
                  className="flex flex-wrap gap-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={updatingId === row.company_id}
                    onClick={() => toggleVerification(row)}
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
                    disabled={updatingId === row.company_id}
                    onClick={() => toggleFeatured(row)}
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
              render: (row) => (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleStatus(row.owner_user_id, row.status);
                  }}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    row.status === 'active'
                      ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100',
                  ].join(' ')}
                >
                  {row.status === 'active'
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
      </div>
    </div>
  );
}
export function CommunityModerationPage() {
  const [reports, setReports] = useState({
    post_reports: [],
    comment_reports: [],
  });
  const [pendingPosts, setPendingPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [activeTab, setActiveTab] = useState('reports');

  const load = async () => {
    setLoading(true);

    try {
      const [reportResponse, pendingResponse] = await Promise.all([
        API.get('/agent-posts/moderation/reports', {
          params: { status: 'pending' },
        }),
        API.get('/agent-posts/moderation/pending'),
      ]);

      setReports(
        reportResponse.data.data || {
          post_reports: [],
          comment_reports: [],
        },
      );

      setPendingPosts(pendingResponse.data.data || []);
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Community moderation data could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolveReport = async (
    report,
    reportType,
    status,
  ) => {
    setUpdatingId(report.id);

    try {
      await API.patch(
        `/agent-posts/moderation/reports/${report.id}`,
        {
          report_type: reportType,
          status,
          resolution_note:
            status === 'dismissed'
              ? 'Dismissed by administrator'
              : 'Reviewed by administrator',
        },
      );

      toast.success('Report updated');
      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Report could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const moderatePost = async (postId, updates) => {
    setUpdatingId(postId);

    try {
      await API.patch(
        `/agent-posts/${postId}/community-moderation`,
        updates,
      );

      toast.success('Post moderation updated');
      await load();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Post moderation could not be updated.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const postReports = reports.post_reports || [];
  const commentReports = reports.comment_reports || [];
  const totalReports =
    postReports.length + commentReports.length;

  const tabs = [
    { key: 'reports', label: `Reports (${totalReports})` },
    {
      key: 'pending',
      label: `Pending Review (${pendingPosts.length})`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community Moderation"
        subtitle="Review reports, approve flagged posts, and manage Agent Community content"
        action={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Reported Posts', postReports.length],
          ['Reported Comments', commentReports.length],
          ['Pending Review', pendingPosts.length],
          ['Open Moderation Items', totalReports + pendingPosts.length],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'border-b-2 px-4 py-3 text-sm font-medium',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Reported Posts
              </h2>
            </div>

            <Table
              loading={loading}
              data={postReports}
              emptyMsg="No pending post reports"
              columns={[
                {
                  key: 'reported_content',
                  label: 'Content',
                  render: (row) => (
                    <div className="max-w-md">
                      <p className="line-clamp-3 text-sm text-gray-800">
                        {row.reported_content || 'Voice-note post'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Author: {row.author_first_name}{' '}
                        {row.author_last_name}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'reason',
                  label: 'Reason',
                  render: (row) => <Badge status={row.reason} />,
                },
                {
                  key: 'reporter',
                  label: 'Reporter',
                  render: (row) => (
                    <span>
                      {row.reporter_first_name}{' '}
                      {row.reporter_last_name}
                    </span>
                  ),
                },
                {
                  key: 'created_at',
                  label: 'Reported',
                  render: (row) =>
                    new Date(row.created_at).toLocaleString(),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'post',
                            'dismissed',
                          )
                        }
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                      >
                        Dismiss
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={async () => {
                          await moderatePost(row.post_id, {
                            status: 'removed',
                            reason: `Reported: ${row.reason}`,
                          });

                          await resolveReport(
                            row,
                            'post',
                            'actioned',
                          );
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
                      >
                        Remove post
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                Reported Comments
              </h2>
            </div>

            <Table
              loading={loading}
              data={commentReports}
              emptyMsg="No pending comment reports"
              columns={[
                {
                  key: 'reported_content',
                  label: 'Comment',
                },
                {
                  key: 'reason',
                  label: 'Reason',
                  render: (row) => <Badge status={row.reason} />,
                },
                {
                  key: 'author',
                  label: 'Author',
                  render: (row) => (
                    <span>
                      {row.author_first_name}{' '}
                      {row.author_last_name}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'comment',
                            'dismissed',
                          )
                        }
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                      >
                        Dismiss
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          resolveReport(
                            row,
                            'comment',
                            'actioned',
                          )
                        }
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
                      >
                        Mark actioned
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
      )}

      {activeTab === 'pending' && (
        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Table
            loading={loading}
            data={pendingPosts}
            emptyMsg="No posts awaiting review"
            columns={[
              {
                key: 'content',
                label: 'Post',
                render: (row) => (
                  <div className="max-w-lg">
                    <p className="line-clamp-3">
                      {row.content || 'Voice-note post'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.first_name} {row.last_name}
                    </p>
                  </div>
                ),
              },
              {
                key: 'flagged_reason',
                label: 'Reason',
              },
              {
                key: 'created_at',
                label: 'Submitted',
                render: (row) =>
                  new Date(row.created_at).toLocaleString(),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() =>
                        moderatePost(row.id, {
                          status: 'active',
                          reason: 'Approved by administrator',
                        })
                      }
                      className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() =>
                        moderatePost(row.id, {
                          status: 'removed',
                          reason: 'Rejected by administrator',
                        })
                      }
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() =>
                        moderatePost(row.id, {
                          status: 'active',
                          is_official: true,
                          is_pinned: true,
                          reason:
                            'Approved and highlighted by administrator',
                        })
                      }
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700"
                    >
                      Approve + pin
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}

