@echo off
title VLT Profiles - Connecteur local
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 22 ou plus recent depuis https://nodejs.org/
  pause
  exit /b 1
)
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  echo Installe PowerShell 7 depuis https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows
  pause
  exit /b 1
)
node.exe "%~dp0server.mjs"
pause
