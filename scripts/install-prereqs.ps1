param(
  [switch]$SkipDocker,
  [switch]$SkipWsl,
  [switch]$NoElevate
)

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

function Test-IsAdministrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
  return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-WslInstalled {
  try {
    & wsl.exe --status *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Invoke-SelfElevated {
  if ($NoElevate) {
    return $false
  }

  $Arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
  if ($SkipDocker) {
    $Arguments += "-SkipDocker"
  }
  if ($SkipWsl) {
    $Arguments += "-SkipWsl"
  }
  $Arguments += "-NoElevate"

  Write-Host "Administrator privileges are required for WSL." -ForegroundColor Yellow
  Write-Host "Opening an elevated PowerShell window. Accept the Windows UAC prompt."
  Start-Process -FilePath "powershell.exe" -ArgumentList $Arguments -Verb RunAs
  return $true
}

Write-Host "GameGrub prerequisite installer" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-CommandExists winget)) {
  throw "winget was not found. Install Docker Desktop manually from https://www.docker.com/products/docker-desktop/"
}

if (-not $SkipDocker) {
  $DockerPath = Resolve-DockerPath
  if ($DockerPath) {
    Write-Host "Docker CLI already exists: $(& $DockerPath --version)" -ForegroundColor Green
  } else {
    Write-Host "Installing Docker Desktop with winget..." -ForegroundColor Yellow
    Write-Host "A Windows admin/UAC prompt may appear. Accept it if you want Docker installed."
    winget install --id Docker.DockerDesktop -e --source winget --accept-source-agreements --accept-package-agreements
  }
}

if (-not $SkipWsl) {
  if (Test-WslInstalled) {
    Write-Host "WSL is already installed." -ForegroundColor Green
  } else {
    if (-not (Test-IsAdministrator)) {
      if (Invoke-SelfElevated) {
        Write-Host "Continue in the elevated PowerShell window, then restart Windows if prompted."
        exit 0
      }

      throw "WSL requires Administrator privileges. Open PowerShell as Administrator and run .\scripts\install-prereqs.cmd"
    }

    Write-Host "Enabling Windows features required for WSL 2 and Docker Desktop..." -ForegroundColor Yellow
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
    dism.exe /online /enable-feature /featurename:HypervisorPlatform /all /norestart

    Write-Host "Setting Windows hypervisor launch type to auto..." -ForegroundColor Yellow
    bcdedit /set hypervisorlaunchtype auto

    Write-Host "Installing the official WSL package..." -ForegroundColor Yellow
    winget install --id Microsoft.WSL -e --source winget --accept-source-agreements --accept-package-agreements

    Write-Host "WSL installation requested. Restart Windows before starting Docker Desktop if Windows asks for it." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "After installation:" -ForegroundColor Cyan
Write-Host "1. Restart Windows if WSL or Docker asks for it."
Write-Host "2. Start Docker Desktop from the Start menu."
Write-Host "3. Finish any WSL/virtualization prompts Docker shows."
Write-Host "4. Restart this terminal if docker is still not found."
Write-Host "5. Run: .\scripts\check-prereqs.cmd"
Write-Host "6. Run: .\scripts\start-dev.cmd"
Write-Host ""
Write-Host "Flutter is not required for the Docker browser test stack. It is only needed for native Android/iOS/desktop runs."
