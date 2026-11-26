param()

$ErrorActionPreference = "Stop"

$Failed = @()

function Test-HttpResource {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Url,
    [ValidateSet("Get", "Head")][string]$Method = "Get"
  )

  try {
    $Response = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing -TimeoutSec 15
    if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 300) {
      Write-Host "[FAIL] $Name -> $Url ($($Response.StatusCode))" -ForegroundColor Red
      $script:Failed += $Name
      return $null
    }

    Write-Host "[OK]   $Name -> $Url ($($Response.StatusCode))" -ForegroundColor Green
    return $Response
  } catch {
    Write-Host "[FAIL] $Name -> $Url ($($_.Exception.Message))" -ForegroundColor Red
    $script:Failed += $Name
    return $null
  }
}

function Test-AppAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$AssetPath
  )

  $AssetUrl = [System.Uri]::new([System.Uri]$BaseUrl, $AssetPath).AbsoluteUri
  Test-HttpResource -Name $Name -Url $AssetUrl -Method Head | Out-Null
}

$Backend = Test-HttpResource -Name "Backend health" -Url "http://localhost:3001/health"
if ($Backend) {
  try {
    $Health = $Backend.Content | ConvertFrom-Json
    if ($Health.status -ne "ok") {
      throw "Expected backend health status 'ok', received '$($Health.status)'"
    }
    Write-Host "[OK]   Backend returned a healthy JSON response" -ForegroundColor Green
  } catch {
    Write-Host "[FAIL] Backend health response is invalid ($($_.Exception.Message))" -ForegroundColor Red
    $Failed += "Backend health response"
  }
}

$AdminBaseUrl = "http://localhost:3000/"
$Admin = Test-HttpResource -Name "Admin dashboard" -Url $AdminBaseUrl
if ($Admin) {
  if ($Admin.Content -notmatch '<div\s+id="root"\s*>\s*</div>') {
    Write-Host "[FAIL] Admin dashboard did not return its application root" -ForegroundColor Red
    $Failed += "Admin dashboard markup"
  } else {
    $AdminBundle = [regex]::Match($Admin.Content, '<script[^>]+src="([^"]+\.js)"')
    if (-not $AdminBundle.Success) {
      Write-Host "[FAIL] Admin dashboard JavaScript bundle was not referenced" -ForegroundColor Red
      $Failed += "Admin dashboard bundle"
    } else {
      Test-AppAsset -Name "Admin dashboard bundle" -BaseUrl $AdminBaseUrl -AssetPath $AdminBundle.Groups[1].Value
    }
  }
}

$UserBaseUrl = "http://localhost:3002/"
$UserApp = Test-HttpResource -Name "User app" -Url $UserBaseUrl
if ($UserApp) {
  if ($UserApp.Content -notmatch 'flutter_bootstrap\.js') {
    Write-Host "[FAIL] User app did not return the Flutter web entry point" -ForegroundColor Red
    $Failed += "User app markup"
  } else {
    Test-AppAsset -Name "Flutter web bootstrap" -BaseUrl $UserBaseUrl -AssetPath "flutter_bootstrap.js"
    Test-AppAsset -Name "Flutter app bundle" -BaseUrl $UserBaseUrl -AssetPath "main.dart.js"
  }
}

Test-HttpResource -Name "phpMyAdmin" -Url "http://localhost:8080/" | Out-Null
Test-HttpResource -Name "Mailpit" -Url "http://localhost:8025/" | Out-Null

if ($Failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Smoke test failed for: $($Failed -join ', ')" -ForegroundColor Red
  Write-Host "Inspect startup and migration failures with: docker compose logs --tail=100 backend db"
  exit 1
}

Write-Host ""
Write-Host "Docker app smoke test passed." -ForegroundColor Green
