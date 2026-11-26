param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)

  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

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

function Test-WslInstalled {
  try {
    & wsl.exe --status *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-ProcessorVirtualizationSummary {
  $Processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  if (-not $Processor) {
    return "unknown"
  }

  if ($Processor.VirtualizationFirmwareEnabled -eq $false) {
    return "disabled in BIOS/UEFI"
  }

  if ($Processor.VirtualizationFirmwareEnabled -eq $true) {
    return "enabled in firmware"
  }

  return "unknown"
}

function Write-Check {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][bool]$Ok,
    [string]$Detail = ""
  )

  if ($Ok) {
    Write-Host "[OK]   $Name $Detail" -ForegroundColor Green
  } else {
    Write-Host "[MISS] $Name $Detail" -ForegroundColor Yellow
  }
}

Write-Host "GameGrub prerequisite check" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

$DockerPath = Resolve-DockerPath
$HasDocker = [bool]$DockerPath
Write-Check "Docker CLI" $HasDocker $(if ($HasDocker) { "-> $(& $DockerPath --version)" } else { "-> install Docker Desktop" })

$HasCompose = $false
$HasDockerDaemon = $false
$HasWsl = Test-WslInstalled
if ($HasDocker) {
  try {
    $ComposeVersion = & $DockerPath compose version
    $HasCompose = $LASTEXITCODE -eq 0
    Write-Check "Docker Compose" $HasCompose "-> $ComposeVersion"
  } catch {
    Write-Check "Docker Compose" $false "-> Docker found, but compose is unavailable"
  }

  if ($HasWsl) {
    try {
      & $DockerPath info *> $null
      $HasDockerDaemon = $LASTEXITCODE -eq 0
      Write-Check "Docker daemon running" $HasDockerDaemon "-> Docker Desktop is reachable"
    } catch {
      Write-Check "Docker daemon running" $false "-> start Docker Desktop"
    }
  } else {
    Write-Check "Docker daemon running" $false "-> WSL is missing"
  }
} else {
  Write-Check "Docker Compose" $false "-> included with Docker Desktop"
  Write-Check "Docker daemon running" $false "-> start Docker Desktop after install"
}

$HasWinget = Test-CommandExists winget
Write-Check "winget" $HasWinget $(if ($HasWinget) { "-> available for scripted installs" } else { "-> install apps manually" })

$VirtualizationSummary = Get-ProcessorVirtualizationSummary
Write-Check "CPU virtualization" ($VirtualizationSummary -ne "disabled in BIOS/UEFI") "-> $VirtualizationSummary"

Write-Check "WSL" $HasWsl $(if ($HasWsl) { "-> installed" } else { "-> required by Docker Desktop's Linux engine" })

$FlutterCommand = Get-Command flutter -ErrorAction SilentlyContinue
if (-not $FlutterCommand -and (Test-Path "D:\flutter\bin\flutter.bat")) {
  $FlutterCommand = Get-Item "D:\flutter\bin\flutter.bat"
}

$FlutterPath = ""
if ($FlutterCommand) {
  if ($FlutterCommand.PSObject.Properties.Name -contains "Source" -and $FlutterCommand.Source) {
    $FlutterPath = $FlutterCommand.Source
  } elseif ($FlutterCommand.PSObject.Properties.Name -contains "FullName" -and $FlutterCommand.FullName) {
    $FlutterPath = $FlutterCommand.FullName
  }
}
Write-Check "Flutter SDK" ([bool]$FlutterCommand) $(if ($FlutterCommand) { "-> $FlutterPath" } else { "-> optional unless running native/mobile app locally" })

Write-Check "compose.yaml" (Test-Path "compose.yaml")
Write-Check "database dump" (Test-Path "gamegrub2.sql")
Write-Check ".env.example" (Test-Path ".env.example")

Write-Host ""
if (-not $HasDocker -or -not $HasCompose -or -not $HasWsl -or -not $HasDockerDaemon) {
  Write-Host "Docker is the only required app for the full browser test stack." -ForegroundColor Yellow
  if (-not $HasDocker -or -not $HasCompose) {
    Write-Host "Run: .\scripts\install-prereqs.cmd"
  } elseif (-not $HasWsl) {
    Write-Host "WSL requires Administrator privileges."
    Write-Host "Open PowerShell as Administrator and run: .\scripts\fix-windows-virtualization.cmd"
  } else {
    Write-Host "Start Docker Desktop, then run: .\scripts\start-dev.cmd"
    Write-Host "If Docker Desktop says 'Virtualization support not detected', run: .\scripts\fix-windows-virtualization.cmd"
  }
  exit 1
}

Write-Host "Prerequisites look ready. Run: .\scripts\start-dev.cmd" -ForegroundColor Green
