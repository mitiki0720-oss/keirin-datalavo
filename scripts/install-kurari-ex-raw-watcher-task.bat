@echo off
setlocal
set "TASK_NAME=KURARI Keirin EX Raw Input Watcher"
set "START_SCRIPT=%~dp0start-kurari-ex-raw-watcher.bat"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action=New-ScheduledTaskAction -Execute $env:ComSpec -Argument ('/c \"\"{0}\"\"' -f $env:START_SCRIPT);" ^
  "$trigger=New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME);" ^
  "$principal=New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + '\' + $env:USERNAME) -LogonType Interactive -RunLevel Limited;" ^
  "Register-ScheduledTask -TaskName $env:TASK_NAME -Action $action -Trigger $trigger -Principal $principal -Force | Format-List TaskName,State"
if errorlevel 1 (
  echo Failed to install task: %TASK_NAME%
  exit /b 1
)
exit /b 0
