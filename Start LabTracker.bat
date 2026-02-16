@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is niet gevonden.
  echo Installeer eerst Node.js LTS via https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Dependencies installeren...
  call npm install
  if errorlevel 1 (
    echo Installatie mislukt.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo App builden...
  call npm run build
  if errorlevel 1 (
    echo Build mislukt.
    pause
    exit /b 1
  )
)

node scripts\server-control.mjs start --open
if errorlevel 1 (
  echo Starten mislukt.
  pause
  exit /b 1
)

echo LabTracker draait op http://127.0.0.1:4173
echo Je kunt dit venster sluiten.
exit /b 0
