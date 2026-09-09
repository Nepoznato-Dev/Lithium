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

timeout /t 1 /nobreak >nul
echo   Done.
echo.

REM --- Build the Rust server if needed ---
echo [2/3] Building Rust server...
cd /d "%~dp0rust"

REM Check if CC/AR need to be set for MinGW
if exist "C:\Users\PC\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin\gcc.exe" (
    set "CC=C:\Users\PC\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin\gcc.exe"
    set "AR=C:\Users\PC\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin\ar.exe"
)

cargo build -p lithium-server 2>nul
if errorlevel 1 (
    echo   Build failed! Trying without custom CC/AR...
    set "CC="
    set "AR="
    cargo build -p lithium-server
    if errorlevel 1 (
        echo   ERROR: Rust server build failed.
        pause
        exit /b 1
    )
)
echo   Build complete.
echo.

echo [3/3] Starting Rust server on http://127.0.0.1:8734 ...
start "Lithium Backend" cmd /k "cd /d "%~dp0rust" && "%~dp0rust\target\debug\lithium-server.exe""

timeout /t 2 /nobreak >nul

echo Starting Vite dev server and opening browser...
echo.
cd /d "%~dp0"
npx vite --open
