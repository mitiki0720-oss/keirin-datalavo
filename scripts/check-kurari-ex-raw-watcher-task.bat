@echo off
setlocal
set "TASK_NAME=KURARI Keirin EX Raw Input Watcher"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$task=Get-ScheduledTask -TaskName $env:TASK_NAME -ErrorAction SilentlyContinue;" ^
  "if(-not $task){Write-Host ('Task is not installed: ' + $env:TASK_NAME);exit 1};" ^
  "$task | Format-List TaskName,State;" ^
  "$task.Actions | Format-List Execute,Arguments;" ^
  "$task.Triggers | Format-List Enabled,UserId"
exit /b %ERRORLEVEL%
