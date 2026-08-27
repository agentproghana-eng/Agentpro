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
const accountDeletion = read(
  'admin_portal/public/account-deletion/index.html',
);
const normalizedAccountDeletion =
  accountDeletion.replace(/\s+/g, ' ');
const privacyPolicy = read(
  'admin_portal/public/privacy-policy/index.html',
);
const normalizedPrivacyPolicy =
  privacyPolicy.replace(/\s+/g, ' ');
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
  headers.includes(
    'Cache-Control: no-store, max-age=0',
  ),
  'Admin SPA routes must not serve stale HTML after deployment',
);

assert(
  redirects.includes('/index.html'),
  'BrowserRouter requires SPA fallback',
);

assert(
  redirects.includes(
    '/account-deletion/index.html',
  ),
  'Public account-deletion resource must have an explicit route',
);

assert(
  redirects.indexOf(
    '/account-deletion/index.html',
  ) < redirects.indexOf(
    '/*    /index.html',
  ),
  'Public account-deletion route must precede the admin SPA fallback',
);

assert(
  accountDeletion.includes(
    '<title>AgentPro Account Deletion</title>',
  ),
  'Public deletion page must identify AgentPro',
);

assert(
  normalizedAccountDeletion.includes(
    'Delete your AgentPro account',
  ),
  'Public deletion page must prominently describe account deletion',
);

assert(
  accountDeletion.includes(
    'mailto:support@agentproghana.com',
  ),
  'Public deletion page must provide an actionable deletion-request pathway',
);

assert(
  accountDeletion.includes(
    'support@agentproghana.com',
  ),
  'Public deletion page must display the support deletion address',
);

assert(
  normalizedAccountDeletion.includes(
    'Do not send your password',
  ),
  'Public deletion page must warn users not to email authentication secrets',
);

assert(
  !accountDeletion.includes(
    'type="password"',
  ),
  'Public deletion resource must not collect passwords',
);

assert(
  normalizedAccountDeletion.includes(
    'financial and transaction',
  ),
  'Public deletion page must disclose retained financial records',
);

assert(
  normalizedAccountDeletion.includes(
    'fraud-prevention',
  ),
  'Public deletion page must disclose fraud-prevention retention',
);

assert(
  normalizedAccountDeletion.includes(
    'security and audit records',
  ),
  'Public deletion page must disclose security and audit retention',
);

assert(
  normalizedAccountDeletion.includes(
    'does not reset',
  ),
  'Public deletion page must disclose free-trial anti-abuse retention effect',
);

assert(
  redirects.includes(
    '/privacy-policy/index.html',
  ),
  'Public privacy policy must have an explicit route',
);

assert(
  redirects.indexOf(
    '/privacy-policy/index.html',
  ) < redirects.indexOf(
    '/*    /index.html',
  ),
  'Public privacy policy route must precede the admin SPA fallback',
);

assert(
  privacyPolicy.includes(
    '<title>AgentPro Privacy Policy</title>',
  ),
  'Public privacy page must identify AgentPro',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Intellicore Technology',
  ),
  'Privacy policy must identify the AgentPro operator',
);

assert(
  normalizedPrivacyPolicy.includes(
    'support@agentproghana.com',
  ),
  'Privacy policy must provide a privacy contact',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Account and business information',
  ),
  'Privacy policy must disclose account data processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Device, installation and SIM information',
  ),
  'Privacy policy must disclose device and SIM processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Transaction and financial records',
  ),
  'Privacy policy must disclose financial data processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Mobile Money PINs',
  ),
  'Privacy policy must state the MoMo PIN boundary',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Accessibility Service',
  ),
  'Privacy policy must disclose USSD Accessibility processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Microphone',
  ),
  'Privacy policy must disclose voice-note microphone use',
);

assert(
  normalizedPrivacyPolicy.includes(
    'does not request device location permission',
  ),
  'Privacy policy must disclose current absence of geolocation permission',
);

assert(
  normalizedPrivacyPolicy.includes(
    'does not request Android camera permission',
  ),
  'Privacy policy must disclose current absence of camera permission',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Google Firebase',
  ),
  'Privacy policy must disclose Firebase processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Google Mobile Ads',
  ),
  'Privacy policy must disclose advertising processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Paystack',
  ),
  'Privacy policy must disclose payment provider processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Cloudinary',
  ),
  'Privacy policy must disclose media storage processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Resend',
  ),
  'Privacy policy must disclose email provider processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Arkesel',
  ),
  'Privacy policy must disclose SMS provider processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'pseudonymous free-trial anti-abuse claims',
  ),
  'Privacy policy must disclose durable trial anti-abuse processing',
);

assert(
  normalizedPrivacyPolicy.includes(
    'Records that may remain after deletion',
  ),
  'Privacy policy must disclose post-deletion retention',
);

assert(
  normalizedPrivacyPolicy.includes(
    'financial and transaction records',
  ),
  'Privacy policy must disclose retained financial history',
);

assert(
  normalizedPrivacyPolicy.includes(
    'security and audit records',
  ),
  'Privacy policy must disclose retained security and audit data',
);

assert(
  privacyPolicy.includes(
    'href="/account-deletion/"',
  ),
  'Privacy policy must link to the public deletion resource',
);

assert(
  !privacyPolicy.toLowerCase().includes(
    '<script',
  ),
  'Public privacy policy must remain script-free',
);

assert(
  !privacyPolicy.toLowerCase().includes(
    '<form',
  ),
  'Public privacy policy must not collect user credentials or form data',
);

assert(
  !privacyPolicy.toLowerCase().includes(
    'type="password"',
  ),
  'Public privacy policy must not collect passwords',
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
