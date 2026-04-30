@echo off
setlocal

cd /d "%~dp0"

set STATUS_FILE=%TEMP%\kurari-race-data-status.txt

echo ============================== >> scripts\update-log.txt
echo [%date% %time%] update start >> scripts\update-log.txt

node scripts\update-today-races.mjs >> scripts\update-log.txt 2>&1

if errorlevel 1 (
  echo [%date% %time%] node update failed >> scripts\update-log.txt
  exit /b 1
)

git status --porcelain public/data/races/today.generated.json > "%STATUS_FILE%"

for %%A in ("%STATUS_FILE%") do if %%~zA==0 (
  echo [%date% %time%] no race data changes >> scripts\update-log.txt
  del "%STATUS_FILE%" >nul 2>&1
  exit /b 0
)

del "%STATUS_FILE%" >nul 2>&1

git add public/data/races/today.generated.json >> scripts\update-log.txt 2>&1
git commit -m "Update today race data" >> scripts\update-log.txt 2>&1

if errorlevel 1 (
  echo [%date% %time%] git commit failed >> scripts\update-log.txt
  exit /b 1
)

git push >> scripts\update-log.txt 2>&1

if errorlevel 1 (
  echo [%date% %time%] git push failed >> scripts\update-log.txt
  exit /b 1
)

echo [%date% %time%] update and push complete >> scripts\update-log.txt
exit /b 0