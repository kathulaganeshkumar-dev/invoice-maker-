@echo off
set ELECTRON_RUN_AS_NODE=
if exist "%~dp0..\version 2.0\win-unpacked\Enterprise Management.exe" (
    start "" "%~dp0..\version 2.0\win-unpacked\Enterprise Management.exe" %*
) else (
    start "" "%~dp0..\version 2.0\win-unpacked\Enterprise Invoice Manager.exe" %*
)
