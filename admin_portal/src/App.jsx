import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from 'react';
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
        AgentPro
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
                ? 'Add AgentPro to your authenticator app, then enter the current six-digit code.'
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
              placeholder="admin@example.com"
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
  { path: '/personal-users', icon: '👤', label: 'Personal Users' },
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
  { path: '/support', icon: '🛟', label: 'Support' },
  { path: '/audit', icon: '📋', label: 'Audit Logs' },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-100">
      <UssdFlowHealthToastWatcher />

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
          <h1 className="text-lg font-semibold text-gray-800">AgentPro — Admin</h1>
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
            Current operational status across AgentPro.
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

      <UssdFlowHealthAlerts />
      <OperationalHealthWidget />
      <PendingRegistrationsWidget />
    </div>
  );
}


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

function UssdFlowHealthToastWatcher() {
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

function UssdFlowHealthAlerts() {
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

function OperationalHealthWidget() {
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


// ── Support Console Page ──────────────────────────────────────

function SupportConsolePage() {
  const queryClient =
    useQueryClient();

  const [
    fraudStatus,
    setFraudStatus,
  ] = useState('open');

  const [
    fraudSeverity,
    setFraudSeverity,
  ] = useState('all');

  const fraudSignalsQuery =
    useQuery({
      queryKey: [
        'admin',
        'fraud-signals',
        fraudStatus,
        fraudSeverity,
      ],

      retry: false,

      queryFn: async () => {
        const response =
          await API.get(
            '/admin/fraud-signals',
            {
              params: {
                status:
                  fraudStatus,
                severity:
                  fraudSeverity,
                limit: 50,
              },
            },
          );

        return response.data.data;
      },
    });

  const fraudReviewMutation =
    useMutation({
      mutationFn:
        async ({
          signalId,
          status,
        }) => {
          const response =
            await API.patch(
              `/admin/fraud-signals/${signalId}/review`,
              {
                status,
              },
            );

          return response.data.data;
        },

      onSuccess:
        async (
          signal,
        ) => {
          toast.success(
            `Fraud signal marked ${signal.review_status}.`,
          );

          await queryClient
            .invalidateQueries({
              queryKey: [
                'admin',
                'fraud-signals',
              ],
            });
        },

      onError:
        error => {
          toast.error(
            error?.response?.data
              ?.message ||
              'Fraud signal review failed.',
          );
        },
    });

  const reviewFraudSignal =
    (
      signal,
      status,
    ) => {
      if (
        !signal?.id ||
        signal.review_status !==
          'open' ||
        fraudReviewMutation
          .isPending
      ) {
        return;
      }

      const labels = {
        reviewed:
          'mark this signal as reviewed',
        dismissed:
          'dismiss this signal',
        escalated:
          'escalate this signal for further investigation',
      };

      const confirmed =
        window.confirm(
          `Are you sure you want to ${labels[status]}? This review state cannot be changed from this screen.`,
        );

      if (!confirmed) {
        return;
      }

      fraudReviewMutation
        .mutate({
          signalId:
            signal.id,
          status,
        });
    };

  const [
    searchType,
    setSearchType,
  ] = useState(
    'transaction_id',
  );

  const [
    searchValue,
    setSearchValue,
  ] = useState('');

  const [
    submittedSearch,
    setSubmittedSearch,
  ] = useState(null);

  const [
    timelineFilter,
    setTimelineFilter,
  ] = useState('all');

  const searchQuery =
    useQuery({
      queryKey: [
        'admin',
        'support',
        submittedSearch,
      ],

      enabled:
        Boolean(
          submittedSearch,
        ),

      retry: false,

      queryFn: async () => {
        const response =
          await API.get(
            '/admin/support/timeline',
            {
              params:
                submittedSearch,
            },
          );

        return response.data.data;
      },
    });

  const submit =
    event => {
      event.preventDefault();

      const value =
        searchValue.trim();

      if (!value) {
        toast.error(
          'Enter a search value.',
        );

        return;
      }

      setSubmittedSearch({
        type: searchType,
        value,
      });
    };

  const data =
    searchQuery.data;

  const events =
    data?.events || [];

  const caseSummary =
    data?.case_summary || null;

  const filteredEvents =
    events.filter(event => {
      if (
        timelineFilter ===
        'failed'
      ) {
        return (
          event.event_name ===
          'transaction.failed'
        );
      }

      if (
        timelineFilter ===
        'pending_confirmation'
      ) {
        return (
          event.event_name ===
          'transaction.pending_confirmation'
        );
      }

      return true;
    });

  const copySupportId =
    async (
      label,
      value,
    ) => {
      if (!value) {
        return;
      }

      try {
        await navigator.clipboard
          .writeText(
            String(value),
          );

        toast.success(
          `${label} copied`,
        );
      } catch (_) {
        toast.error(
          `Could not copy ${label.toLowerCase()}.`,
        );
      }
    };

  const outcomeLabel =
    value => {
      const labels = {
        completed: 'Completed',
        failed: 'Failed',
        pending_confirmation:
          'Pending confirmation',
        in_progress:
          'In progress',
        unknown: 'Unknown',
      };

      return (
        labels[value] ||
        value ||
        'Unknown'
      );
    };

  return (
    <div>
      <div
        className="
          mb-6
          rounded-xl
          bg-white
          p-5
          shadow-sm
        "
      >
        <div
          className="
            flex
            flex-wrap
            items-start
            justify-between
            gap-4
          "
        >
          <div>
            <h2
              className="
                text-lg
                font-bold
                text-gray-900
              "
            >
              Fraud Signal Queue
            </h2>

            <p
              className="
                mt-1
                max-w-2xl
                text-sm
                text-gray-500
              "
            >
              Advisory anomaly signals
              requiring administrator
              review. Reviewing a signal
              does not block users or
              transactions.
            </p>
          </div>

          <div
            className="
              flex
              flex-wrap
              gap-2
            "
          >
            <select
              aria-label="Fraud signal status"
              value={fraudStatus}
              onChange={event =>
                setFraudStatus(
                  event.target.value,
                )
              }
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                px-3 py-2
                text-sm
                text-gray-700
              "
            >
              <option value="open">
                Open
              </option>
              <option value="escalated">
                Escalated
              </option>
              <option value="reviewed">
                Reviewed
              </option>
              <option value="dismissed">
                Dismissed
              </option>
              <option value="all">
                All
              </option>
            </select>

            <select
              aria-label="Fraud signal severity"
              value={fraudSeverity}
              onChange={event =>
                setFraudSeverity(
                  event.target.value,
                )
              }
              className="
                rounded-lg
                border
                border-gray-200
                bg-white
                px-3 py-2
                text-sm
                text-gray-700
              "
            >
              <option value="all">
                All severities
              </option>
              <option value="critical">
                Critical
              </option>
              <option value="high">
                High
              </option>
              <option value="medium">
                Medium
              </option>
              <option value="low">
                Low
              </option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          {fraudSignalsQuery
            .isLoading ? (
            <LoadingState
              message="Loading fraud signals..."
            />
          ) : fraudSignalsQuery
              .isError ? (
            <ErrorState
              message={
                fraudSignalsQuery
                  .error?.response
                  ?.data?.message ||
                'Fraud signals could not be loaded.'
              }
            />
          ) : !fraudSignalsQuery
              .data?.signals
              ?.length ? (
            <EmptyState
              message="No fraud signals matched these filters."
            />
          ) : (
            <div
              className="
                space-y-3
              "
            >
              {fraudSignalsQuery
                .data.signals
                .map(signal => (
                  <div
                    key={signal.id}
                    className="
                      rounded-xl
                      border
                      border-gray-100
                      p-4
                    "
                  >
                    <div
                      className="
                        flex
                        flex-wrap
                        items-start
                        justify-between
                        gap-3
                      "
                    >
                      <div>
                        <div
                          className="
                            flex
                            flex-wrap
                            items-center
                            gap-2
                          "
                        >
                          <span
                            className="
                              rounded-full
                              bg-gray-100
                              px-2 py-1
                              text-xs
                              font-semibold
                              uppercase
                              tracking-wide
                              text-gray-700
                            "
                          >
                            {
                              signal.severity
                            }
                          </span>

                          <span
                            className="
                              rounded-full
                              bg-gray-50
                              px-2 py-1
                              text-xs
                              font-semibold
                              text-gray-600
                            "
                          >
                            Risk{' '}
                            {
                              signal.risk_score
                            }
                            /100
                          </span>

                          <span
                            className="
                              rounded-full
                              bg-gray-50
                              px-2 py-1
                              text-xs
                              font-semibold
                              text-gray-600
                            "
                          >
                            {
                              signal.review_status
                            }
                          </span>
                        </div>

                        <p
                          className="
                            mt-3
                            text-sm
                            font-semibold
                            text-gray-900
                          "
                        >
                          {
                            signal.rule_id
                          }
                        </p>

                        <p
                          className="
                            mt-1
                            text-xs
                            text-gray-500
                          "
                        >
                          {
                            signal.signal_type
                          }
                          {' · '}
                          {
                            signal.provider ||
                            'provider unknown'
                          }
                          {' · '}
                          {
                            signal.observed_event_count
                          }{' '}
                          observed events
                        </p>
                      </div>

                      <time
                        className="
                          text-xs
                          text-gray-400
                        "
                      >
                        {signal.created_at
                          ? new Date(
                              signal.created_at,
                            ).toLocaleString()
                          : '—'}
                      </time>
                    </div>

                    <div
                      className="
                        mt-4
                        grid
                        gap-3
                        text-xs
                        md:grid-cols-2
                        xl:grid-cols-4
                      "
                    >
                      <div>
                        <p
                          className="
                            text-gray-400
                          "
                        >
                          Signal ID
                        </p>

                        <p
                          className="
                            mt-1
                            break-all
                            font-mono
                            text-gray-600
                          "
                        >
                          {signal.id}
                        </p>
                      </div>

                      <div>
                        <p
                          className="
                            text-gray-400
                          "
                        >
                          Actor user
                        </p>

                        <p
                          className="
                            mt-1
                            break-all
                            font-mono
                            text-gray-600
                          "
                        >
                          {
                            signal.actor_user_id ||
                            '—'
                          }
                        </p>
                      </div>

                      <div>
                        <p
                          className="
                            text-gray-400
                          "
                        >
                          Company
                        </p>

                        <p
                          className="
                            mt-1
                            break-all
                            font-mono
                            text-gray-600
                          "
                        >
                          {
                            signal.company_id ||
                            '—'
                          }
                        </p>
                      </div>

                      <div>
                        <p
                          className="
                            text-gray-400
                          "
                        >
                          Window
                        </p>

                        <p
                          className="
                            mt-1
                            text-gray-600
                          "
                        >
                          {new Date(
                            signal.window_started_at,
                          ).toLocaleString()}
                          {' → '}
                          {new Date(
                            signal.window_ended_at,
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {signal.review_status ===
                      'open' && (
                      <div
                        className="
                          mt-4
                          flex
                          flex-wrap
                          gap-2
                        "
                      >
                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'reviewed',
                            )
                          }
                          className="
                            rounded-lg
                            border
                            border-gray-200
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-gray-700
                            hover:bg-gray-50
                            disabled:opacity-50
                          "
                        >
                          Mark reviewed
                        </button>

                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'dismissed',
                            )
                          }
                          className="
                            rounded-lg
                            border
                            border-gray-200
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-gray-700
                            hover:bg-gray-50
                            disabled:opacity-50
                          "
                        >
                          Dismiss
                        </button>

                        <button
                          type="button"
                          disabled={
                            fraudReviewMutation
                              .isPending
                          }
                          onClick={() =>
                            reviewFraudSignal(
                              signal,
                              'escalated',
                            )
                          }
                          className="
                            rounded-lg
                            bg-gray-900
                            px-3 py-2
                            text-xs
                            font-semibold
                            text-white
                            hover:bg-gray-800
                            disabled:opacity-50
                          "
                        >
                          Escalate
                        </button>
                      </div>
                    )}
                  </div>
                ))}

              {fraudSignalsQuery
                .data
                ?.truncated && (
                <p
                  className="
                    text-xs
                    text-gray-400
                  "
                >
                  Showing the first
                  bounded set of matching
                  signals. Narrow the
                  filters to review more.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2
          className="
            text-xl
            font-bold
            text-gray-900
          "
        >
          Support Console
        </h2>

        <p
          className="
            mt-1
            text-sm
            text-gray-500
          "
        >
          Search privacy-safe
          operational timelines.
          Raw PINs, OTPs, tokens,
          USSD logs and provider
          responses are not
          available here.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="
          mb-6
          rounded-xl
          bg-white
          p-5
          shadow-sm
        "
      >
        <div
          className="
            grid gap-3
            md:grid-cols-[220px_1fr_auto]
          "
        >
          <select
            value={searchType}
            onChange={event =>
              setSearchType(
                event.target.value,
              )
            }
            className="
              rounded-lg
              border
              border-gray-300
              bg-white
              px-3 py-2
              text-sm
            "
          >
            <option
              value="transaction_id"
            >
              Transaction ID
            </option>

            <option
              value="correlation_id"
            >
              Correlation ID
            </option>

            <option
              value="event_id"
            >
              Event ID
            </option>

            <option
              value="user_id"
            >
              User ID
            </option>

            <option
              value="company_id"
            >
              Company ID
            </option>

            <option value="email">
              Exact email
            </option>

            <option value="phone">
              Exact phone
            </option>
          </select>

          <input
            value={searchValue}
            onChange={event =>
              setSearchValue(
                event.target.value,
              )
            }
            autoComplete="off"
            placeholder="Enter exact ID, email or phone"
            className="
              rounded-lg
              border
              border-gray-300
              px-3 py-2
              text-sm
              focus:outline-none
              focus:ring-2
              focus:ring-primary
            "
          />

          <button
            type="submit"
            disabled={
              searchQuery.isFetching
            }
            className="
              rounded-lg
              bg-primary
              px-5 py-2
              text-sm
              font-semibold
              text-white
              hover:bg-primary-dark
              disabled:opacity-50
            "
          >
            {searchQuery.isFetching
              ? 'Searching...'
              : 'Search'}
          </button>
        </div>

        <p
          className="
            mt-3
            text-xs
            text-gray-500
          "
        >
          Searches are exact and
          access is audited. The
          search value itself is
          not written into the
          audit event.
        </p>
      </form>

      {searchQuery.isError && (
        <div
          className="
            mb-6
            rounded-xl
            border
            border-red-200
            bg-red-50
            p-4
          "
        >
          <p
            className="
              font-semibold
              text-red-800
            "
          >
            Search failed
          </p>

          <p
            className="
              mt-1
              text-sm
              text-red-700
            "
          >
            {
              searchQuery.error
                ?.response
                ?.data
                ?.message ||
              'The support timeline could not be loaded.'
            }
          </p>
        </div>
      )}

      {data && (
        <>
          <div
            className="
              mb-6
              grid gap-4
              md:grid-cols-3
            "
          >
            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Events
              </p>

              <p
                className="
                  mt-1
                  text-2xl
                  font-bold
                  text-gray-900
                "
              >
                {events.length}
              </p>
            </div>

            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Matched users
              </p>

              <p
                className="
                  mt-1
                  text-2xl
                  font-bold
                  text-gray-900
                "
              >
                {
                  data
                    .identities
                    ?.length || 0
                }
              </p>
            </div>

            <div
              className="
                rounded-xl
                bg-white
                p-4
                shadow-sm
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                Result
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  font-semibold
                  text-gray-900
                "
              >
                {data.truncated
                  ? 'Latest 200 events'
                  : 'Complete bounded result'}
              </p>
            </div>
          </div>

          {data.identities?.length >
            0 && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Matched users
              </h3>

              <div
                className="
                  mt-3
                  space-y-2
                "
              >
                {data.identities.map(
                  identity => (
                    <div
                      key={
                        identity.id
                      }
                      className="
                        rounded-lg
                        border
                        border-gray-100
                        p-3
                      "
                    >
                      <p
                        className="
                          text-sm
                          font-semibold
                          text-gray-900
                        "
                      >
                        {[
                          identity.first_name,
                          identity.last_name,
                        ]
                          .filter(Boolean)
                          .join(' ') ||
                          'Unnamed user'}
                      </p>

                      <p
                        className="
                          mt-1
                          break-all
                          font-mono
                          text-xs
                          text-gray-500
                        "
                      >
                        {identity.id}
                      </p>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-gray-500
                        "
                      >
                        Role:{' '}
                        {
                          identity.role ||
                          '—'
                        }
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {data.company && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Company
              </h3>

              <p
                className="
                  mt-2
                  font-semibold
                "
              >
                {
                  data.company.name ||
                  'Unnamed company'
                }
              </p>

              <p
                className="
                  mt-1
                  break-all
                  font-mono
                  text-xs
                  text-gray-500
                "
              >
                {data.company.id}
              </p>
            </div>
          )}

          {caseSummary && (
            <div
              className="
                mb-6
                rounded-xl
                bg-white
                p-5
                shadow-sm
              "
            >
              <div
                className="
                  flex
                  flex-wrap
                  items-start
                  justify-between
                  gap-3
                "
              >
                <div>
                  <h3
                    className="
                      font-bold
                      text-gray-900
                    "
                  >
                    Case Summary
                  </h3>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-500
                    "
                  >
                    Derived from the
                    privacy-safe operational
                    timeline.
                  </p>
                </div>

                <span
                  className="
                    rounded-full
                    bg-gray-100
                    px-3 py-1
                    text-xs
                    font-semibold
                    text-gray-700
                  "
                >
                  {outcomeLabel(
                    caseSummary.outcome,
                  )}
                </span>
              </div>

              <div
                className="
                  mt-5
                  grid gap-4
                  sm:grid-cols-2
                  lg:grid-cols-4
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Provider
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.provider ||
                      '—'
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Transaction type
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.transaction_type ||
                      '—'
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Failed events
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary.failed_count
                    }
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Pending confirmation
                  </p>

                  <p
                    className="
                      mt-1
                      font-semibold
                      text-gray-900
                    "
                  >
                    {
                      caseSummary
                        .pending_confirmation_count
                    }
                  </p>
                </div>
              </div>

              <div
                className="
                  mt-5
                  grid gap-4
                  md:grid-cols-2
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      text-gray-400
                    "
                  >
                    First event
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-700
                    "
                  >
                    {caseSummary.first_event_at
                      ? new Date(
                          caseSummary.first_event_at,
                        ).toLocaleString()
                      : '—'}
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      text-gray-400
                    "
                  >
                    Last event
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-gray-700
                    "
                  >
                    {caseSummary.last_event_at
                      ? new Date(
                          caseSummary.last_event_at,
                        ).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              {caseSummary
                .transaction_ids
                ?.length > 0 && (
                <div className="mt-5">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Transaction IDs
                  </p>

                  <div
                    className="
                      mt-2
                      space-y-2
                    "
                  >
                    {caseSummary
                      .transaction_ids
                      .map(id => (
                        <div
                          key={id}
                          className="
                            flex
                            items-center
                            justify-between
                            gap-3
                            rounded-lg
                            bg-gray-50
                            px-3 py-2
                          "
                        >
                          <span
                            className="
                              min-w-0
                              break-all
                              font-mono
                              text-xs
                              text-gray-600
                            "
                          >
                            {id}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              copySupportId(
                                'Transaction ID',
                                id,
                              )
                            }
                            className="
                              shrink-0
                              text-xs
                              font-semibold
                              text-primary
                              hover:underline
                            "
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {caseSummary
                .correlation_ids
                ?.length > 0 && (
                <div className="mt-5">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Correlation IDs
                  </p>

                  <div
                    className="
                      mt-2
                      space-y-2
                    "
                  >
                    {caseSummary
                      .correlation_ids
                      .map(id => (
                        <div
                          key={id}
                          className="
                            flex
                            items-center
                            justify-between
                            gap-3
                            rounded-lg
                            bg-gray-50
                            px-3 py-2
                          "
                        >
                          <span
                            className="
                              min-w-0
                              break-all
                              font-mono
                              text-xs
                              text-gray-600
                            "
                          >
                            {id}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              copySupportId(
                                'Correlation ID',
                                id,
                              )
                            }
                            className="
                              shrink-0
                              text-xs
                              font-semibold
                              text-primary
                              hover:underline
                            "
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div
                className="
                  mt-5
                  grid gap-3
                  md:grid-cols-2
                "
              >
                <div>
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Related user IDs
                  </p>

                  <p
                    className="
                      mt-2
                      break-all
                      font-mono
                      text-xs
                      text-gray-600
                    "
                  >
                    {caseSummary
                      .user_ids
                      ?.join(', ') ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                    "
                  >
                    Related company IDs
                  </p>

                  <p
                    className="
                      mt-2
                      break-all
                      font-mono
                      text-xs
                      text-gray-600
                    "
                  >
                    {caseSummary
                      .company_ids
                      ?.join(', ') ||
                      '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className="
              rounded-xl
              bg-white
              p-5
              shadow-sm
            "
          >
            <div
              className="
                mb-4
                flex
                items-center
                justify-between
                gap-3
              "
            >
              <h3
                className="
                  font-bold
                  text-gray-900
                "
              >
                Operational Timeline
              </h3>

              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  gap-2
                "
              >
                <select
                  value={timelineFilter}
                  onChange={event =>
                    setTimelineFilter(
                      event.target.value,
                    )
                  }
                  className="
                    rounded-lg
                    border
                    border-gray-200
                    bg-white
                    px-2 py-1
                    text-xs
                    text-gray-700
                  "
                >
                  <option value="all">
                    All events
                  </option>

                  <option value="failed">
                    Failed
                  </option>

                  <option
                    value="pending_confirmation"
                  >
                    Pending confirmation
                  </option>
                </select>

                <span
                  className="
                    text-xs
                    text-gray-400
                  "
                >
                  Oldest → newest
                </span>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div
                className="
                  py-10
                  text-center
                  text-sm
                  text-gray-400
                "
              >
                No operational
                events matched this
                exact search.
              </div>
            ) : (
              <div
                className="
                  space-y-3
                "
              >
                {filteredEvents.map(
                  event => (
                    <div
                      key={event.id}
                      className="
                        rounded-lg
                        border
                        border-gray-100
                        p-4
                      "
                    >
                      <div
                        className="
                          flex
                          flex-wrap
                          items-start
                          justify-between
                          gap-2
                        "
                      >
                        <div>
                          <p
                            className="
                              text-sm
                              font-semibold
                              text-gray-900
                            "
                          >
                            {
                              event.event_name
                            }
                          </p>

                          <p
                            className="
                              mt-1
                              text-xs
                              text-gray-500
                            "
                          >
                            {
                              event.subject_type
                            }
                            {' · '}
                            {
                              event.source
                            }
                          </p>
                        </div>

                        <time
                          className="
                            text-xs
                            text-gray-400
                          "
                        >
                          {new Date(
                            event.occurred_at,
                          ).toLocaleString()}
                        </time>
                      </div>

                      <div
                        className="
                          mt-3
                          grid gap-2
                          text-xs
                          md:grid-cols-2
                        "
                      >
                        <div>
                          <span
                            className="
                              text-gray-400
                            "
                          >
                            Subject
                          </span>

                          <p
                            className="
                              break-all
                              font-mono
                              text-gray-600
                            "
                          >
                            {
                              event.subject_id
                            }
                          </p>
                        </div>

                        <div>
                          <span
                            className="
                              text-gray-400
                            "
                          >
                            Correlation
                          </span>

                          <p
                            className="
                              break-all
                              font-mono
                              text-gray-600
                            "
                          >
                            {
                              event.correlation_id
                            }
                          </p>
                        </div>
                      </div>

                      {event.attributes &&
                        Object.keys(
                          event.attributes,
                        ).length >
                          0 && (
                        <pre
                          className="
                            mt-3
                            overflow-x-auto
                            rounded-lg
                            bg-gray-50
                            p-3
                            text-xs
                            text-gray-600
                          "
                        >
                          {JSON.stringify(
                            event.attributes,
                            null,
                            2,
                          )}
                        </pre>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}
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
  const [ads, setAds] =
    useState([]);

  const [
    reviewDrafts,
    setReviewDrafts,
  ] = useState({});

  const [
    updatingId,
    setUpdatingId,
  ] = useState(null);

  const [
    imageViewer,
    setImageViewer,
  ] = useState(null);

  const load = async () => {
    const response =
      await API.get(
        '/admin/ads/pending',
      );

    const rank = ad => {
      if (
        ad.status ===
          'pending_payment' &&
        ad.momo_reference
      ) {
        return 0;
      }

      if (
        ad.status ===
        'pending_review'
      ) {
        return 1;
      }

      return 2;
    };

    const sorted = [
      ...(response.data.data || []),
    ].sort((left, right) => {
      const rankDifference =
        rank(left) - rank(right);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return (
        new Date(
          left.created_at,
        ).getTime() -
        new Date(
          right.created_at,
        ).getTime()
      );
    });

    setAds(sorted);
  };

  useEffect(() => {
    load();
  }, []);

  const normalizedMoney = value => {
    const parsed = Number(value);

    return (
      Number.isFinite(parsed) &&
      parsed >= 0
    )
      ? parsed
      : 0;
  };

  const initialDraft = ad => ({
    assessedValue:
      normalizedMoney(
        ad.admin_assessed_value ??
          ad.price,
      ).toFixed(2),

    amountDue:
      normalizedMoney(
        ad.amount_due ??
          ad.publishing_fee,
      ).toFixed(2),

    reason:
      ad.pricing_adjustment_reason ||
      '',
  });

  const draftFor = ad =>
    reviewDrafts[ad.id] ||
    initialDraft(ad);

  const updateDraft = (
    ad,
    changes,
  ) => {
    setReviewDrafts(previous => ({
      ...previous,
      [ad.id]: {
        ...(
          previous[ad.id] ||
          initialDraft(ad)
        ),
        ...changes,
      },
    }));
  };

  const updateAssessedValue = (
    ad,
    value,
  ) => {
    const parsed =
      Number(value);

    const feePercent =
      Number(
        ad.fee_percent ??
        0.01,
      );

    const changes = {
      assessedValue: value,
    };

    if (
      value.trim() !== '' &&
      Number.isFinite(parsed) &&
      parsed >= 0 &&
      Number.isFinite(
        feePercent,
      ) &&
      feePercent >= 0
    ) {
      changes.amountDue =
        (
          Math.round(
            parsed *
            feePercent *
            100,
          ) / 100
        ).toFixed(2);
    }

    updateDraft(
      ad,
      changes,
    );
  };

  const moderate = async (
    ad,
    action,
    extra = {},
  ) => {
    setUpdatingId(ad.id);

    try {
      await API.patch(
        `/admin/ads/${ad.id}/moderate`,
        {
          action,
          ...extra,
        },
      );

      toast.success(
        action === 'publish'
          ? 'Payment verified and listing published ✅'
          : action === 'approve_review'
            ? 'Approved — payment request sent'
            : 'Listing rejected',
      );

      setReviewDrafts(
        previous => {
          const next = {
            ...previous,
          };

          delete next[ad.id];

          return next;
        },
      );

      await load();
    } catch (error) {
      toast.error(
        error.response?.data
          ?.message ||
          'Action failed',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const approveForPayment =
    async ad => {
      const draft =
        draftFor(ad);

      const assessedValue =
        Number(
          draft.assessedValue,
        );

      const amountDue =
        Number(
          draft.amountDue,
        );

      if (
        !Number.isFinite(
          assessedValue,
        ) ||
        assessedValue < 0 ||
        !Number.isFinite(
          amountDue,
        ) ||
        amountDue < 0
      ) {
        toast.error(
          'Enter valid assessed value and amount due.',
        );

        return;
      }

      const declared =
        normalizedMoney(
          ad.price,
        );

      const originalFee =
        normalizedMoney(
          ad.publishing_fee,
        );

      const pricingChanged =
        Math.round(
          assessedValue * 100,
        ) !==
          Math.round(
            declared * 100,
          ) ||
        Math.round(
          amountDue * 100,
        ) !==
          Math.round(
            originalFee * 100,
          );

      const reason =
        draft.reason.trim();

      if (
        pricingChanged &&
        !reason
      ) {
        toast.error(
          'Add a reason when the assessed value or amount due differs from the submitted pricing.',
        );

        return;
      }

      await moderate(
        ad,
        'approve_review',
        {
          admin_assessed_value:
            assessedValue.toFixed(
              2,
            ),
          amount_due:
            amountDue.toFixed(2),
          pricing_adjustment_reason:
            reason || null,
        },
      );
    };

  const pendingReviewCount =
    ads.filter(
      ad =>
        ad.status ===
        'pending_review',
    ).length;

  const awaitingUserPaymentCount =
    ads.filter(
      ad =>
        ad.status ===
          'pending_payment' &&
        !ad.momo_reference,
    ).length;

  const paymentSubmittedCount =
    ads.filter(
      ad =>
        ad.status ===
          'pending_payment' &&
        Boolean(
          ad.momo_reference,
        ),
    ).length;

  return (
    <div>
      <h2
        className="
          text-xl
          font-bold
          text-gray-900
          mb-2
        "
      >
        Business Hub Moderation
        {' '}
        ({ads.length})
      </h2>

      {paymentSubmittedCount >
        0 && (
        <div
          className="
            bg-green-50
            border
            border-green-200
            rounded-lg
            px-4 py-3
            mb-4
            text-sm
            text-green-800
          "
        >
          <strong>
            {
              paymentSubmittedCount
            }
          </strong>
          {' '}
          payment
          {paymentSubmittedCount ===
          1
            ? ''
            : 's'}
          {' '}
          submitted and ready
          for verification.
        </div>
      )}

      <p
        className="
          text-sm
          text-gray-500
          mb-6
        "
      >
        {pendingReviewCount}
        {' '}
        awaiting review ·
        {' '}
        {
          awaitingUserPaymentCount
        }
        {' '}
        waiting for user payment ·
        {' '}
        {paymentSubmittedCount}
        {' '}
        awaiting payment
        verification
      </p>

      {ads.length === 0 ? (
        <div
          className="
            text-center
            py-16
            text-gray-400
          "
        >
          <p className="text-4xl mb-4">
            ✅
          </p>
          <p>
            No pending Business Hub
            listings
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {ads.map(ad => {
            const draft =
              draftFor(ad);

            const hasPayment =
              Boolean(
                ad.momo_reference,
              );

            const images =
              Array.isArray(
                ad.image_urls,
              )
                ? ad.image_urls.filter(
                    image =>
                      typeof image ===
                        'string' &&
                      image.trim(),
                  )
                : [];

            return (
              <div
                key={ad.id}
                className="
                  bg-white
                  rounded-xl
                  shadow-sm
                  p-6
                "
              >
                <div
                  className="
                    flex
                    flex-wrap
                    justify-between
                    gap-3
                  "
                >
                  <div>
                    <h3 className="font-bold">
                      {ad.title}
                    </h3>

                    <p className="text-sm text-gray-500">
                      {
                        ad.posted_by_email
                      }
                    </p>

                    <span
                      className="
                        text-xs
                        bg-yellow-100
                        text-yellow-700
                        px-2
                        py-0.5
                        rounded-full
                      "
                    >
                      {ad.status}
                    </span>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      Declared price
                    </p>

                    <p className="font-bold text-green-600">
                      GH₵
                      {' '}
                      {
                        normalizedMoney(
                          ad.price,
                        ).toFixed(2)
                      }
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Original system fee:
                      {' '}
                      GH₵
                      {' '}
                      {
                        normalizedMoney(
                          ad.publishing_fee,
                        ).toFixed(2)
                      }
                    </p>
                  </div>
                </div>

                <p
                  className="
                    text-sm
                    text-gray-600
                    mt-3
                    line-clamp-2
                  "
                >
                  {ad.description}
                </p>

                <section
                  className="
                    mt-5
                    rounded-xl
                    border
                    border-gray-200
                    bg-gray-50
                    p-4
                  "
                >
                  <div
                    className="
                      flex
                      flex-wrap
                      items-center
                      justify-between
                      gap-2
                    "
                  >
                    <div>
                      <h4
                        className="
                          font-semibold
                          text-gray-900
                        "
                      >
                        Listing photos
                        {' '}
                        ({images.length})
                      </h4>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-gray-500
                        "
                      >
                        Review every image
                        before approving the
                        listing. Photo 1 is
                        the cover image shown
                        first to buyers.
                      </p>
                    </div>
                  </div>

                  {images.length === 0 ? (
                    <div
                      className="
                        mt-4
                        rounded-lg
                        border
                        border-amber-200
                        bg-amber-50
                        p-3
                        text-sm
                        text-amber-800
                      "
                    >
                      No listing photos are
                      attached. This may be a
                      legacy listing created
                      before photos became
                      mandatory.
                    </div>
                  ) : (
                    <div
                      className="
                        mt-4
                        grid
                        grid-cols-2
                        gap-3
                        sm:grid-cols-3
                        lg:grid-cols-4
                      "
                    >
                      {images.map(
                        (
                          image,
                          imageIndex,
                        ) => (
                          <button
                            key={
                              `${ad.id}-${imageIndex}`
                            }
                            type="button"
                            onClick={() =>
                              setImageViewer({
                                images,
                                index:
                                  imageIndex,
                                title:
                                  ad.title,
                              })
                            }
                            className="
                              overflow-hidden
                              rounded-xl
                              border
                              border-gray-200
                              bg-white
                              text-left
                              shadow-sm
                              transition
                              hover:border-primary
                              hover:shadow-md
                              focus:outline-none
                              focus:ring-2
                              focus:ring-primary
                            "
                          >
                            <div
                              className="
                                relative
                                aspect-[4/3]
                                overflow-hidden
                                bg-gray-100
                              "
                            >
                              <img
                                src={image}
                                alt={
                                  `${ad.title} photo ${imageIndex + 1}`
                                }
                                loading="lazy"
                                className="
                                  h-full
                                  w-full
                                  object-cover
                                "
                              />

                              {imageIndex ===
                                0 && (
                                <span
                                  className="
                                    absolute
                                    left-2
                                    top-2
                                    rounded-full
                                    bg-primary
                                    px-2
                                    py-1
                                    text-[10px]
                                    font-semibold
                                    text-white
                                    shadow
                                  "
                                >
                                  Cover
                                </span>
                              )}
                            </div>

                            <div
                              className="
                                px-3
                                py-2
                              "
                            >
                              <p
                                className="
                                  text-xs
                                  font-semibold
                                  text-gray-800
                                "
                              >
                                {imageIndex ===
                                0
                                  ? 'Cover image'
                                  : `Photo ${imageIndex + 1}`}
                              </p>

                              <p
                                className="
                                  mt-0.5
                                  text-[11px]
                                  text-gray-500
                                "
                              >
                                Click to inspect
                              </p>
                            </div>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </section>

                {ad.status ===
                  'pending_review' && (
                  <div
                    className="
                      mt-5
                      rounded-xl
                      border
                      border-blue-100
                      bg-blue-50/50
                      p-4
                    "
                  >
                    <h4
                      className="
                        font-semibold
                        text-gray-900
                      "
                    >
                      Pricing review
                    </h4>

                    <p
                      className="
                        mt-1
                        text-xs
                        text-gray-600
                      "
                    >
                      Verify the listing
                      value before requesting
                      payment. Changing the
                      assessed value
                      automatically suggests
                      a fee using the stored
                      posting rate; the final
                      amount due remains
                      editable.
                    </p>

                    <div
                      className="
                        mt-4
                        grid
                        gap-3
                        md:grid-cols-2
                      "
                    >
                      <label
                        className="
                          text-sm
                          text-gray-700
                        "
                      >
                        Admin assessed value
                        (GH₵)

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            draft.assessedValue
                          }
                          onChange={event =>
                            updateAssessedValue(
                              ad,
                              event.target
                                .value,
                            )
                          }
                          className="
                            mt-1
                            w-full
                            rounded-lg
                            border
                            border-gray-200
                            px-3
                            py-2
                          "
                        />
                      </label>

                      <label
                        className="
                          text-sm
                          text-gray-700
                        "
                      >
                        Final amount to pay
                        (GH₵)

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            draft.amountDue
                          }
                          onChange={event =>
                            updateDraft(
                              ad,
                              {
                                amountDue:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className="
                            mt-1
                            w-full
                            rounded-lg
                            border
                            border-gray-200
                            px-3
                            py-2
                          "
                        />
                      </label>
                    </div>

                    <label
                      className="
                        mt-3
                        block
                        text-sm
                        text-gray-700
                      "
                    >
                      Adjustment reason

                      <textarea
                        rows="2"
                        maxLength="2000"
                        value={
                          draft.reason
                        }
                        onChange={event =>
                          updateDraft(
                            ad,
                            {
                              reason:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="Required when assessed value or final amount differs from the submitted pricing."
                        className="
                          mt-1
                          w-full
                          rounded-lg
                          border
                          border-gray-200
                          px-3
                          py-2
                        "
                      />
                    </label>
                  </div>
                )}

                {ad.status ===
                  'pending_payment' && (
                  <div
                    className="
                      mt-4
                      rounded-lg
                      border
                      border-amber-200
                      bg-amber-50
                      p-3
                      text-sm
                    "
                  >
                    <div>
                      <span className="text-gray-600">
                        Approved amount:
                      </span>
                      {' '}
                      <strong>
                        GH₵
                        {' '}
                        {
                          normalizedMoney(
                            ad.amount_due,
                          ).toFixed(2)
                        }
                      </strong>
                    </div>

                    {ad.admin_assessed_value !==
                      null &&
                      ad.admin_assessed_value !==
                        undefined && (
                      <div className="mt-1">
                        <span className="text-gray-600">
                          Assessed value:
                        </span>
                        {' '}
                        GH₵
                        {' '}
                        {
                          normalizedMoney(
                            ad.admin_assessed_value,
                          ).toFixed(2)
                        }
                      </div>
                    )}

                    {ad.pricing_adjustment_reason && (
                      <div className="mt-1">
                        <span className="text-gray-600">
                          Review note:
                        </span>
                        {' '}
                        {
                          ad.pricing_adjustment_reason
                        }
                      </div>
                    )}
                  </div>
                )}

                {hasPayment && (
                  <div
                    className="
                      mt-3
                      bg-blue-50
                      p-3
                      rounded-lg
                      text-sm
                    "
                  >
                    <div>
                      <span className="text-gray-500">
                        Transaction ID:
                      </span>
                      {' '}
                      <span className="font-mono font-semibold">
                        {
                          ad.momo_reference
                        }
                      </span>
                    </div>

                    <div className="mt-1">
                      <span className="text-gray-500">
                        Submitted amount:
                      </span>
                      {' '}
                      GH₵
                      {' '}
                      {
                        normalizedMoney(
                          ad.payment_amount,
                        ).toFixed(2)
                      }
                    </div>

                    {ad.payment_submitted_at && (
                      <div className="mt-1 text-xs text-gray-500">
                        Submitted:
                        {' '}
                        {
                          new Date(
                            ad.payment_submitted_at,
                          ).toLocaleString()
                        }
                      </div>
                    )}
                  </div>
                )}

                {ad.status ===
                  'pending_payment' &&
                  !hasPayment && (
                  <div
                    className="
                      mt-3
                      rounded-lg
                      border
                      border-amber-200
                      bg-amber-50
                      p-3
                      text-sm
                      text-amber-800
                    "
                  >
                    Waiting for user payment.
                    AgentPro has issued the
                    approved amount and payment
                    request.
                  </div>
                )}

                <div
                  className="
                    flex
                    flex-wrap
                    gap-2
                    mt-4
                  "
                >
                  {ad.status ===
                    'pending_review' && (
                    <>
                      <button
                        type="button"
                        disabled={
                          updatingId ===
                          ad.id
                        }
                        onClick={() =>
                          approveForPayment(
                            ad,
                          )
                        }
                        className="
                          flex-1
                          bg-blue-600
                          text-white
                          py-2
                          rounded-lg
                          text-sm
                          font-semibold
                          hover:bg-blue-700
                          disabled:opacity-50
                        "
                      >
                        Approve & Request
                        Payment
                      </button>

                      <button
                        type="button"
                        disabled={
                          updatingId ===
                          ad.id
                        }
                        onClick={() =>
                          moderate(
                            ad,
                            'reject',
                            {
                              rejection_reason:
                                'Rejected by administrator',
                            },
                          )
                        }
                        className="
                          flex-1
                          bg-red-50
                          text-red-600
                          py-2
                          rounded-lg
                          text-sm
                          border
                          border-red-200
                          hover:bg-red-100
                          disabled:opacity-50
                        "
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {ad.status ===
                    'pending_payment' &&
                    hasPayment && (
                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        ad.id
                      }
                      onClick={() =>
                        moderate(
                          ad,
                          'publish',
                        )
                      }
                      className="
                        flex-1
                        bg-green-600
                        text-white
                        py-2
                        rounded-lg
                        text-sm
                        font-semibold
                        hover:bg-green-700
                        disabled:opacity-50
                      "
                    >
                      ✅ Verify Payment
                      & Publish
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {imageViewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Listing photo viewer"
          onClick={() =>
            setImageViewer(null)
          }
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-black/80
            p-4
          "
        >
          <div
            onClick={event =>
              event.stopPropagation()
            }
            className="
              flex
              max-h-[94vh]
              w-full
              max-w-5xl
              flex-col
              overflow-hidden
              rounded-2xl
              bg-white
              shadow-2xl
            "
          >
            <div
              className="
                flex
                flex-wrap
                items-center
                justify-between
                gap-3
                border-b
                border-gray-200
                px-4
                py-3
              "
            >
              <div>
                <p
                  className="
                    font-semibold
                    text-gray-900
                  "
                >
                  {imageViewer.title}
                </p>

                <p
                  className="
                    text-xs
                    text-gray-500
                  "
                >
                  Photo
                  {' '}
                  {imageViewer.index + 1}
                  {' '}
                  of
                  {' '}
                  {imageViewer.images.length}
                  {imageViewer.index ===
                    0
                    ? ' · Cover image'
                    : ''}
                </p>
              </div>

              <div
                className="
                  flex
                  items-center
                  gap-2
                "
              >
                <a
                  href={
                    imageViewer.images[
                      imageViewer.index
                    ]
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="
                    rounded-lg
                    border
                    border-gray-200
                    px-3
                    py-2
                    text-xs
                    font-semibold
                    text-gray-700
                    hover:bg-gray-50
                  "
                >
                  Open original
                </a>

                <button
                  type="button"
                  onClick={() =>
                    setImageViewer(null)
                  }
                  className="
                    rounded-lg
                    bg-gray-100
                    px-3
                    py-2
                    text-xs
                    font-semibold
                    text-gray-700
                    hover:bg-gray-200
                  "
                >
                  Close
                </button>
              </div>
            </div>

            <div
              className="
                flex
                min-h-0
                flex-1
                items-center
                justify-center
                bg-gray-950
                p-3
              "
            >
              <img
                src={
                  imageViewer.images[
                    imageViewer.index
                  ]
                }
                alt={
                  `${imageViewer.title} full-size listing photo ${imageViewer.index + 1}`
                }
                className="
                  max-h-[72vh]
                  max-w-full
                  object-contain
                "
              />
            </div>

            <div
              className="
                flex
                items-center
                justify-between
                gap-3
                border-t
                border-gray-200
                px-4
                py-3
              "
            >
              <button
                type="button"
                disabled={
                  imageViewer.index ===
                  0
                }
                onClick={() =>
                  setImageViewer(
                    current => ({
                      ...current,
                      index:
                        current.index -
                        1,
                    }),
                  )
                }
                className="
                  rounded-lg
                  border
                  border-gray-200
                  px-4
                  py-2
                  text-sm
                  font-semibold
                  text-gray-700
                  hover:bg-gray-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Previous
              </button>

              <span
                className="
                  text-xs
                  text-gray-500
                "
              >
                Review all photos before
                approving the listing.
              </span>

              <button
                type="button"
                disabled={
                  imageViewer.index ===
                  imageViewer.images
                    .length -
                    1
                }
                onClick={() =>
                  setImageViewer(
                    current => ({
                      ...current,
                      index:
                        current.index +
                        1,
                    }),
                  )
                }
                className="
                  rounded-lg
                  border
                  border-gray-200
                  px-4
                  py-2
                  text-sm
                  font-semibold
                  text-gray-700
                  hover:bg-gray-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import {
  CompaniesPage,
  PersonalUsersPage,
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
                    path="/personal-users"
                    element={<PersonalUsersPage />}
                  />
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
                  <Route path="/support" element={<SupportConsolePage />} />
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
