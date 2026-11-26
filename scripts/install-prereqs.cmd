@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-prereqs.ps1" %*
exit /b %ERRORLEVEL%
