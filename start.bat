@echo off
REM Start the portfolio server (needs Node.js) and open the site + dashboard.
REM The dashboard saves into data\content.json and rebuilds assets\projects.js.
cd /d "%~dp0"
start "" http://localhost:3000/
start "" http://localhost:3000/admin.html
node server.js
pause
