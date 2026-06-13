@echo off
cd /d "%~dp0.."
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-keirin-prediction-exports.ps1"
