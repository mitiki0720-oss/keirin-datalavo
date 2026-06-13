@echo off
setlocal
set "TASK_NAME=KURARI Keirin EX Raw Input Watcher"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$task=Get-ScheduledTask -TaskName $env:TASK_NAME -ErrorAction SilentlyContinue;" ^
  "if(-not $task){Write-Host ('Task is not installed: ' + $env:TASK_NAME);exit 0};" ^
  "Unregister-ScheduledTask -TaskName $env:TASK_NAME -Confirm:$false;" ^
  "Write-Host ('Uninstalled task: ' + $env:TASK_NAME)"
exit /b %ERRORLEVEL%
