# AgentPro — Deployment Guide
Version 2.0 | Confidential

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Backend API |
| Flutter | 3.22+ (stable) | Android app |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Cache & sessions |
| Android Studio | Latest | Flutter builds |

---

## Step 1 — External Services Setup

### 1.1 Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project: **agent-pro-ghana**
3. Add Android app: package name `com.agentpro.ghana`
4. Download `google-services.json` → place in `flutter_app/android/app/`
5. Enable: **Cloud Messaging**, **Analytics**, **Crashlytics**
6. Go to Project Settings → Service Accounts → Generate Private Key
7. Save the JSON — extract `project_id`, `private_key`, `client_email` for `.env`

### 1.2 Anthropic Claude API
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create API key
3. Save as `ANTHROPIC_API_KEY` in `.env`

### 1.3 Cloudinary
1. Go to [cloudinary.com](https://cloudinary.com) → Create free account
2. Copy: Cloud Name, API Key, API Secret → save to `.env`
3. Go to Settings → Upload → Add upload preset: `agentpro_uploads` (unsigned)
4. **Critical — do not skip:** Go to Settings → Security → find "PDF and ZIP files
   delivery" and enable "Allow delivery of PDF and ZIP files," then save and accept
   the responsibility prompt. Cloudinary blocks public delivery of PDF/ZIP files by
   default on new accounts as an anti-abuse measure — this is an *account-level*
   setting, completely separate from any upload code or per-file access setting.
   Without this, transaction receipt PDFs will upload successfully (no error at
   upload time) but every `receipt_url` will return an HTTP 401 "ACL or Deny" /
   "Customer is marked as untrusted" error the moment anyone actually tries to
   open one — a confusing, silent failure that looks like an app bug but isn't.

### 1.4 Domain Setup (production)
1. Register `intellicoresystem.com`
2. Add DNS records:
   - `api.agentpro.intellicoresystem.com` → Railway/Render backend URL
   - `admin.agentpro.intellicoresystem.com` → Admin portal hosting URL
3. SSL is auto-managed by Railway/Render via Let's Encrypt

---

## Step 2 — Database Setup

```bash
# Create PostgreSQL database
createdb agentpro_ghana

# Run migrations
psql agentpro_ghana < backend/migrations/001_initial_schema.sql

# Verify tables
psql agentpro_ghana -c "\dt"
```

Expected tables: users, companies, branches, transactions, float_accounts,
float_movements, commissions, subscriptions, advertisements, notifications,
audit_logs, ai_conversations, ai_messages, ussd_templates, system_config, ...

---

## Step 3 — Backend Deployment (Railway)

### 3.1 Local development
```bash
cd backend
cp .env.example .env
# Fill in ALL values in .env

npm install
npm run dev
# API running at http://localhost:3000
```

### 3.2 Seed the database
```bash
npm run seed
# Creates: superuser account + USSD templates + default commission rule
```

### 3.3 Deploy to Railway
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Create project: `railway init`
4. Add PostgreSQL plugin: Railway dashboard → Add Plugin → PostgreSQL
5. Add Redis plugin: Railway dashboard → Add Plugin → Redis
6. Set environment variables in Railway dashboard (copy from `.env.example`)
7. Deploy: `railway up`
8. Set custom domain: `api.agentpro.intellicoresystem.com`

### 3.4 Verify deployment
```bash
curl https://api.agentpro.intellicoresystem.com/health
# Expected: { "success": true, "services": { "database": "healthy", "redis": "healthy" } }
```

---

## Step 4 — Admin Portal Deployment

```bash
cd admin_portal
npm install
npm run build
# dist/ folder is ready to deploy
```

Deploy `dist/` to:
- **Netlify**: drag & drop or `netlify deploy --dir=dist`
- **Vercel**: `vercel --prod`
- **Railway Static**: add as static service

Set custom domain: `admin.agentpro.intellicoresystem.com`

---

## Step 5 — Flutter App Build

### 5.1 Setup
```bash
cd flutter_app
flutter pub get

# Place google-services.json in android/app/
# Verify: flutter doctor
```

### 5.2 Update API URL (if needed)
Edit `lib/core/constants/app_constants.dart`:
```dart
static const String apiBaseUrl = 'https://api.agentpro.intellicoresystem.com/v1';
```

### 5.3 Generate Android signing keystore
```bash
keytool -genkey -v \
  -keystore agentpro-release.jks \
  -alias agentpro \
  -keyalg RSA -keysize 2048 \
  -validity 10000

# Save keystore safely — you CANNOT release updates without it
```

Create `flutter_app/android/key.properties`:
```
storePassword=your_store_password
keyPassword=your_key_password
keyAlias=agentpro
storeFile=../agentpro-release.jks
```

### 5.4 Debug build
```bash
flutter run  # runs on connected device/emulator
```

### 5.5 Release APK (for testing)
```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

### 5.6 Release AAB (for Play Store)
```bash
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

### 5.7 Update certificate pins
After deploying backend, get your API certificate hash:
```bash
openssl s_client -connect api.agentpro.intellicoresystem.com:443 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256 \
  | sed 's/://g' \
  | awk -F= '{print $2}' \
  | xxd -r -p | base64
```
Update `network_security_config.xml` with the actual hash.

---

## Step 6 — Google Play Store Submission

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create new app: **AgentPro**
3. Package name: `com.agentpro.ghana`
4. Upload AAB from Step 5.6
5. Fill in store listing:
   - Category: Finance
   - Content rating: Everyone
6. Required permissions justification:
   - `CALL_PHONE`: Required for USSD automation (Mobile Money transactions)
   - `READ_PHONE_STATE`: Required to detect SIM cards and route to correct network
7. Privacy policy URL: `https://admin.agentpro.intellicoresystem.com/privacy-policy/`
8. Submit for review (typically 3-7 days)

---

## Step 7 — First Login & Configuration

1. Open admin portal: `https://admin.agentpro.intellicoresystem.com`
2. Login with superuser credentials from `.env` (`SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD`)
3. **Change superuser password immediately** (Settings → Change Password)
4. Go to **System Config** → set `agent_pro_momo_number` to your MTN MoMo merchant number
5. Review **USSD Templates** — verify menu steps match current network flows
6. Set **Commission Rules** as appropriate for your business model

---

## Environment Variables Reference

See `backend/.env.example` for the complete list. Critical ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Min 64 chars random string |
| `JWT_REFRESH_SECRET` | Min 64 chars random string (different from above) |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `FIREBASE_PROJECT_ID` | From Firebase console |
| `FIREBASE_PRIVATE_KEY` | From Firebase service account JSON |
| `FIREBASE_CLIENT_EMAIL` | From Firebase service account JSON |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `SUPERUSER_EMAIL` | Initial admin email |
| `SUPERUSER_PASSWORD` | Initial admin password (change after first login) |
| `MOMO_MERCHANT_NUMBER` | Your MTN MoMo merchant number for payments |

---

## Monitoring & Maintenance

### Health checks
- API: `GET https://api.agentpro.intellicoresystem.com/health`
- Database: Monitored via Railway dashboard
- Errors: Firebase Crashlytics (mobile app)

### Logs
- Backend logs: Railway → Logs tab
- Audit logs: Admin portal → Audit Logs
- App crashes: Firebase Crashlytics dashboard

### Backups
- Railway PostgreSQL: automatic daily backups (7-day retention on free, 30-day on paid)
- Enable point-in-time recovery for production

### Scaling
- Backend: Railway auto-scales on Pro plan
- Database: Upgrade PostgreSQL plan as transaction volume grows
- Redis: Monitor memory usage; upgrade if approaching limits

---

## Security Checklist (pre-launch)

- [ ] All `.env` secrets are strong random values (not defaults)
- [ ] Superuser default password changed
- [ ] Certificate pinning hashes updated with production cert
- [ ] `agent_pro_momo_number` set correctly in System Config
- [ ] USSD templates verified against actual network flows
- [ ] `NODE_ENV=production` in Railway environment
- [ ] Firebase security rules reviewed
- [ ] Play Store app signed with secure keystore (stored safely)
- [ ] Cloudinary upload preset restricted appropriately
- [ ] Rate limiting verified working (`GET /health` rapidly → expect 429)

---

## Support & Contacts

- Technical: support@intellicoresystem.com
- User support: support@intellicoresystem.com
- Admin portal: https://admin.agentpro.intellicoresystem.com

---

*AgentPro v2.0 — Developer-Ready | Confidential*
