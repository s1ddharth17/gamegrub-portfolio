param()

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

$DockerPath = Resolve-DockerPath
if (-not $DockerPath) {
  throw "Docker CLI was not found. Run .\scripts\install-prereqs.ps1 first."
}

& $DockerPath compose run --rm backend npm test
