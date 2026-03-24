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

echo Dev server starten...
call npm run dev
