@echo off
setlocal
title VLT Profiles - Connecteur local
if not exist "%~dp0server.mjs" (
  echo Extrais tout le ZIP avant de lancer Demarrer.cmd.
  pause
  exit /b 1
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 22 ou plus recent depuis https://nodejs.org/
  pause
  exit /b 1
)
rem Explorer may still have an older PATH after PowerShell installation.
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PATH=%ProgramFiles%\PowerShell\7;%PATH%"
if exist "%LOCALAPPDATA%\Programs\PowerShell\7\pwsh.exe" set "PATH=%LOCALAPPDATA%\Programs\PowerShell\7;%PATH%"
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  echo Installe PowerShell 7 depuis https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows
  pause
  exit /b 1
)
echo Demarrage de VLT Profiles. Garde cette fenetre ouverte.
node.exe "%~dp0server.mjs"
pause
