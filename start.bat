@echo off
echo === Asset Manager Start ===
echo.

echo Starting backend (port 8000)...
start "Backend" cmd /k "cd /d "%~dp0backend" && pip install -r requirements.txt -q && uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak > nul

echo Starting frontend (port 5173)...
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm install && npm run dev"

timeout /t 6 /nobreak > nul
start http://localhost:5173
