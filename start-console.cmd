@echo off
REM Stable launcher for the Hauska spine console (vite dev server).
REM Double-click this, or run it from a terminal. It stays up until you close the window.
cd /d "%~dp0"
echo Starting Hauska spine console on http://localhost:5173/ ...
call npm run dev
