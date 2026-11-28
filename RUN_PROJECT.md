# Run GameGrub

## Requirements

- Docker Desktop with Docker Compose
- WSL 2 enabled on Windows

Start Docker Desktop before launching the project.

## Start the project

From the project root, run:

```powershell
docker compose up --build
```

The first start builds the apps and initializes the local database. Later starts reuse the existing containers and data.

On Windows, you can start the stack in the background with:

```powershell
.\scripts\start-dev.ps1 -Detached
```

If PowerShell blocks scripts, use:

```powershell
.\scripts\start-dev.cmd -Detached
```

## Open the apps

- Admin dashboard: http://localhost:3000
- Customer app: http://localhost:3002
- Backend health: http://localhost:3001/health
- phpMyAdmin: http://localhost:8080
- Mailpit inbox: http://localhost:8025

## Stop the project

Stop the foreground stack with Ctrl+C, or run this from another terminal:

```powershell
docker compose down
```

## Run the mobile app (optional)

Keep the Docker stack running, then use a terminal with Flutter installed:

```powershell
cd gamegrub_user
flutter pub get
flutter run
```

The Android emulator uses `10.0.2.2:3001` to reach the backend. For a physical phone, use your computer's LAN IP:

```powershell
flutter run --dart-define=API_HOST=192.168.1.10
```

Replace `192.168.1.10` with that address.

## Reset the local database

Only reset when you want to erase the local database and uploaded files. This cannot be undone:

```powershell
docker compose down -v
docker compose up --build
```
