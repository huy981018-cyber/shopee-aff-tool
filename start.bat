@echo off
start "Python Server" python -m http.server 8080
timeout /t 2 /nobreak >nul
start "Ngrok" cmd /k "cd /d D:\Program Files\ngrok && ngrok http 8080 --domain=flavoring-dreamland-january.ngrok-free.dev"
