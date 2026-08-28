# AgentPro 🇬🇭
### One App. Every Business.

**Version:** 2.0.0 | **Status:** Launch Hardening & Production Validation | **Confidential**

> **Current status:** This README contains the current high-level launch state.
> [`STATUS.md`](./STATUS.md) remains useful historical audit context, but parts of
> it predate the latest production-hardening and live-device validation work.

---

## What This Is

A FinTech Super App for Ghana in pre-public-launch hardening that serves Mobile Money Agents, Business Owners, Aggregators, Branch Managers, Auditors, and Customers.

Supported providers: **MTN Mobile Money · Telecel Cash · AT Money**

---

## Current Launch Status — 21 August 2026

AgentPro is in **pre-public-launch hardening and production validation**.

### ✅ Production-critical items completed

- Core Flutter Android app, Node/Express backend, PostgreSQL, Redis, and React admin portal are implemented.
- GitHub `master` is protected by Backend Tests, Backend Lint, Admin Portal Build, and Flutter Android Build.
- Production backend is deployed on Render using Node.js **24.19.0**.
- Current production backend-code baseline (PR #47): `15f2c7b6edfb45f23e41b080ed93118365194e7b`.
- Migration `094_refresh_token_exact_digest.sql` is applied in production.
- Refresh sessions now use exact SHA-256 digest identity instead of bcrypt matching of full JWT refresh tokens.
- Production has zero active refresh sessions without a digest.
- Fresh login after migration 094 succeeded.
- The 15+ minute access-token expiry smoke passed:
  - protected request returned `401` after access-token expiry;
  - `POST /refresh` returned `200`;
  - protected requests immediately retried successfully with `200`;
  - the user remained authenticated;
  - the durable refresh session remained active after a backend cold start.
- PIN-less MTN Personal Airtime/Data resolver production blocker is closed.
- CI release APK signing identity has been verified.

### 🔄 Remaining launch gates

- [ ] MoMo manual-PIN boundary smoke
- [ ] Firebase push routing/idempotency device smoke
- [ ] Report opening/export smoke using `open_filex`
- [ ] Non-destructive Business transaction smoke
- [ ] Non-destructive Personal transaction smoke
- [ ] Admin Portal live production smoke
- [ ] Final clean backend install/audit/full regression gate
- [ ] Final rollback checklist
- [ ] Close obsolete superseded PR #35
- [ ] Verify Google Play highest Android `versionCode`
- [ ] Final signing-key/provenance verification
- [ ] Move production API and PostgreSQL off free hosting plans before public launch

> `STATUS.md` contains useful historical audit context, but parts of it predate
> the current production-hardening work. This README section reflects the current
> high-level launch state.

---

## Project Structure

```
agentpro/
├── backend/          # Node.js + Express REST API
├── flutter_app/      # Flutter Android Application
├── admin_portal/     # React Web Admin Portal
└── docs/             # Architecture and API docs
```

---

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
psql $DATABASE_URL < migrations/001_initial_schema.sql

# Start development server
npm run dev
```

### 2. Flutter App Setup

```bash
cd flutter_app

# Install Flutter dependencies
flutter pub get

# Copy and configure environment
# Set your API URL in lib/core/constants/app_constants.dart

# Run on connected Android device
flutter run
```

### 3. Admin Portal Setup

```bash
cd admin_portal
npm install
npm run dev
```

---

## Environment Requirements

| Service | Version |
|---------|---------|
| Node.js | 24.19.0 |
| PostgreSQL | >= 15 |
| Redis | >= 7 |
| Flutter | >= 3.22 (stable) |
| Dart | >= 3.3 |

---

## External Services Required

Before running, set up accounts and get credentials for:

1. **Anthropic Claude API** — [console.anthropic.com](https://console.anthropic.com)
2. **Firebase** — [console.firebase.google.com](https://console.firebase.google.com)
   - Create Android app with package name `com.agentpro.ghana`
   - Enable FCM, Analytics, Crashlytics
   - Download `google-services.json` → `flutter_app/android/app/`
3. **Cloudinary** — [cloudinary.com](https://cloudinary.com)
4. **Render** — current production backend hosting
5. **Domain** — intellicoresystem.com (for production)

---

## Architecture

```
Flutter App (Android)
      │
      │ HTTPS + JWT
      ▼
Node.js REST API (Railway/Render)
      │
   ┌──┴──┐
   │     │
PostgreSQL  Redis
(Data)  (Cache/Sessions)
      │
   Cloudinary (Files)
   Firebase (Push/Analytics)
   Anthropic (AI Assistant)
```

---

## Historical Development Roadmap

> The checklist below reflects the original development-phase plan. It is retained
> for historical context and should not be used as the current launch-readiness
> checklist. Use **Current Launch Status** above for the active launch gates.


### ✅ Phase 0 — Foundation
- [x] Architecture & database schema
- [x] Backend scaffolding & server setup
- [x] Auth system (register, login, JWT, RBAC)
- [x] Transaction initiation & completion
- [x] USSD automation engine (Flutter)
- [x] Commission calculation service
- [x] AI assistant integration
- [x] Material Design 3 theme

### 🔄 Phase 1 — MVP
- [ ] Complete all backend controllers & routes
- [ ] Float management module
- [ ] Subscription system
- [ ] Transaction receipts (PDF)
- [ ] Push notifications (FCM)
- [ ] Flutter screens: Login, Dashboard, Cash In/Out
- [ ] Flutter screens: Float, Receipts, Notifications
- [ ] Basic reporting (daily/monthly PDF & CSV)

### 📋 Phase 2 — Full Feature Set
- [ ] Marketplace / Market Centre
- [ ] Full reporting suite
- [ ] Admin portal (React)
- [ ] All transaction types
- [ ] Multi-branch management
- [ ] Superuser admin portal

### 🚀 Phase 3 — Production / Launch Hardening
- [ ] Security audit & penetration testing
- [ ] Google Play Store submission
- [ ] Performance optimization
- [x] Full backend regression suite established
- [ ] Complete remaining production device smoke tests

---

## Security Notes (Critical)

1. **MoMo PIN Rule**: The application must NEVER request, store, log, cache, or transmit a MoMo PIN at any layer. See `ussd_service.dart` for implementation.

2. **Encryption**: All sensitive local storage uses AES-256 via Flutter Secure Storage backed by Android Keystore.

3. **Root Detection**: App refuses to run on rooted devices (`FlutterJailbreakDetection`).

4. **Audit Logging**: Every user action and transaction is logged to `audit_logs` table with user ID, IP, timestamp, and result.

5. **JWT**: Access tokens expire in 15 minutes. Refresh tokens in 30 days. Both can be revoked.

---

## API Conventions

- **Base URL**: `https://api.agentpro.intellicoresystem.com/v1`
- **Auth**: `Authorization: Bearer <access_token>`
- **Response format**:
```json
{
  "success": true,
  "data": {},
  "message": "Human readable message",
  "meta": { "page": 1, "total": 100 }
}
```

---

## User Roles

| Role | Created By | Access |
|------|-----------|--------|
| Superuser | System | Full platform |
| Business Owner | Public registration | Own company |
| Manager | Business Owner | Assigned branches |
| Agent | Business Owner | Own transactions |
| Auditor | Business Owner | Read-only |
| Customer | Agent/Self | Own account |

---

## Support

- Technical: support@intellicoresystem.com
- User support: support@intellicoresystem.com
- Admin portal: admin.agentpro.intellicoresystem.com

---

*AgentPro — Version 2.0 | Developer-Ready | Confidential*
