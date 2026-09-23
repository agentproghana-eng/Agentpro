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
import {
  SupportConsolePage,
} from './features/support/SupportConsolePage.jsx';
import {
  ConfigPage,
} from './features/config/ConfigPage.jsx';
import {
  MarketplacePage,
} from './features/marketplace/MarketplaceModerationPage.jsx';
import AdminTeamPage from './features/admin/AdminTeamPage.jsx';
import {
  OperationalHealthWidget,
  PendingRegistrationsWidget,
  UssdFlowHealthAlerts,
  UssdFlowHealthToastWatcher,
} from './features/dashboard/DashboardOperationalWidgets.jsx';
import {
  RegistrationsPage,
} from './features/registrations/RegistrationsPage.jsx';
import {
  SubscriptionsPage,
} from './features/subscriptions/SubscriptionsPage.jsx';
import {
  adminRoleLabel,
  canAccessAdminPath,
  isAdminPortalUser,
} from './lib/adminAccess.js';
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

    if (
      storedUser &&
      hasCredential &&
      isAdminPortalUser(
        storedUser,
      )
    ) {
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
        admin_portal: true,
      },
      {
        headers: {
          'X-AgentPro-Admin-Portal':
            '1',
        },
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
      !isAdminPortalUser(
        data.data.user,
      )
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
        'Access denied. Administrator role required.',
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
      !isAdminPortalUser(
        data.data.user,
      )
    ) {
      clearAuthSession();

      throw new Error(
        'Access denied. Administrator role required.',
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

  return user &&
    isAdminPortalUser(user)
    ? children
    : <Navigate to="/login" replace />;
}

function AdminPageGuard({
  path,
  children,
}) {
  const { user } = useAuth();

  return canAccessAdminPath(
    user,
    path,
  )
    ? children
    : <Navigate to="/" replace />;
}

// ── Password Recovery ─────────────────────────────────────────

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);

    try {
      await API.post(
        '/auth/forgot-password',
        { email },
      );

      setSubmitted(true);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
        err.message ||
        'Password recovery could not be started.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">
              AP
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Reset administrator password
          </h1>

          <p className="text-gray-500 text-sm mt-2">
            Enter the email address on your AgentPro administrator account.
          </p>
        </div>

        {submitted ? (
          <div>
            <div
              className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
              role="status"
            >
              If that email is registered, AgentPro has sent a secure
              password-reset link. Check your inbox and spam folder.
            </div>

            <p className="mt-4 text-xs text-gray-500">
              The reset link expires after one hour. After choosing a new
              password, return to the Administrator Portal to sign in.
            </p>

            <Link
              to="/login"
              className="mt-6 block w-full rounded-lg bg-primary py-2.5 text-center font-semibold text-white transition hover:bg-primary-dark"
            >
              Return to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-recovery-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>

              <input
                id="admin-recovery-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@example.com"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-60 transition"
            >
              {loading
                ? 'Sending reset link...'
                : 'Send reset link'}
            </button>

            <Link
              to="/login"
              className="block text-center text-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
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
        Administrator Portal
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

            <div className="mt-2 text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
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
  { path: '/admin-team', icon: '🛡️', label: 'Admin Team' },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-100">
      {canAccessAdminPath(
        user,
        '/flows',
      ) && (
        <UssdFlowHealthToastWatcher />
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-white shadow-md flex flex-col transition-all duration-200`}>
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">AP</span>
          </div>
          {sidebarOpen && <span className="font-bold text-gray-900 text-sm">Admin Portal</span>}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV
            .filter(({ path }) =>
              canAccessAdminPath(
                user,
                path,
              ),
            )
            .map(({ path, icon, label }) => (
            <Link key={path} to={path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-primary transition text-sm">
              <span className="text-lg">{icon}</span>
              {sidebarOpen && <span>{label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          {sidebarOpen && (
            <>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
              <p className="text-[11px] text-gray-400 mb-2">
                {adminRoleLabel(user)}
              </p>
            </>
          )}
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
  const { user } = useAuth();

  const canViewOperations =
    canAccessAdminPath(
      user,
      '/flows',
    );

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

          const accessiblePath =
            card.path &&
            canAccessAdminPath(
              user,
              card.path,
            )
              ? card.path
              : null;

          if (!accessiblePath) {
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
              onClick={() => navigate(accessiblePath)}
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

      {canViewOperations && (
        <>
          <UssdFlowHealthAlerts />
          <OperationalHealthWidget />
          <PendingRegistrationsWidget />
        </>
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

function MarketplaceBusinessesRoutePage() {
  const { user } = useAuth();

  return (
    <MarketplaceBusinessesPage
      allowAccountActions={
        user?.role === 'superuser'
      }
    />
  );
}

// ── Root App ──────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route
            path="/forgot-password"
            element={<ForgotPasswordPage />}
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <Protected>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route
                    path="/registrations"
                    element={
                      <AdminPageGuard path="/registrations">
                        <RegistrationsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/subscriptions"
                    element={
                      <AdminPageGuard path="/subscriptions">
                        <SubscriptionsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/marketplace"
                    element={
                      <AdminPageGuard path="/marketplace">
                        <MarketplacePage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/config"
                    element={
                      <AdminPageGuard path="/config">
                        <ConfigPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/companies"
                    element={
                      <AdminPageGuard path="/companies">
                        <CompaniesPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/personal-users"
                    element={
                      <AdminPageGuard path="/personal-users">
                        <PersonalUsersPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/marketplace-businesses"
                    element={
                      <AdminPageGuard path="/marketplace-businesses">
                        <MarketplaceBusinessesRoutePage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/community"
                    element={
                      <AdminPageGuard path="/community">
                        <CommunityModerationPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/companies/:companyId"
                    element={
                      <AdminPageGuard path="/companies">
                        <CompanyDetailPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/shifts"
                    element={
                      <AdminPageGuard path="/shifts">
                        <ShiftsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/commissions"
                    element={
                      <AdminPageGuard path="/commissions">
                        <CommissionsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/ussd"
                    element={
                      <AdminPageGuard path="/ussd">
                        <USSDTemplatesPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/flows"
                    element={
                      <AdminPageGuard path="/flows">
                        <FlowsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/support"
                    element={
                      <AdminPageGuard path="/support">
                        <SupportConsolePage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/audit"
                    element={
                      <AdminPageGuard path="/audit">
                        <AuditLogsPage />
                      </AdminPageGuard>
                    }
                  />
                  <Route
                    path="/admin-team"
                    element={
                      <AdminPageGuard path="/admin-team">
                        <AdminTeamPage />
                      </AdminPageGuard>
                    }
                  />
                </Routes>
              </Layout>
            </Protected>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
