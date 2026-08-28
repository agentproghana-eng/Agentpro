# AgentPro — Quickstart

This gets a fresh clone of the repo running locally end to end. For full production deployment, see `docs/DEPLOYMENT.md`. For what's actually solid vs. placeholder in this build, see `STATUS.md` — read that before deciding what to trust.

## 0. What's in this repo

```
agentpro/
├── backend/        Node.js + Express REST API (PostgreSQL + Redis)
├── flutter_app/    Android app (Flutter) — agents, managers, owners
├── admin_portal/   React web app — superuser only
├── docs/           Architecture, API spec (OpenAPI), Postman collection, deployment guide
└── .github/        CI pipeline (tests + builds on push)
```

## 1. Backend (10 min)

```bash
cd backend
cp .env.example .env
```

Fill in `.env` minimally for local dev — you need real values for:
- `DATABASE_URL` (local Postgres is fine: `postgresql://postgres:postgres@localhost:5432/agentpro_dev`)
- `REDIS_URL` (local Redis: `redis://localhost:6379`)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (any random 64-char string for dev)
- `ANTHROPIC_API_KEY` (only needed if testing the AI assistant)

Everything else (Firebase, Cloudinary, SMTP) can stay as placeholder values for local dev — those features will just no-op or log errors, the rest of the API works fine without them.

```bash
npm install
node scripts/migrate.js   # creates all tables
node scripts/seed.js      # creates superuser + USSD templates + default commission rule
npm run dev                # http://localhost:3000
```

Verify: `curl http://localhost:3000/health` → should return `"database": "healthy", "redis": "healthy"`.

Login as the seeded superuser using `SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` from your `.env` (defaults: `admin@example.com` / `ChangeMe123!`).

## 2. Admin Portal (2 min)

```bash
cd admin_portal
npm install
npm run dev   # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:3000/v1` automatically (see `vite.config.js`), so no manual URL edits are needed for local development. For production builds, set `VITE_API_URL` per `.env.example`.

Log in with the same superuser credentials.

## 3. Flutter App (15 min)

```bash
cd flutter_app
cp android/local.properties.example android/local.properties
# edit local.properties with your actual Flutter SDK and Android SDK paths

flutter pub get
```

For local backend testing, edit `lib/core/constants/app_constants.dart` and `lib/core/api/api_client.dart`, changing the base URL to `http://10.0.2.2:3000/v1` (Android emulator's alias for your host machine's localhost).

You'll also need a real `google-services.json` from a Firebase project (see `docs/DEPLOYMENT.md` step 1.1) placed at `android/app/google-services.json` — without it, the build fails. For a quick local run without push notifications, you can use the dummy JSON from `.github/workflows/ci.yml` as a stub.

```bash
flutter run
```

Note: USSD automation only works on a **real Android device** with a physical SIM card — it cannot be tested on an emulator. For UI/flow testing without real money movement, you can stub `USSDEngine.execute()` to return a fake success result.

## 4. Run Tests

```bash
# Backend
cd backend && npm test

# Flutter
cd flutter_app && flutter test
```

## 5. What to build next

The MVP (Phase 1, per `README.md`) is functionally complete. Natural next steps:

- Wire real SMS/email delivery in `emailService.js` (currently uses Nodemailer — needs real SMTP creds)
- Test USSD templates against actual MTN/Telecel/AT menus (they're best-effort placeholders in `scripts/seed.js` — Ghana network USSD menus change periodically)
- Add the Companies/Branches detail views and staff management screens in Flutter (currently summary-level)
- Build out automated Play Store screenshots and store listing copy
- Penetration test before going live — this handles real money

## Common gotchas

- **"relation does not exist" errors**: you forgot to run `node scripts/migrate.js`
- **AI assistant returns 500**: `ANTHROPIC_API_KEY` is missing or invalid
- **Flutter build fails on Firebase**: missing or malformed `google-services.json`
- **USSD does nothing**: you're on an emulator — this requires a real device with a SIM
- **Admin portal shows network errors**: API base URL still points to production; update for local dev

---
*AgentPro v2.0*
