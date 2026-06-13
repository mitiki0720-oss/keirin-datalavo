@echo off
setlocal
set "TASK_NAME=KURARI Keirin Prediction Export Watcher"

schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
  echo Task is not installed: %TASK_NAME%
  exit /b 0
)

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator permission to uninstall the scheduled task...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b %ERRORLEVEL%
)

schtasks /Delete /F /TN "%TASK_NAME%"
if errorlevel 1 exit /b 1
echo Uninstalled task: %TASK_NAME%
exit /b 0
