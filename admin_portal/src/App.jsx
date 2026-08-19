import { useState, useEffect, createContext, useContext } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from './components/PageState.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';

// ── API Setup ─────────────────────────────────────────────────

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

API.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth Context ──────────────────────────────────────────────

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await API.post('/auth/login', { email, password });
    if (data.data.user.role !== 'superuser') throw new Error('Access denied. Superuser only.');
    localStorage.setItem('access_token', data.data.access_token);
    localStorage.setItem('refresh_token', data.data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    setUser(data.data.user);
  };

  const logout = async () => {
    try { await API.post('/auth/logout', { refresh_token: localStorage.getItem('refresh_token') }); }
    catch (_) {}
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthCtx.Provider>
  );
}

// ── Protected Route ───────────────────────────────────────────

function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

// ── Login Page ────────────────────────────────────────────────

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">AP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Pro Ghana</h1>
          <p className="text-gray-500 text-sm mt-1">Superuser Admin Portal</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="admin@agentproghana.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Sidebar Layout ────────────────────────────────────────────

const NAV = [
  { path: '/', icon: '📊', label: 'Dashboard' },
  { path: '/registrations', icon: '🔔', label: 'Registrations' },
  { path: '/subscriptions', icon: '💳', label: 'Subscriptions' },
  { path: '/companies', icon: '🏢', label: 'Companies' },
  { path: '/community', icon: '💬', label: 'Community' },
  {
    path: '/marketplace-businesses',
    icon: '✅',
    label: 'Marketplace Businesses',
  },
  { path: '/shifts', icon: '⏱️', label: 'Shifts' },
  { path: '/marketplace', icon: '🛒', label: 'Business Hub' },
  { path: '/commissions', icon: '💰', label: 'Commissions' },
  { path: '/ussd', icon: '📱', label: 'USSD Templates' },
  { path: '/flows', icon: '🔀', label: 'USSD Flows' },
  { path: '/config', icon: '⚙️', label: 'System Config' },
  { path: '/audit', icon: '📋', label: 'Audit Logs' },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-white shadow-md flex flex-col transition-all duration-200`}>
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">AP</span>
          </div>
          {sidebarOpen && <span className="font-bold text-gray-900 text-sm">Admin Portal</span>}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ path, icon, label }) => (
            <Link key={path} to={path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-primary transition text-sm">
              <span className="text-lg">{icon}</span>
              {sidebarOpen && <span>{label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          {sidebarOpen && <p className="text-xs text-gray-500 mb-2 truncate">{user?.email}</p>}
          <button onClick={logout}
            className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm w-full">
            <span>🚪</span>{sidebarOpen && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm px-6 py-3 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700">
            ☰
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Agent Pro Ghana — Admin</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">● Live</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────

function DashboardPage() {
  const navigate = useNavigate();

  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const response = await API.get('/admin/overview');
      return response.data.data;
    },
  });

  if (isLoading) {
    return <LoadingState label="Loading platform overview..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Dashboard could not be loaded"
        message={
          error?.response?.data?.message ||
          error?.message ||
          'The platform overview is currently unavailable.'
        }
        onRetry={refetch}
      />
    );
  }

  const cards = [
    {
      label: 'Total Companies',
      value: overview?.companies?.total ?? '—',
      sub: `${overview?.companies?.active ?? 0} active`,
      path: '/companies',
    },
    {
      label: 'Total Users',
      value: overview?.users?.total ?? '—',
      sub: 'Platform-wide',
    },
    {
      label: 'Transactions Today',
      value: overview?.transactions_today ?? '—',
      sub: 'All companies',
    },
    {
      label: 'Active Subscriptions',
      value: overview?.active_subscriptions ?? '—',
      sub: 'Business Plan',
      path: '/subscriptions',
    },
    {
      label: 'Pending Ads',
      value: overview?.pending_ads ?? '—',
      sub: 'Awaiting moderation',
      path: '/marketplace',
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Platform Overview
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Current operational status across Agent Pro Ghana.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border
                     border-gray-200 bg-white px-4 py-2 text-sm
                     font-medium text-gray-700 shadow-sm transition
                     hover:bg-gray-50 disabled:cursor-not-allowed
                     disabled:opacity-60"
        >
          <span
            className={isFetching ? 'animate-spin' : ''}
            aria-hidden="true"
          >
            ↻
          </span>
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const content = (
            <>
              <p className="text-2xl font-bold text-gray-900">
                {card.value}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-600">
                {card.label}
              </p>
              <p className="text-xs text-gray-400">
                {card.sub}
              </p>
            </>
          );

          if (!card.path) {
            return (
              <div
                key={card.label}
                className="rounded-xl bg-white p-4 shadow-sm"
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={card.label}
              type="button"
              onClick={() => navigate(card.path)}
              className="rounded-xl bg-white p-4 text-left shadow-sm
                         transition hover:shadow-md hover:ring-2
                         hover:ring-primary/30 focus:outline-none
                         focus:ring-2 focus:ring-primary"
            >
              {content}
            </button>
          );
        })}
      </div>

      <PendingRegistrationsWidget />
    </div>
  );
}

// ── Pending Registrations Widget ──────────────────────────────

function PendingRegistrationsWidget() {
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

// ── Registrations Page ────────────────────────────────────────

function RegistrationsPage() {
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

// ── Subscriptions Page ────────────────────────────────────────

function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState(null);

  const {
    data: payments = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin', 'pending-subscription-payments'],
    queryFn: async () => {
      const response = await API.get(
        '/subscriptions/pending-payments',
      );
      return response.data.data || [];
    },
  });

  const verificationMutation = useMutation({
    mutationFn: async ({ paymentId, action, reason }) => {
      const response = await API.patch(
        `/subscriptions/payment/${paymentId}/verify`,
        {
          action,
          rejection_reason: reason || undefined,
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
          queryKey: ['admin', 'pending-subscription-payments'],
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

  if (isLoading) {
    return (
      <LoadingState label="Loading subscription payments..." />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Subscription payments could not be loaded"
        message={
          error?.response?.data?.message ||
          error?.message ||
          'The payment verification queue is unavailable.'
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
            Pending Subscription Payments
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Verify submitted Mobile Money payment references.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching || verificationMutation.isPending}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No pending subscription payments"
          message="New payment references will appear here for verification."
        />
      ) : (
        <div className="grid gap-4">
          {payments.map((payment) => (
            <article
              key={payment.id}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-gray-900">
                    {payment.company_name ||
                      payment.company?.name ||
                      'Unknown company'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Reference: {payment.momo_reference || '—'}
                  </p>
                </div>

                <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                  Pending verification
                </span>
              </div>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-gray-500">Amount</dt>
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
                    Submitted by
                  </dt>
                  <dd className="font-medium text-gray-900">
                    {payment.first_name ||
                      payment.user_first_name ||
                      '—'}{' '}
                    {payment.last_name ||
                      payment.user_last_name ||
                      ''}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">Submitted</dt>
                  <dd className="font-medium text-gray-900">
                    {payment.submitted_at
                      ? new Date(
                          payment.submitted_at,
                        ).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      payment,
                      action: 'approve',
                    })
                  }
                  disabled={verificationMutation.isPending}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Approve Payment
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      payment,
                      action: 'reject',
                    })
                  }
                  disabled={verificationMutation.isPending}
                  className="flex-1 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Reject Payment
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.action === 'approve'
            ? 'Approve subscription payment?'
            : 'Reject subscription payment?'
        }
        message={
          pendingAction?.action === 'approve'
            ? 'This will activate the company subscription using the submitted payment reference.'
            : 'The payment will remain inactive and the user will be informed that verification was rejected.'
        }
        confirmLabel={
          pendingAction?.action === 'approve'
            ? 'Approve Payment'
            : 'Reject Payment'
        }
        tone={
          pendingAction?.action === 'reject'
            ? 'danger'
            : 'primary'
        }
        requireReason={pendingAction?.action === 'reject'}
        reasonLabel="Rejection reason"
        reasonPlaceholder="Explain why this payment could not be verified..."
        loading={verificationMutation.isPending}
        onClose={() => {
          if (!verificationMutation.isPending) {
            setPendingAction(null);
          }
        }}
        onConfirm={(reason) => {
          if (!pendingAction) return;

          verificationMutation.mutate({
            paymentId: pendingAction.payment.id,
            action: pendingAction.action,
            reason,
          });
        }}
      />
    </div>
  );
}


// ── System Config Page ────────────────────────────────────────

function ConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [editing, setEditing] = useState({});

  useEffect(() => {
    API.get('/admin/config').then(r => setConfigs(r.data.data || []));
  }, []);

  const save = async (key, value) => {
    try {
      await API.patch(`/admin/config/${key}`, { value });
      toast.success('Config updated');
      setEditing(prev => ({ ...prev, [key]: undefined }));
      API.get('/admin/config').then(r => setConfigs(r.data.data || []));
    } catch (_) { toast.error('Failed to update'); }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">System Configuration</h2>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 font-semibold">Key</th>
              <th className="text-left p-4 font-semibold">Value</th>
              <th className="text-left p-4 font-semibold">Description</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {configs.map(c => (
              <tr key={c.key}>
                <td className="p-4 font-mono text-xs text-gray-600">{c.key}</td>
                <td className="p-4">
                  {editing[c.key] !== undefined ? (
                    <input value={editing[c.key]}
                      onChange={e => setEditing(prev => ({ ...prev, [c.key]: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-primary" />
                  ) : (
                    <span className="font-semibold">{c.value}</span>
                  )}
                </td>
                <td className="p-4 text-gray-500 text-xs">{c.description}</td>
                <td className="p-4">
                  {editing[c.key] !== undefined ? (
                    <div className="flex gap-2">
                      <button onClick={() => save(c.key, editing[c.key])}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded">Save</button>
                      <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: undefined }))}
                        className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditing(prev => ({ ...prev, [c.key]: c.value }))}
                      className="text-xs text-primary hover:underline">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Marketplace Moderation Page ───────────────────────────────

function MarketplacePage() {
  const [ads, setAds] = useState([]);
  const load = () => API.get('/admin/ads/pending').then(r => {
    // Ads awaiting payment verification are the ones most likely to
    // get silently forgotten - a "publish" step someone still needs
    // to take, sitting on top of an already-approved ad. Surface them
    // first rather than mixed in chronologically with newer submissions.
    const sorted = (r.data.data || []).sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'pending_payment' ? -1 : 1;
    });
    setAds(sorted);
  });
  useEffect(() => { load(); }, []);

  const moderate = async (adId, action) => {
    try {
      await API.patch(`/admin/ads/${adId}/moderate`, { action });
      toast.success(action === 'publish' ? 'Ad published! ✅' : action === 'approve_review' ? 'Ad approved — pending payment' : 'Ad rejected');
      load();
    } catch (_) { toast.error('Action failed'); }
  };

  const pendingReviewCount = ads.filter(a => a.status === 'pending_review').length;
  const pendingPaymentCount = ads.filter(a => a.status === 'pending_payment').length;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Ad Moderation ({ads.length})</h2>
      {pendingPaymentCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-sm text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{pendingPaymentCount} ad{pendingPaymentCount === 1 ? '' : 's'} already approved, waiting on you to verify payment and publish</span>
        </div>
      )}
      <p className="text-sm text-gray-500 mb-6">{pendingReviewCount} awaiting first review · {pendingPaymentCount} awaiting payment verification</p>
      {ads.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-4">✅</p><p>No pending ads</p></div>
      ) : (
        <div className="grid gap-4">
          {ads.map(ad => (
            <div key={ad.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-bold">{ad.title}</h3>
                  <p className="text-sm text-gray-500">{ad.posted_by_email}</p>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{ad.status}</span>
                </div>
                {ad.price && <span className="font-bold text-green-600">GH₵ {parseFloat(ad.price).toFixed(2)}</span>}
              </div>
              <p className="text-sm text-gray-600 mt-3 line-clamp-2">{ad.description}</p>
              {ad.momo_reference && (
                <div className="mt-3 bg-blue-50 p-3 rounded-lg text-sm">
                  <span className="text-gray-500">Payment Ref:</span> <span className="font-mono font-semibold">{ad.momo_reference}</span>
                  <span className="ml-4 text-gray-500">Amount:</span> GH₵ {ad.payment_amount}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                {ad.status === 'pending_review' && (
                  <>
                    <button onClick={() => moderate(ad.id, 'approve_review')}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">Approve for Payment</button>
                    <button onClick={() => moderate(ad.id, 'reject')}
                      className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm border border-red-200 hover:bg-red-100">Reject</button>
                  </>
                )}
                {ad.status === 'pending_payment' && (
                  <>
                    <button onClick={() => moderate(ad.id, 'publish')}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700">✅ Verify Payment & Publish</button>
                    <button onClick={() => moderate(ad.id, 'reject')}
                      className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm border border-red-200 hover:bg-red-100">Reject</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import {
  CompaniesPage,
  MarketplaceBusinessesPage,
  CommunityModerationPage,
  CompanyDetailPage,
  ShiftsPage,
  USSDTemplatesPage,
  FlowsPage,
  AuditLogsPage,
  CommissionsPage,
} from './pages.jsx';

// ── Root App ──────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <Protected>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/registrations" element={<RegistrationsPage />} />
                  <Route path="/subscriptions" element={<SubscriptionsPage />} />
                  <Route path="/marketplace" element={<MarketplacePage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route
                    path="/marketplace-businesses"
                    element={<MarketplaceBusinessesPage />}
                  />
                  <Route
                    path="/community"
                    element={<CommunityModerationPage />}
                  />
                  <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
                  <Route path="/shifts" element={<ShiftsPage />} />
                  <Route path="/commissions" element={<CommissionsPage />} />
                  <Route path="/ussd" element={<USSDTemplatesPage />} />
                  <Route path="/flows" element={<FlowsPage />} />
                  <Route path="/audit" element={<AuditLogsPage />} />
                </Routes>
              </Layout>
            </Protected>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
