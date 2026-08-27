@echo off
chcp 65001 >nul 2>&1
setlocal
title Ktema es Aei - Setup
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto RUN

:NONODE
cls
type "NODE-REQUIRED.txt" 2>nul
echo.
where winget >nul 2>nul
if errorlevel 1 goto MANUAL

choice /c YN /n /m "  [Y] install now   [N] cancel  >  "
if errorlevel 2 goto MANUAL
echo.
echo   installing Node.js LTS ...
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.
set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto RUN
echo.
echo   Node.js installed. Close this window and run SETUP.bat again.
echo.
pause
exit /b 0

:MANUAL
echo.
echo   Opening https://nodejs.org ...
start "" "https://nodejs.org"
echo   Install the LTS version, then run SETUP.bat again.
echo.
pause
exit /b 1

:RUN
node "%~dp0setup.mjs"
echo.
pause
