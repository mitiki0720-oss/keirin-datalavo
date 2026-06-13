@echo off
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-keirin-prediction-exports.ps1" -Once
exit /b %ERRORLEVEL%
