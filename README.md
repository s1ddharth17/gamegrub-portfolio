# GameGrub

GameGrub is a multi-app workspace for a gaming-cafe platform with three deployable parts:

- `backend`: Node.js + Express API, auth, bookings, billing, tournaments, cron jobs, and uploads.
- `gamegrubadmin`: React admin dashboard for operations, POS, menu, tournaments, and reporting.
- `gamegrub_user`: Flutter user app for bookings, food orders, tournaments, payments, and profile flows.

## Prerequisites

- Docker Desktop with Docker Compose and WSL 2 on Windows
- Flutter stable for the native/mobile user app

Node.js, MariaDB, and the Flutter web build environment are supplied by Docker
for the browser test stack.

## Docker Setup

The Docker environment includes MariaDB, the backend API, the React admin app,
the Flutter user app as a web build, Mailpit for local email, and phpMyAdmin.

For a step-by-step local runbook, use `RUN_PROJECT.md`. If Windows blocks
PowerShell scripts with an execution-policy error, use the matching `.cmd`
launchers under `scripts`, for example `scripts\install-prereqs.cmd`.
If Docker Desktop reports that virtualization support is not detected, run
`scripts\fix-windows-virtualization.cmd` from Administrator PowerShell and then
restart Windows.

1. Install and start Docker Desktop.
2. Optional: copy `.env.example` to `.env` and change the local development
   credentials or exposed ports.
3. Start the stack:

   ```powershell
   docker compose up --build
   ```

5. Open:

   - Admin dashboard: http://localhost:3000
   - User web app: http://localhost:3002
   - Backend health: http://localhost:3001/health
   - phpMyAdmin: http://localhost:8080
   - Mailpit: http://localhost:8025
   - MariaDB from host tools: `localhost:3307`

Use `scripts\smoke-test.cmd` to check the backend health response, admin JavaScript
bundle, Flutter web bootstrap and app bundle, phpMyAdmin, and Mailpit after startup.

The first database start imports the schema-only baseline in
`database/schema.sql`. The backend then applies all pending JavaScript
migrations before starting. The public baseline contains no customer, payment,
or account records. Database and upload data are stored in named Docker volumes.

To stop the stack:

```powershell
docker compose down
```

To deliberately erase the Docker database and re-import the schema baseline:

```powershell
docker compose down -v
docker compose up --build
```

The `-v` command permanently removes the Docker database and uploaded files.

## Flutter User App

Run Flutter on the host because Android/iOS emulators and physical devices need
the platform SDKs:

```powershell
cd gamegrub_user
flutter pub get
flutter run
```

The defaults already target:

- `localhost:3001` for web and desktop
- `10.0.2.2:3001` for the Android emulator

For a physical phone, use the development machine's LAN address:

```powershell
flutter run --dart-define=API_HOST=192.168.1.10
```

## Manual Setup Without Docker

If needed, the services can still run manually with Node.js 22+, npm 10+, and
MariaDB 10.11+. Copy `backend/.env.example` to `backend/.env`, configure the
database, run `npm run migrate`, and then start the backend and admin app.

## Quality Checks

- Backend: `npm test`; focused booking, food-order, and payment journey contracts: `npm run test:journeys`
- Admin: `npm run test:ci` and `npm run build`
- Flutter user app: `flutter analyze` and `flutter test`

The GitHub Actions workflows under `.github/workflows` mirror these checks.

## Engineering Standards

- Keep secrets out of the repository. Commit only example env files.
- Treat `build`, `node_modules`, logs, uploads, and generated Flutter artifacts as disposable local output.
- Add or update tests for business-rule changes, especially in booking, billing, auth, and tournament logic.
- Prefer small modules over multi-thousand-line route or screen files when extending major features.

## Current Project Status

The planned code upgrades are tracked in `PRODUCT_UPGRADE_CHECKLIST.md`.
FND-01 through FND-04 are complete. The remaining DEP-01 and DATA-01 items are
blocked on real provider credentials/endpoints and verified café profile data;
the local app correctly keeps incomplete café profiles out of public results.
