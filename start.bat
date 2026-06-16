@echo off
title Coffee Machine Demo Server
set URL=http://localhost:8000
set CHROME_PROFILE=%TEMP%\coffee-machine-demo-chrome
echo ===================================================
echo  Future Coffee Machine Demo - Starting Local Server
echo ===================================================
echo.
echo [1/2] Launching Python HTTP server on port 8000...
start "Coffee Machine Demo Server" /B python -m http.server 8000
timeout /t 2 /nobreak >nul

echo [2/2] Opening Chrome browser to %URL% ...
where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --autoplay-policy=no-user-gesture-required --user-data-dir="%CHROME_PROFILE%" "%URL%"
) else (
  start "" "%URL%"
)

echo (Press Ctrl+C in this terminal window to stop the server)
echo.
pause
