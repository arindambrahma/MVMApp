@echo off
REM Stop any process listening on port 5001 (best-effort)
echo Stopping any process on port 5001...
for /F "tokens=5" %%A in ('netstat -ano ^| findstr :5001') do (
  echo Killing PID %%A
  taskkill /PID %%A /F
)
REM Small pause to ensure processes terminate
TIMEOUT /T 2 /NOBREAK > NUL

REM Start backend using the local Python in the venv
echo Starting backend from repository root
cd /D "%~dp0.."
IF EXIST backend\app.py (
  echo Activating Python virtual environment (if present) and launching server...
  IF EXIST backend\.venv\Scripts\activate.bat (
    CALL backend\.venv\Scripts\activate.bat
  )
  python backend/app.py
ELSE (
  echo backend/app.py not found. Aborting.
  EXIT /B 1
)
