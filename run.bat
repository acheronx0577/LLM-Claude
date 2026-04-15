@echo off
setlocal EnableDelayedExpansion

if /i "%~1"=="-i" goto interactive
if /i "%~1"=="--chat" goto interactive
if "%~1"=="" goto interactive

if /i "%~1"=="-p" (
  "%USERPROFILE%\.bun\bin\bun.exe" run "%~dp0app\main.ts" %*
  exit /b %ERRORLEVEL%
)

"%USERPROFILE%\.bun\bin\bun.exe" run "%~dp0app\main.ts" -p %*
exit /b %ERRORLEVEL%

:interactive