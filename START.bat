@echo off
chcp 65001 >nul 2>&1
title Ktema es Aei
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  cls
  type "NODE-REQUIRED.txt" 2>nul
  echo.
  echo   Run SETUP.bat to install it automatically.
  echo.
  pause
  exit /b 1
)

node serve.mjs --open %*
pause
