@echo off
cd /d "%USERPROFILE%\Desktop\ehsan-ai"
if not exist server.js (
echo Error: server.js not found!
pause
exit /b 1
)
start "" http://localhost:3000
node server.js
pause