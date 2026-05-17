@echo off
setlocal

set "PROJECT_DIR=C:\Users\gwhag\OneDrive\바탕 화면\자산관리"

echo === Asset Manager Start ===
echo.

echo Starting backend (port 8000)...
start "Backend" cmd /k "cd /d ""%PROJECT_DIR%\backend"" && pip install -r requirements.txt -q && set LOCAL_DB_ONLY=true && uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak > nul

echo Starting frontend (port 5173)...
start "Frontend" cmd /k "cd /d ""%PROJECT_DIR%\frontend"" && npm install && npm run dev"

timeout /t 6 /nobreak > nul
start http://localhost:5173
