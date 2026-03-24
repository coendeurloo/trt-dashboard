@echo off
setlocal

cd /d "%~dp0"

echo Bestaande dev server(s) stoppen op poort 5173/5174...
for %%P in (5173 5174) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>&1
  )
)

timeout /t 1 /nobreak >nul

echo Dev server opnieuw starten...
call "%~dp0start-dev.bat"
