@echo off
setlocal
set "TASK_NAME=KURARI Keirin Prediction Export Watcher"

schtasks /Query /TN "%TASK_NAME%" /FO LIST /V
if errorlevel 1 (
  echo Task is not installed: %TASK_NAME%
  exit /b 1
)
exit /b 0
