$mailpitCandidates = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\mailpit.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\axllent.mailpit_Microsoft.Winget.Source_8wekyb3d8bbwe\mailpit.exe"
)

$mailpitPath = $mailpitCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $mailpitPath) {
    throw "Mailpit executable not found. Install it with: winget install --id axllent.mailpit -e --accept-package-agreements --accept-source-agreements"
}

$smtpBind = "127.0.0.1:1025"
$uiBind = "127.0.0.1:8025"

$existingProcess = Get-CimInstance Win32_Process -Filter "name = 'mailpit.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($smtpBind) -and $_.CommandLine -match [regex]::Escape($uiBind) } |
    Select-Object -First 1

if ($existingProcess) {
    Write-Output "Mailpit is already running."
    Write-Output "SMTP: $smtpBind"
    Write-Output "UI:   http://localhost:8025"
    exit 0
}

$process = Start-Process -FilePath $mailpitPath -ArgumentList @("--smtp", $smtpBind, "--listen", $uiBind) -PassThru

Start-Sleep -Seconds 2

if ($process.HasExited) {
    throw "Mailpit exited before it finished starting."
}

Write-Output "Mailpit started."
Write-Output "PID:  $($process.Id)"
Write-Output "SMTP: $smtpBind"
Write-Output "UI:   http://localhost:8025"
