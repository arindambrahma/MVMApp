@echo off

REM Go to project root (the folder containing this script)
cd /d "%~dp0"

echo Starting backend...
start cmd /k "cd backend && python app.py"

echo Starting frontend (Vite)...
start cmd /k "cd man-diagram-tool && npm run dev"

REM Wait a few seconds for the server to start
timeout /t 5 >nul

echo Opening browser...
start http://localhost:5173

echo Done.