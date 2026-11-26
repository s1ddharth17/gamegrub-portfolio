param(
  [switch]$NoElevate
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Test-IsAdministrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
  return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-SelfElevated {
  if ($NoElevate) {
    return $false
  }

  $Arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-NoElevate")
  Write-Host "Administrator privileges are required to enable Windows virtualization features." -ForegroundColor Yellow
  Write-Host "Opening an elevated PowerShell window. Accept the Windows UAC prompt."
  Start-Process -FilePath "powershell.exe" -ArgumentList $Arguments -Verb RunAs
  return $true
}

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)

  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "GameGrub Windows virtualization fixer" -ForegroundColor Cyan
Write-Host ""

$Processor = Get-CimInstance Win32_Processor | Select-Object -First 1
if ($Processor) {
  Write-Host "CPU: $($Processor.Name)"
  Write-Host "Virtualization enabled in firmware: $($Processor.VirtualizationFirmwareEnabled)"
  Write-Host ""
}

if (-not (Test-IsAdministrator)) {
  if (Invoke-SelfElevated) {
    Write-Host "Continue in the elevated PowerShell window."
    exit 0
  }

  throw "Open PowerShell as Administrator and run .\scripts\fix-windows-virtualization.cmd"
}

$Features = @(
  "Microsoft-Windows-Subsystem-Linux",
  "VirtualMachinePlatform",
  "HypervisorPlatform"
)

foreach ($Feature in $Features) {
  Write-Host "Enabling Windows feature: $Feature" -ForegroundColor Yellow
  dism.exe /online /enable-feature /featurename:$Feature /all /norestart
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "DISM returned exit code $LASTEXITCODE while enabling $Feature."
  }
}

Write-Host "Setting Windows hypervisor launch type to auto..." -ForegroundColor Yellow
bcdedit /set hypervisorlaunchtype auto
if ($LASTEXITCODE -ne 0) {
  Write-Warning "bcdedit returned exit code $LASTEXITCODE."
}

if (Test-CommandExists winget) {
  Write-Host "Installing/updating official WSL package..." -ForegroundColor Yellow
  winget install --id Microsoft.WSL -e --source winget --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "winget returned exit code $LASTEXITCODE for Microsoft.WSL. If WSL is already installed, this may be harmless."
  }
} else {
  Write-Warning "winget was not found. If WSL is still missing after restart, install it from Microsoft Store or run wsl --install."
}

Write-Host ""
Write-Host "Windows virtualization features were requested." -ForegroundColor Green
Write-Host "Now restart Windows, open Docker Desktop, and then run:"
Write-Host ".\scripts\check-prereqs.cmd"
Write-Host ".\scripts\start-dev.cmd -Detached"
Write-Host ""
Write-Host "If Docker still says virtualization support is not detected after restart, enable SVM/AMD-V in BIOS."
