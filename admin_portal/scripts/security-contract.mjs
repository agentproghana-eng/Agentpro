import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const root = path.resolve(
  currentDir,
  '../..',
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const app = read('admin_portal/src/App.jsx');
const pages = read('admin_portal/src/pages.jsx');
const api = read('admin_portal/src/lib/api.js');
const authStorage = read(
  'admin_portal/src/lib/authStorage.js',
);
const headers = read(
  'admin_portal/public/_headers',
);
const redirects = read(
  'admin_portal/public/_redirects',
);
const envExample = read(
  'admin_portal/.env.example',
);
const server = read('backend/server.js');
const ci = read('.github/workflows/ci.yml');

assert(
  !app.includes("from 'axios'"),
  'App.jsx must not own an Axios client',
);

assert(
  !pages.includes("from 'axios'"),
  'pages.jsx must not own an Axios client',
);

assert(
  app.includes("from './lib/api.js'"),
  'App.jsx must use the shared API client',
);

assert(
  pages.includes("from './lib/api.js'"),
  'pages.jsx must use the shared API client',
);

assert(
  !app.includes('localStorage.clear()'),
  'Admin portal must never clear unrelated localStorage',
);

assert(
  !app.includes(
    "localStorage.setItem('access_token'",
  ),
  'Access tokens must not be persistently stored',
);

assert(
  !app.includes(
    "localStorage.setItem('refresh_token'",
  ),
  'Refresh tokens must not be persistently stored',
);

assert(
  !pages.includes('localStorage'),
  'pages.jsx must not read auth storage directly',
);

assert(
  authStorage.includes('sessionStorage'),
  'Admin credentials must be tab scoped',
);

assert(
  api.includes("post('/auth/refresh'"),
  'Shared client must implement access-token refresh',
);

assert(
  api.includes('_agentProRetried'),
  'Refresh retry must have a loop guard',
);

assert(
  api.includes('refreshStatus >= 500'),
  'Temporary refresh outages must not force logout',
);

assert(
  headers.includes('Content-Security-Policy:'),
  'Deployment must define CSP',
);

assert(
  headers.includes("frame-ancestors 'none'"),
  'CSP must prevent framing',
);

assert(
  headers.includes(
    'X-Content-Type-Options: nosniff',
  ),
  'Deployment must disable MIME sniffing',
);

assert(
  headers.includes(
    'Strict-Transport-Security:',
  ),
  'Deployment must enable HSTS',
);

assert(
  redirects.includes('/index.html'),
  'BrowserRouter requires SPA fallback',
);

assert(
  envExample.includes(
    'https://api.agentproghana.com/api/v1',
  ),
  'Production API URL must use /api/v1',
);

assert(
  !server.includes(
    'fastidious-flan-33d060.netlify.app',
  ),
  'Temporary Netlify origin must not be trusted',
);

assert(
  server.includes('credentials: false'),
  'Bearer-token CORS must not enable ambient credentials',
);

assert(
  server.includes('process.env.ADMIN_URL'),
  'Admin production origin must be environment controlled',
);

assert(
  ci.includes('npm run test:security'),
  'CI must run the admin browser security contract',
);

console.log(
  'ADMIN_PORTAL_BROWSER_SECURITY_CONTRACT=PASS',
);

assert(
  app.includes(
    "'MFA_ENROLLMENT_REQUIRED'",
  ),
  'Admin portal must handle mandatory MFA enrollment',
);

assert(
  app.includes(
    "'MFA_REQUIRED'",
  ),
  'Admin portal must handle MFA verification challenges',
);

assert(
  app.includes(
    "'/auth/mfa/complete'",
  ),
  'Admin portal must complete MFA through the backend challenge endpoint',
);

assert(
  app.includes(
    'recovery_codes',
  ),
  'Admin portal must surface one-time recovery codes after enrollment',
);

assert(
  app.includes(
    'Use a recovery code instead',
  ),
  'Admin portal must support recovery-code login',
);

assert(
  api.includes(
    "requestUrl.includes('/auth/mfa/complete')",
  ),
  'Invalid MFA credentials must not trigger access-token refresh',
);

assert(
  !authStorage.includes(
    'challenge_token',
  ),
  'MFA challenges must never be persisted in browser auth storage',
);

assert(
  !authStorage.includes(
    'recovery_codes',
  ),
  'Recovery codes must never be persisted in browser auth storage',
);

console.log(
  'ADMIN_PORTAL_MFA_SECURITY_CONTRACT=PASS',
);
