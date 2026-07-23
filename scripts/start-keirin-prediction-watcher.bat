@echo off
cd /d "%~dp0.."
start "Keirin Prediction Watcher" powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-keirin-prediction-exports.ps1"
