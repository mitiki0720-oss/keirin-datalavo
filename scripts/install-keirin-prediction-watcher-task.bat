@echo off
setlocal
set "TASK_NAME=KURARI Keirin Prediction Export Watcher"
set "START_SCRIPT=%~dp0start-keirin-prediction-watcher.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator permission to install the scheduled task...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b %ERRORLEVEL%
)

schtasks /Create /F /TN "%TASK_NAME%" /SC ONLOGON /RL LIMITED /TR "\"%START_SCRIPT%\""
if errorlevel 1 (
  echo Failed to install task: %TASK_NAME%
  exit /b 1
)

echo Installed task: %TASK_NAME%
schtasks /Query /TN "%TASK_NAME%" /FO LIST /V
exit /b 0
