# GameGrub

GameGrub is a gaming-cafe platform with a Node.js API, a React admin dashboard, and a Flutter customer app.

## Run locally

Install Docker Desktop with Docker Compose. On Windows, make sure WSL 2 is enabled. From the project root, run:

```powershell
docker compose up --build
```

The first run builds the apps, creates the local database, imports the schema, and applies database migrations. You do not need to install Node.js or MariaDB to run the browser version.

Open:

- Admin dashboard: http://localhost:3000
- Customer app: http://localhost:3002
- Backend health: http://localhost:3001/health
- phpMyAdmin: http://localhost:8080
- Mailpit inbox: http://localhost:8025

To stop the services, run `docker compose down`.

## Run the mobile app

With the Docker services running and Flutter installed:

```powershell
cd gamegrub_user
flutter pub get
flutter run
```

The Android emulator connects to the backend at `10.0.2.2:3001`. For a physical phone, replace the example address with your computer's LAN IP:

```powershell
flutter run --dart-define=API_HOST=192.168.1.10
```

See [RUN_PROJECT.md](RUN_PROJECT.md) for the short setup guide, optional Windows launcher, and database reset instructions.
