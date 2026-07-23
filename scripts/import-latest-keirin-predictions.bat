@echo off
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-keirin-prediction-exports.ps1" -ImportLatest
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Keirin prediction import failed. Check the message above.
  pause
)
exit /b %EXIT_CODE%
