@echo off
setlocal enabledelayedexpansion
cd /d %~dp0

:loop
echo [%time%] Stopping any previous Python Server and Ngrok instances...
call :killWindow "Python Server"
call :killWindow "Ngrok"
echo [%time%] Starting Python Server and Ngrok...
start "Python Server" cmd /k "cd /d %~dp0 && py relay.py"
timeout /t 2 /nobreak >nul
start "Ngrok" cmd /k "cd /d "D:\Program Files\ngrok" && ngrok http 8080 --domain=flavoring-dreamland-january.ngrok-free.dev"
echo [%time%] Waiting 15 minutes before restart...
timeout /t 900 /nobreak >nul

echo [%time%] Restarting services...
goto loop

:killWindow
set "title=%~1"
echo Killing windows with title "%title%"...
if /I "%title%"=="Ngrok" (
    echo Killing ngrok.exe process...
    taskkill /IM ngrok.exe /T /F >nul 2>&1
)

taskkill /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq %title%" /T /F >nul 2>&1
for /f "usebackq tokens=2 delims=," %%A in (`tasklist /v /fo csv ^| findstr /I /C:"%title%"`) do (
    echo Killing PID %%~A for window "%title%"...
    taskkill /PID %%~A /T /F >nul 2>&1
)
exit /b
