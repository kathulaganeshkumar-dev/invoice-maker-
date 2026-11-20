@echo off
set "ELECTRON_RUN_AS_NODE="
taskkill /f /im "Enterprise Invoice Manager.exe" 2>nul
start "" "c:\Users\kathu\OneDrive\Desktop\new invoice\version 2.0\win-unpacked\Enterprise Invoice Manager.exe"
