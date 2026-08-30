@echo off
rem Launch the Lithium Python backend OUTSIDE the IDE so it has full internet
rem access (the IDE's sandboxed terminal blocks network for long-running apps).
cd /d "%~dp0backend"
echo Starting Lithium backend on http://127.0.0.1:8734 ...
python run.py
pause
