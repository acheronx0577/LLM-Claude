@echo off
setlocal EnableDelayedExpansion

if /i "%~1"=="-i" goto interactive
if /i "%~1"=="--chat" goto interactive
if "%~1"=="" goto interactive

if /i "%~1"=="-p" (