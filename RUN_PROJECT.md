# Run GameGrub locally

This is the quickest path to test the whole project after moving away from XAMPP.

## What runs in Docker

- MariaDB 10.11 database, initialized from the schema-only `database/schema.sql`
- Node/Express backend API
- React admin dashboard
- Flutter user app compiled as a web app
- phpMyAdmin
- Mailpit local email inbox

You do not need XAMPP, local Node.js, local npm, or local MariaDB for the Docker test stack.

## Required apps

Install Docker Desktop and WSL 2. The helper script handles both, but WSL needs Windows Administrator permission.

If you have winget, run this from the project root:

```powershell
.\scripts\install-prereqs.ps1
```

If PowerShell blocks scripts with `running scripts is disabled on this system`, use the `.cmd` launcher instead:

```powershell
.\scripts\install-prereqs.cmd
```

If that installer needs admin permission, accept the Windows UAC prompt. If Windows says WSL requires administrator privileges, open PowerShell as Administrator and run the same command again:

```powershell
cd "E:\GG Project"
.\scripts\install-prereqs.cmd
```

Restart Windows if WSL or Docker asks for it. After installation, open Docker Desktop once and finish any WSL/virtualization setup it asks for.

If Docker Desktop says `Virtualization support not detected`, run the Windows virtualization fixer from Administrator PowerShell:

```powershell
cd "E:\GG Project"
.\scripts\fix-windows-virtualization.cmd
```

Restart Windows after it finishes. If Docker still shows the same message after restart, enable SVM/AMD-V in BIOS/UEFI.

Then check everything:

```powershell
.\scripts\check-prereqs.ps1
```

Or, if PowerShell script execution is blocked:

```powershell
.\scripts\check-prereqs.cmd
```

## Before the first run

The first database startup imports `database/schema.sql` only when the Docker database volume is empty. This public schema baseline intentionally contains no customer, payment, or account records. Keep local database exports out of the repository.

## Start the project

Foreground mode, useful when you want to watch logs:

```powershell
.\scripts\start-dev.ps1
```

If `.ps1` scripts are blocked:

```powershell
.\scripts\start-dev.cmd
```

Background mode:

```powershell
.\scripts\start-dev.ps1 -Detached
```

If `.ps1` scripts are blocked:

```powershell
.\scripts\start-dev.cmd -Detached
```

Open:

- Admin dashboard: http://localhost:3000
- User web app: http://localhost:3002
- Backend health: http://localhost:3001/health
- phpMyAdmin: http://localhost:8080
- Mailpit inbox: http://localhost:8025
- MariaDB from host tools: `localhost:3307`

Run a quick URL smoke test:

```powershell
.\scripts\smoke-test.ps1
```

If `.ps1` scripts are blocked:

```powershell
.\scripts\smoke-test.cmd
```

## Stop the project

```powershell
.\scripts\stop-dev.ps1
```

## Reset the Docker database

Only do this when you intentionally want to delete the Docker database and uploaded files, then re-import the schema baseline.

```powershell
.\scripts\stop-dev.ps1 -RemoveVolumes
.\scripts\start-dev.ps1
```

Or:

```powershell
.\scripts\start-dev.ps1 -ResetDatabase
```

## Run backend tests in Docker

```powershell
.\scripts\test-backend.ps1
```

## Run the native/mobile Flutter app

The Docker stack already includes a browser version of the Flutter user app. Use local Flutter only if you want Android, iOS, Windows, macOS, or Linux app testing.

Flutter is already installed on this machine at `D:\flutter\bin\flutter.bat`.

```powershell
cd gamegrub_user
flutter pub get
flutter run
```

Defaults:

- Web/desktop uses `http://localhost:3001`
- Android emulator uses `http://10.0.2.2:3001`

For a physical phone, use your PC LAN IP:

```powershell
flutter run --dart-define=API_HOST=192.168.1.10
```

Replace `192.168.1.10` with your actual PC IP address.

## Common fixes

### `docker` is not recognized

Install Docker Desktop, start it once, then restart PowerShell.

### `running scripts is disabled on this system`

Use the `.cmd` launchers. They run the matching PowerShell scripts with a temporary execution-policy bypass:

```powershell
cd "E:\GG Project"
.\scripts\install-prereqs.cmd
.\scripts\check-prereqs.cmd
.\scripts\start-dev.cmd -Detached
```

This does not permanently change your Windows execution policy.

### Docker Desktop opens but the engine never starts

Check WSL:

```powershell
wsl --status
```

If Windows says WSL is not installed, open PowerShell as Administrator and run:

```powershell
cd "E:\GG Project"
.\scripts\fix-windows-virtualization.cmd
```

Then restart Windows if prompted and start Docker Desktop again.

### Docker says `Virtualization support not detected`

First enable the Windows-side virtualization features:

```powershell
cd "E:\GG Project"
.\scripts\fix-windows-virtualization.cmd
```

Restart Windows.

If Docker still shows the same message, enable virtualization in BIOS/UEFI:

1. Restart the PC.
2. Press `Delete` repeatedly while booting to enter the MSI BIOS.
3. Press `F7` for Advanced Mode if needed.
4. Find `SVM Mode` under a CPU/OC/Advanced CPU Configuration menu.
5. Set `SVM Mode` to `Enabled`.
6. Save and exit with `F10`.
7. Boot Windows, open Docker Desktop, then run:

```powershell
cd "E:\GG Project"
.\scripts\check-prereqs.cmd
.\scripts\start-dev.cmd -Detached
```

### Port already in use

Edit `.env` and change one of these:

```dotenv
BACKEND_PORT=3001
ADMIN_PORT=3000
USER_WEB_PORT=3002
PHPMYADMIN_PORT=8080
MAILPIT_UI_PORT=8025
MARIADB_HOST_PORT=3307
```

Then restart:

```powershell
.\scripts\stop-dev.ps1
.\scripts\start-dev.ps1
```

### SQL changes do not appear

Docker imports `database/schema.sql` only on a fresh database volume. Reset the volume if you changed the schema and want to re-import it:

```powershell
.\scripts\stop-dev.ps1 -RemoveVolumes
.\scripts\start-dev.ps1
```
