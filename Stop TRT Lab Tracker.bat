@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is niet gevonden.
  pause
  exit /b 1
)

node scripts\server-control.mjs stop
if errorlevel 1 (
  echo Stoppen mislukt.
  pause
  exit /b 1
)

echo TRT Lab Tracker is gestopt.
exit /b 0
