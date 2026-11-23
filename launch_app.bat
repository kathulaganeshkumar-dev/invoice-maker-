@echo off
set "ELECTRON_RUN_AS_NODE="
taskkill /f /im "Enterprise Management.exe" 2>nul
taskkill /f /im "Enterprise Invoice Manager.exe" 2>nul
if exist "%~dp0version 2.0\win-unpacked\Enterprise Management.exe" (
    start "" "%~dp0version 2.0\win-unpacked\Enterprise Management.exe"
) else (
    start "" "%~dp0version 2.0\win-unpacked\Enterprise Invoice Manager.exe"
)
