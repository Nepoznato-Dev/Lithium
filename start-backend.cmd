@echo off
title Lithium Dev Server
color 0B

echo ============================================
echo   Starting Lithium Development Environment
echo ============================================
echo.

REM --- Kill any existing processes on our ports ---
echo [1/3] Stopping existing processes...

REM Kill backend (port 8734)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8734" ^| findstr "LISTENING" 2^>nul') do (
    echo   Killing backend PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill Vite dev server (port 5173)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING" 2^>nul') do (
    echo   Killing Vite PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill any stray python processes running run.py
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq python.exe" /fo csv /nh 2^>nul ^| findstr /i "run.py"') do (
    echo   Killing stray python %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 1 /nobreak >nul
echo   Done.
echo.

echo [2/3] Starting backend on http://127.0.0.1:8734 ...
start "Lithium Backend" cmd /k "cd /d "%~dp0backend" && python run.py"

timeout /t 2 /nobreak >nul

echo [3/3] Starting Vite dev server and opening browser...
echo.
cd /d "%~dp0"
npx vite --open
