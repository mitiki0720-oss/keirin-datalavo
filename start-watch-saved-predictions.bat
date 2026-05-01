@echo off
cd /d "%~dp0"

echo Start saved predictions watcher.
echo Keep this window open.
echo Press Ctrl + C to stop.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-saved-predictions-and-push.ps1"

pause