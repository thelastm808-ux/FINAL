@echo off
title YouTube 4K Downloader
color 0A

echo ============================================
echo    YouTube 4K Downloader - Server Launcher
echo ============================================
echo.

:: Set project root to the directory where this bat file lives
cd /d "%~dp0"

echo [*] Checking backend virtual environment...
if not exist "backend\.venv\Scripts\python.exe" (
    echo [!] ERROR: Python virtual environment not found at backend\.venv
    echo [!] Please create it first:
    echo        cd backend
    echo        python -m venv .venv
    echo        .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo [*] Checking frontend node_modules...
if not exist "frontend\node_modules" (
    echo [!] Frontend dependencies not installed. Installing now...
    cd frontend
    call npm install
    cd ..
    echo.
)

echo [*] Checking root node_modules (concurrently)...
if not exist "node_modules" (
    echo [!] Root dependencies not installed. Installing now...
    call npm install
    echo.
)

echo.
echo ============================================
echo    Starting Backend  (FastAPI)  :8000
echo    Starting Frontend (Vite)     :5173
echo ============================================
echo.
echo    Press Ctrl+C to stop both servers.
echo.

:: Use the concurrently package from root package.json
call npm run dev
