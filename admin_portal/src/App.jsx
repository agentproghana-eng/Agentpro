import { useState, useEffect, createContext, useContext } from 'react';
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
  { path: '/marketplace', icon: '🛒', label: 'Business Hub' },
  { path: '/commissions', icon: '💰', label: 'Commissions' },
  { path: '/ussd', icon: '📱', label: 'USSD Templates' },
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
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/admin/overview').then(r => { setOverview(r.data.data); setLoading(false); });
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">Loading dashboard...</div>;

  const cards = [
    { label: 'Total Companies', value: overview?.companies?.total ?? '—', sub: `${overview?.companies?.active ?? 0} active`, color: 'blue' },
    { label: 'Total Users', value: overview?.users?.total ?? '—', sub: 'Platform-wide', color: 'green' },
    { label: 'Transactions Today', value: overview?.transactions_today ?? '—', sub: 'All companies', color: 'purple' },
    { label: 'Active Subscriptions', value: overview?.active_subscriptions ?? '—', sub: 'Business Plan', color: 'yellow' },
    { label: 'Pending Ads', value: overview?.pending_ads ?? '—', sub: 'Awaiting moderation', color: 'red' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Platform Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-1">{card.label}</p>
            <p className="text-xs text-gray-400">{card.sub}</p>
          </div>
        ))}
      </div>
      <PendingRegistrationsWidget />
    </div>
  );
}

// ── Pending Registrations Widget ──────────────────────────────

function PendingRegistrationsWidget() {
  const [regs, setRegs] = useState([]);
  useEffect(() => {
    API.get('/admin/pending-registrations').then(r => setRegs(r.data.data || []));
  }, []);

  if (!regs.length) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="font-bold text-gray-900 mb-4">🔔 Pending Registrations ({regs.length})</h3>
      <div className="space-y-3">
        {regs.map(r => (
          <div key={r.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{r.name}</p>
              <p className="text-xs text-gray-500">{r.email} · {r.phone}</p>
            </div>
            <Link to="/registrations" className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark">
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
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    API.get('/admin/pending-registrations')
      .then(r => { setRegs(r.data.data || []); setLoading(false); });
  };
  useEffect(load, []);

  const approve = async (companyId) => {
    // Approval happens via subscription payment verification
    toast.success('To activate this account, verify their subscription payment in Subscriptions.');
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Pending Registrations</h2>
      {loading ? <p>Loading...</p> : regs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">✅</p>
          <p>No pending registrations</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {regs.map(r => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900">{r.name}</h3>
                  <p className="text-sm text-gray-500">{r.registration_number}</p>
                </div>
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">Pending</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                <div><span className="text-gray-500">Owner:</span> {r.first_name} {r.last_name}</div>
                <div><span className="text-gray-500">Email:</span> {r.email}</div>
                <div><span className="text-gray-500">Phone:</span> {r.phone}</div>
                <div><span className="text-gray-500">Ghana Card:</span> {r.ghana_card_number || '—'}</div>
                <div><span className="text-gray-500">Applied:</span> {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <p className="text-xs text-gray-400 mt-4 bg-blue-50 p-3 rounded-lg">
                💡 To activate this account, ask the business owner to submit payment, then verify it under Subscriptions.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subscriptions Page ────────────────────────────────────────

function SubscriptionsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    API.get('/subscriptions/pending-payments')
      .then(r => { setPayments(r.data.data || []); setLoading(false); });
  };
  useEffect(load, []);

  const verify = async (paymentId, action, reason = '') => {
    try {
      await API.patch(`/subscriptions/payment/${paymentId}/verify`, { action, rejection_reason: reason });
      toast.success(action === 'approve' ? 'Subscription activated! ✅' : 'Payment rejected');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Pending Subscription Payments</h2>
      {loading ? <p>Loading...</p> : payments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">✅</p>
          <p>No pending payments</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {payments.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{p.company_name}</h3>
                  <p className="text-sm text-gray-500">{p.submitted_by_email}</p>
                </div>
                <span className="text-lg font-bold text-green-600">GH₵ {parseFloat(p.amount).toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div><span className="text-gray-500">MoMo Ref:</span> <span className="font-mono font-semibold">{p.momo_reference}</span></div>
                <div><span className="text-gray-500">Payment Phone:</span> {p.payment_phone}</div>
                <div><span className="text-gray-500">Submitted:</span> {new Date(p.submitted_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => verify(p.id, 'approve')}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700">
                  ✅ Verify & Activate
                </button>
                <button onClick={() => {
                  const reason = prompt('Rejection reason:');
                  if (reason) verify(p.id, 'reject', reason);
                }}
                  className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm font-semibold hover:bg-red-100 border border-red-200">
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
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
  const [ads, setAds] = useState([]);
  const load = () => API.get('/admin/ads/pending').then(r => setAds(r.data.data || []));
  useEffect(() => { load(); }, []);

  const moderate = async (adId, action) => {
    try {
      await API.patch(`/admin/ads/${adId}/moderate`, { action });
      toast.success(action === 'publish' ? 'Ad published! ✅' : action === 'approve_review' ? 'Ad approved — pending payment' : 'Ad rejected');
      load();
    } catch (_) { toast.error('Action failed'); }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Ad Moderation ({ads.length})</h2>
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
  USSDTemplatesPage,
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
                  <Route path="/commissions" element={<CommissionsPage />} />
                  <Route path="/ussd" element={<USSDTemplatesPage />} />
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
