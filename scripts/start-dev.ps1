param(
  [switch]$Detached,
  [switch]$NoBuild,
  [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Resolve-DockerPath {
  $DockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($DockerCommand) {
    return $DockerCommand.Source
  }

  $DefaultDockerPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $DefaultDockerPath) {
    return $DefaultDockerPath
  }

  return $null
}

function Wait-ForDockerDaemon {
  param(
    [Parameter(Mandatory = $true)][string]$DockerPath,
    [int]$TimeoutSeconds = 180
  )

  $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  while ($Stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
      & $DockerPath info *> $null
      if ($LASTEXITCODE -eq 0) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 3
    }

    Start-Sleep -Seconds 3
  }

  return $false
}

function Test-WslInstalled {
  try {
    & wsl.exe --status *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

$DockerPath = Resolve-DockerPath
if (-not $DockerPath) {
  throw "Docker CLI was not found. Run .\scripts\install-prereqs.cmd, then start Docker Desktop."
}

if (-not (Test-WslInstalled)) {
  throw "WSL is not installed. Open PowerShell as Administrator and run .\scripts\install-prereqs.cmd, then restart Windows if prompted."
}

if (-not (Wait-ForDockerDaemon -DockerPath $DockerPath -TimeoutSeconds 5)) {
  $DockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $DockerDesktopExe) {
    Write-Host "Docker Desktop is not running. Launching it now..." -ForegroundColor Yellow
    Start-Process $DockerDesktopExe
    Write-Host "Waiting for Docker Desktop to become ready..."
    if (-not (Wait-ForDockerDaemon -DockerPath $DockerPath -TimeoutSeconds 240)) {
      throw "Docker Desktop did not become ready in time. Finish Docker Desktop setup manually, then run this script again."
    }
  } else {
    throw "Docker Desktop is not running or is not reachable. Start Docker Desktop, then run this script again."
  }
}

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created local .env from .env.example" -ForegroundColor Green
}

if ($ResetDatabase) {
  Write-Warning "ResetDatabase removes the Docker database and uploaded files for this project."
  & $DockerPath compose down -v
}

$ComposeArgs = @("compose", "up")
if (-not $NoBuild) {
  $ComposeArgs += "--build"
}
if ($Detached) {
  $ComposeArgs += "-d"
}

Write-Host "Starting GameGrub Docker stack..." -ForegroundColor Cyan
& $DockerPath @ComposeArgs

if ($Detached) {
  Write-Host ""
  Write-Host "GameGrub is starting in the background. Useful URLs:" -ForegroundColor Green
  Write-Host "Admin dashboard : http://localhost:3000"
  Write-Host "User web app    : http://localhost:3002"
  Write-Host "Backend health  : http://localhost:3001/health"
  Write-Host "phpMyAdmin      : http://localhost:8080"
  Write-Host "Mailpit inbox   : http://localhost:8025"
  Write-Host ""
  Write-Host "Run .\scripts\smoke-test.ps1 after the containers finish starting."
}
