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
import API from './lib/api.js';
import {
  clearAuthSession,
  discardLegacyPersistentAuth,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveAuthSession,
} from './lib/authStorage.js';
import toast, { Toaster } from 'react-hot-toast';

// ── Auth Context ──────────────────────────────────────────────

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Persistent browser storage is no longer an authentication
    // authority for the admin portal.
    discardLegacyPersistentAuth();

    const storedUser = getStoredUser();
    const hasCredential =
      Boolean(getAccessToken()) ||
      Boolean(getRefreshToken());

    if (storedUser && hasCredential) {
      setUser(storedUser);
    } else {
      clearAuthSession();
    }

    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await API.post(
      '/auth/login',
      {
        email,
        password,
      },
    );

    if (
      data?.code ===
        'MFA_ENROLLMENT_REQUIRED' ||
      data?.code ===
        'MFA_REQUIRED'
    ) {
      const challengeToken =
        data?.data?.challenge_token;

      if (!challengeToken) {
        throw new Error(
          'The server did not return a valid MFA challenge.',
        );
      }

      return {
        mfaRequired: true,
        enrollmentRequired:
          data.code ===
          'MFA_ENROLLMENT_REQUIRED',
        challengeToken,
        enrollment:
          data?.data?.enrollment || null,
      };
    }

    if (
      !data?.data?.user ||
      !data?.data?.access_token ||
      !data?.data?.refresh_token
    ) {
      throw new Error(
        'The server returned an incomplete authentication response.',
      );
    }

    if (
      data.data.user.role !==
      'superuser'
    ) {
      // A non-superuser can still authenticate through the shared API,
      // but that session has no authority in the Admin Portal.
      try {
        await API.post(
          '/auth/logout',
          {},
          {
            headers: {
              Authorization:
                `Bearer ${data.data.access_token}`,
            },
          },
        );
      } catch (_) {
        // Server-side expiry remains the final backstop.
      }

      clearAuthSession();

      throw new Error(
        'Access denied. Superuser only.',
      );
    }

    saveAuthSession({
      accessToken:
        data.data.access_token,
      refreshToken:
        data.data.refresh_token,
      user:
        data.data.user,
    });

    setUser(
      data.data.user,
    );

    return {
      mfaRequired: false,
    };
  };

  const completeMfa = async ({
    challengeToken,
    code,
    recoveryCode,
  }) => {
    const body = {
      challenge_token:
        challengeToken,
    };

    if (code) {
      body.code = code;
    }

    if (recoveryCode) {
      body.recovery_code =
        recoveryCode;
    }

    const { data } = await API.post(
      '/auth/mfa/complete',
      body,
    );

    if (
      !data?.data?.user ||
      data.data.user.role !==
        'superuser'
    ) {
      clearAuthSession();

      throw new Error(
        'Access denied. Superuser only.',
      );
    }

    const accessToken =
      data?.data?.access_token;

    const refreshToken =
      data?.data?.refresh_token;

    if (
      !accessToken ||
      !refreshToken
    ) {
      clearAuthSession();

      throw new Error(
        'The server returned incomplete MFA session credentials.',
      );
    }

    saveAuthSession({
      accessToken,
      refreshToken,
      user:
        data.data.user,
    });

    setUser(
      data.data.user,
    );

    return {
      recoveryCodes:
        Array.isArray(
          data?.data?.recovery_codes,
        )
          ? data.data.recovery_codes
          : [],
    };
  };

  const logout = async () => {
    try {
      await API.post('/auth/logout');
    } catch (_) {
      // Clear the local tab session even when the network is unavailable.
      // PostgreSQL remains authoritative for remote session validity.
    }

    clearAuthSession();
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        login,
        completeMfa,
        logout,
        loading,
      }}
    >
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
  const {
    login,
    completeMfa,
  } = useAuth();

  const navigate =
    useNavigate();

  const [stage, setStage] =
    useState('credentials');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [challenge, setChallenge] =
    useState(null);

  const [code, setCode] =
    useState('');

  const [
    recoveryCode,
    setRecoveryCode,
  ] = useState('');

  const [
    useRecoveryCode,
    setUseRecoveryCode,
  ] = useState(false);

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] = useState([]);

  const [loading, setLoading] =
    useState(false);

  const resetMfaFlow = () => {
    setStage('credentials');
    setChallenge(null);
    setCode('');
    setRecoveryCode('');
    setUseRecoveryCode(false);
    setRecoveryCodes([]);
    setPassword('');
  };

  const copyText = async (
    value,
    successMessage,
  ) => {
    try {
      await navigator.clipboard.writeText(
        value,
      );

      toast.success(
        successMessage,
      );
    } catch (_) {
      toast.error(
        'Copy failed. Select and copy it manually.',
      );
    }
  };

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);

    try {
      const result =
        await login(
          email,
          password,
        );

      if (
        result?.mfaRequired
      ) {
        setChallenge(
          result,
        );

        setCode('');
        setRecoveryCode('');
        setUseRecoveryCode(
          false,
        );

        setStage(
          result
            .enrollmentRequired
            ? 'enrollment'
            : 'verification',
        );

        setPassword('');

        return;
      }

      navigate('/');
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
        err.message ||
        'Login failed',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async e => {
    e.preventDefault();

    if (
      !challenge?.challengeToken
    ) {
      toast.error(
        'Your MFA challenge is no longer available. Sign in again.',
      );

      resetMfaFlow();
      return;
    }

    setLoading(true);

    try {
      const result =
        await completeMfa({
          challengeToken:
            challenge.challengeToken,
          code:
            useRecoveryCode
              ? null
              : code,
          recoveryCode:
            useRecoveryCode
              ? recoveryCode
              : null,
        });

      if (
        result.recoveryCodes.length >
        0
      ) {
        setRecoveryCodes(
          result.recoveryCodes,
        );

        setStage(
          'recovery-codes',
        );

        setCode('');
        setRecoveryCode('');

        return;
      }

      navigate('/');
    } catch (err) {
      const response =
        err.response?.data;

      toast.error(
        response?.message ||
        err.message ||
        'MFA verification failed',
      );

      if (
        [
          'MFA_CHALLENGE_EXPIRED',
          'MFA_CHALLENGE_LOCKED',
          'MFA_CHALLENGE_STALE',
        ].includes(
          response?.code,
        )
      ) {
        resetMfaFlow();
      }
    } finally {
      setLoading(false);
    }
  };

  const renderBrand = () => (
    <div className="text-center mb-8">
      <div
        className="
          w-16 h-16
          bg-primary
          rounded-2xl
          flex items-center
          justify-center
          mx-auto mb-4
        "
      >
        <span
          className="
            text-white
            text-2xl
            font-bold
          "
        >
          AP
        </span>
      </div>

      <h1
        className="
          text-2xl
          font-bold
          text-gray-900
        "
      >
        Agent Pro Ghana
      </h1>

      <p
        className="
          text-gray-500
          text-sm
          mt-1
        "
      >
        Superuser Admin Portal
      </p>
    </div>
  );

  if (
    stage ===
    'recovery-codes'
  ) {
    return (
      <div
        className="
          min-h-screen
          bg-gray-50
          flex items-center
          justify-center
          p-4
        "
      >
        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-8
            w-full
            max-w-lg
          "
        >
          {renderBrand()}

          <div
            className="
              rounded-xl
              bg-amber-50
              border
              border-amber-200
              p-4
              mb-5
            "
          >
            <h2
              className="
                font-semibold
                text-amber-900
              "
            >
              Save your recovery codes now
            </h2>

            <p
              className="
                text-sm
                text-amber-800
                mt-1
              "
            >
              Each code works once.
              Store them somewhere safe
              and separate from your
              authenticator device.
            </p>
          </div>

          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              gap-2
              font-mono
              text-sm
              mb-5
            "
          >
            {recoveryCodes.map(
              recovery => (
                <div
                  key={recovery}
                  className="
                    border
                    border-gray-200
                    rounded-lg
                    px-3 py-2
                    bg-gray-50
                    text-center
                    select-all
                  "
                >
                  {recovery}
                </div>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              copyText(
                recoveryCodes.join(
                  '\n',
                ),
                'Recovery codes copied',
              )
            }
            className="
              w-full
              border
              border-primary
              text-primary
              py-2.5
              rounded-lg
              font-semibold
              hover:bg-green-50
              transition
              mb-3
            "
          >
            Copy all recovery codes
          </button>

          <button
            type="button"
            onClick={() =>
              navigate('/')
            }
            className="
              w-full
              bg-primary
              text-white
              py-2.5
              rounded-lg
              font-semibold
              hover:bg-primary-dark
              transition
            "
          >
            I have saved these codes
          </button>
        </div>
      </div>
    );
  }

  if (
    stage === 'enrollment' ||
    stage === 'verification'
  ) {
    const enrolling =
      stage === 'enrollment';

    const secret =
      challenge?.enrollment
        ?.secret || '';

    return (
      <div
        className="
          min-h-screen
          bg-gray-50
          flex items-center
          justify-center
          p-4
        "
      >
        <div
          className="
            bg-white
            rounded-2xl
            shadow-lg
            p-8
            w-full
            max-w-md
          "
        >
          {renderBrand()}

          <div className="mb-6">
            <h2
              className="
                text-lg
                font-semibold
                text-gray-900
              "
            >
              {enrolling
                ? 'Set up authenticator MFA'
                : 'Authenticator verification'}
            </h2>

            <p
              className="
                text-sm
                text-gray-600
                mt-1
              "
            >
              {enrolling
                ? 'Add AgentPro Ghana to your authenticator app, then enter the current six-digit code.'
                : 'Enter the current six-digit code from your authenticator app.'}
            </p>
          </div>

          {enrolling && (
            <div
              className="
                rounded-xl
                border
                border-gray-200
                bg-gray-50
                p-4
                mb-5
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  font-semibold
                  text-gray-500
                  mb-2
                "
              >
                Manual setup key
              </p>

              <div
                className="
                  break-all
                  font-mono
                  text-sm
                  text-gray-900
                  select-all
                  bg-white
                  border
                  rounded-lg
                  p-3
                "
              >
                {secret}
              </div>

              <button
                type="button"
                onClick={() =>
                  copyText(
                    secret,
                    'Setup key copied',
                  )
                }
                className="
                  text-primary
                  text-sm
                  font-medium
                  mt-3
                  hover:underline
                "
              >
                Copy setup key
              </button>

              <p
                className="
                  text-xs
                  text-gray-500
                  mt-3
                "
              >
                Do not share this key.
                AgentPro will store it
                only after you confirm
                a valid authenticator
                code.
              </p>
            </div>
          )}

          <form
            onSubmit={handleMfa}
            className="space-y-4"
          >
            {!useRecoveryCode && (
              <div>
                <label
                  className="
                    block
                    text-sm
                    font-medium
                    text-gray-700
                    mb-1
                  "
                >
                  Authenticator code
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e =>
                    setCode(
                      e.target.value
                        .replace(
                          /\D/g,
                          '',
                        )
                        .slice(
                          0,
                          6,
                        ),
                    )
                  }
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  className="
                    w-full
                    border
                    border-gray-300
                    rounded-lg
                    px-3 py-2
                    text-center
                    tracking-[0.35em]
                    font-mono
                    text-lg
                    focus:outline-none
                    focus:ring-2
                    focus:ring-primary
                  "
                  placeholder="000000"
                  autoFocus
                />
              </div>
            )}

            {useRecoveryCode && (
              <div>
                <label
                  className="
                    block
                    text-sm
                    font-medium
                    text-gray-700
                    mb-1
                  "
                >
                  Recovery code
                </label>

                <input
                  type="text"
                  value={recoveryCode}
                  onChange={e =>
                    setRecoveryCode(
                      e.target.value
                        .toUpperCase()
                        .slice(
                          0,
                          32,
                        ),
                    )
                  }
                  required
                  autoComplete="off"
                  className="
                    w-full
                    border
                    border-gray-300
                    rounded-lg
                    px-3 py-2
                    font-mono
                    uppercase
                    focus:outline-none
                    focus:ring-2
                    focus:ring-primary
                  "
                  placeholder="AAAA-BBBB-CCCC-DDDD"
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full
                bg-primary
                text-white
                py-2.5
                rounded-lg
                font-semibold
                hover:bg-primary-dark
                disabled:opacity-60
                transition
              "
            >
              {loading
                ? 'Verifying...'
                : enrolling
                  ? 'Verify and enable MFA'
                  : 'Verify and sign in'}
            </button>
          </form>

          {!enrolling && (
            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode(
                  current =>
                    !current,
                );

                setCode('');
                setRecoveryCode('');
              }}
              className="
                w-full
                text-sm
                text-primary
                font-medium
                mt-4
                hover:underline
              "
            >
              {useRecoveryCode
                ? 'Use authenticator code instead'
                : 'Use a recovery code instead'}
            </button>
          )}

          <button
            type="button"
            onClick={
              resetMfaFlow
            }
            className="
              w-full
              text-sm
              text-gray-500
              mt-4
              hover:text-gray-700
            "
          >
            Return to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        min-h-screen
        bg-gray-50
        flex items-center
        justify-center
        p-4
      "
    >
      <div
        className="
          bg-white
          rounded-2xl
          shadow-lg
          p-8
          w-full
          max-w-md
        "
      >
        {renderBrand()}

        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >
          <div>
            <label
              className="
                block
                text-sm
                font-medium
                text-gray-700
                mb-1
              "
            >
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={e =>
                setEmail(
                  e.target.value,
                )
              }
              required
              autoComplete="username"
              className="
                w-full
                border
                border-gray-300
                rounded-lg
                px-3 py-2
                focus:outline-none
                focus:ring-2
                focus:ring-primary
              "
              placeholder="admin@agentproghana.com"
            />
          </div>

          <div>
            <label
              className="
                block
                text-sm
                font-medium
                text-gray-700
                mb-1
              "
            >
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={e =>
                setPassword(
                  e.target.value,
                )
              }
              required
              autoComplete="current-password"
              className="
                w-full
                border
                border-gray-300
                rounded-lg
                px-3 py-2
                focus:outline-none
                focus:ring-2
                focus:ring-primary
              "
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="
              w-full
              bg-primary
              text-white
              py-2.5
              rounded-lg
              font-semibold
              hover:bg-primary-dark
              disabled:opacity-60
              transition
            "
          >
            {loading
              ? 'Signing in...'
              : 'Sign In'}
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
              Reference:{' '}
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
                } subscription using the submitted manual MoMo reference.`
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
