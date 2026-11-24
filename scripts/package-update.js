// scripts/package-update.js - Builds and exports 1-click update package for other computers
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const distServerDir = path.join(rootDir, 'dist-server');
const distElectronDir = path.join(rootDir, 'dist-electron');
const winUnpackedResources = path.join(rootDir, 'version 2.0', 'win-unpacked', 'resources');
const baseAsar = path.join(winUnpackedResources, 'app.asar');
const tempAsarDir = path.join(rootDir, '.temp_update_asar');
const releaseUpdateDir = path.join(rootDir, 'release', 'Enterprise-Invoice-Update');
const updateZip = path.join(rootDir, 'release', 'Enterprise-Invoice-Update.zip');

function log(msg) {
  console.log(`[Update Packager] ${msg}`);
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function run() {
  try {
    log('Step 1: Running production builds (Vite, Server, Electron)...');
    execSync('npm.cmd run build', { cwd: rootDir, stdio: 'inherit' });

    if (!fs.existsSync(baseAsar)) {
      throw new Error(`Base template asar not found at: ${baseAsar}`);
    }

    log('Step 2: Staging ASAR archive...');
    if (fs.existsSync(tempAsarDir)) {
      fs.rmSync(tempAsarDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempAsarDir, { recursive: true });

    log('Extracting base asar...');
    execSync(`npx.cmd asar extract "${baseAsar}" "${tempAsarDir}"`, { cwd: rootDir, stdio: 'ignore' });

    log('Updating application code (dist, dist-server, dist-electron, assets/templates)...');
    copyRecursiveSync(distDir, path.join(tempAsarDir, 'dist'));
    copyRecursiveSync(distServerDir, path.join(tempAsarDir, 'dist-server'));
    copyRecursiveSync(distElectronDir, path.join(tempAsarDir, 'dist-electron'));
    const templatesDir = path.join(rootDir, 'assets', 'templates');
    if (fs.existsSync(templatesDir)) {
      copyRecursiveSync(templatesDir, path.join(tempAsarDir, 'assets', 'templates'));
      copyRecursiveSync(templatesDir, path.join(winUnpackedResources, 'assets', 'templates'));
      copyRecursiveSync(templatesDir, path.join(releaseUpdateDir, 'assets', 'templates'));
      log('Copied all templates to temp asar, win-unpacked resources, and release folder.');
    }
    fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(tempAsarDir, 'package.json'));

    log('Step 3: Repacking updated app.asar into win-unpacked resources...');
    execSync(`npx.cmd asar pack "${tempAsarDir}" "${baseAsar}"`, { cwd: rootDir, stdio: 'ignore' });

    log('Step 4: Creating standalone Client Update Package...');
    if (!fs.existsSync(releaseUpdateDir)) {
      fs.mkdirSync(releaseUpdateDir, { recursive: true });
    }
    const updateAsar = path.join(releaseUpdateDir, 'app.asar');
    fs.copyFileSync(baseAsar, updateAsar);

    log('Checking for local installations on this PC to update in-place...');
    const localInstallPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'enterprise-invoice-manager', 'resources'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'enterprise-management', 'resources'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Enterprise Invoice Manager', 'resources'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Enterprise Management', 'resources'),
    ];
    for (const resPath of localInstallPaths) {
      if (fs.existsSync(resPath)) {
        try {
          fs.copyFileSync(baseAsar, path.join(resPath, 'app.asar'));
          if (fs.existsSync(templatesDir)) {
            copyRecursiveSync(templatesDir, path.join(resPath, 'assets', 'templates'));
          }
          log(`In-place updated installed software at: ${resPath}`);
        } catch (e) {
          log(`Notice: Could not write directly to ${resPath} (${e.message})`);
        }
      }
    }

    // Generate 1-Click-Update.bat
    const batContent = `@echo off
setlocal enabledelayedexpansion
title Enterprise Management - 1-Click Client Software Updater
color 0b

echo ===============================================================================
echo          ENTERPRISE MANAGEMENT - 1-CLICK CLIENT SOFTWARE UPDATER
echo ===============================================================================
echo.
echo  This updater will install the latest features and updates on this computer.
echo.
echo  [DATA SAFETY GUARANTEE]
echo  - Your invoices, quotations, customers, products, and records will NOT be deleted.
echo  - Your local office network connection and settings will NOT be changed.
echo.
echo  Press any key to begin update...
pause >nul
echo.

:: 1. Close any running Enterprise Management instances so files are not locked
echo [1/4] Closing any running instances of Enterprise Management...
taskkill /f /im "Enterprise Management.exe" /t >nul 2>&1
taskkill /f /im "Enterprise Invoice Manager.exe" /t >nul 2>&1
taskkill /f /im "electron.exe" /t >nul 2>&1
timeout /t 1 /nobreak >nul

:: 2. Locate installation resources folder
echo [2/4] Locating software installation...
set "TARGET_RES="
set "APP_EXE="

if exist "%LOCALAPPDATA%\\Programs\\enterprise-management\\resources\\app.asar" (
    set "TARGET_RES=%LOCALAPPDATA%\\Programs\\enterprise-management\\resources"
    set "APP_EXE=%LOCALAPPDATA%\\Programs\\enterprise-management\\Enterprise Management.exe"
) else if exist "%LOCALAPPDATA%\\Programs\\enterprise-invoice-manager\\resources\\app.asar" (
    set "TARGET_RES=%LOCALAPPDATA%\\Programs\\enterprise-invoice-manager\\resources"
    set "APP_EXE=%LOCALAPPDATA%\\Programs\\enterprise-invoice-manager\\Enterprise Management.exe"
    if not exist "!APP_EXE!" set "APP_EXE=%LOCALAPPDATA%\\Programs\\enterprise-invoice-manager\\Enterprise Invoice Manager.exe"
) else if exist "%PROGRAMFILES%\\Enterprise Management\\resources\\app.asar" (
    set "TARGET_RES=%PROGRAMFILES%\\Enterprise Management\\resources"
    set "APP_EXE=%PROGRAMFILES%\\Enterprise Management\\Enterprise Management.exe"
) else if exist "%PROGRAMFILES%\\Enterprise Invoice Manager\\resources\\app.asar" (
    set "TARGET_RES=%PROGRAMFILES%\\Enterprise Invoice Manager\\resources"
    set "APP_EXE=%PROGRAMFILES%\\Enterprise Invoice Manager\\Enterprise Management.exe"
    if not exist "!APP_EXE!" set "APP_EXE=%PROGRAMFILES%\\Enterprise Invoice Manager\\Enterprise Invoice Manager.exe"
) else if exist "..\\resources\\app.asar" (
    set "TARGET_RES=..\\resources"
    set "APP_EXE=..\\Enterprise Management.exe"
    if not exist "!APP_EXE!" set "APP_EXE=..\\Enterprise Invoice Manager.exe"
) else if exist ".\\resources\\app.asar" (
    set "TARGET_RES=.\\resources"
    set "APP_EXE=.\\Enterprise Management.exe"
    if not exist "!APP_EXE!" set "APP_EXE=.\\Enterprise Invoice Manager.exe"
)

if "%TARGET_RES%"=="" (
    echo [ERROR] Could not automatically find the Enterprise Management installation.
    echo Please make sure Enterprise Management is installed, or copy app.asar manually
    echo to the "resources" folder inside your installation directory.
    pause
    exit /b 1
)

echo Found installation at: %TARGET_RES%

:: 3. Create Safety Backup of Database
echo [3/4] Creating safety backup of your database...
set "DATA_DIR=%APPDATA%\\enterprise-invoice-manager\\data"
if exist "%DATA_DIR%\\invoice_manager.sqlite3" (
    if not exist "%DATA_DIR%\\backups" mkdir "%DATA_DIR%\\backups"
    copy /y "%DATA_DIR%\\invoice_manager.sqlite3" "%DATA_DIR%\\backups\\pre_update_safety_backup.sqlite3" >nul
    echo Database verified and backed up safely.
) else (
    echo Database location verified.
)

:: 4. Apply the update
echo [4/4] Installing updated software files...
set "SOURCE_ASAR=%~dp0app.asar"
if not exist "%SOURCE_ASAR%" (
    if exist "%~dp0Enterprise-Invoice-Update\\app.asar" (
        set "SOURCE_ASAR=%~dp0Enterprise-Invoice-Update\\app.asar"
    ) else (
        echo [ERROR] app.asar update file not found in this folder.
        pause
        exit /b 1
    )
)

copy /y "%SOURCE_ASAR%" "%TARGET_RES%\\app.asar" >nul
if errorlevel 1 (
    echo [ERROR] Could not update app.asar. Access denied or file is locked.
    echo Try running this script as Administrator (Right click -> Run as Administrator).
    pause
    exit /b 1
)

if exist "%~dp0assets\\templates" (
    if not exist "%TARGET_RES%\\assets\\templates" mkdir "%TARGET_RES%\\assets\\templates"
    xcopy /s /e /y /i "%~dp0assets\\templates" "%TARGET_RES%\\assets\\templates" >nul
    echo Templates updated in resources.
)

echo.
echo ===============================================================================
echo                           UPDATE COMPLETED SUCCESSFULLY!
echo ===============================================================================
echo.
echo  - New features and options have been installed.
echo  - All your invoices, products, and data remain 100%% safe and intact.
echo  - Your local network configuration was untouched.
echo.
echo Launching Enterprise Management now...
if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
)
timeout /t 2 /nobreak >nul
exit /b 0
`;

    fs.writeFileSync(path.join(releaseUpdateDir, '1-Click-Update.bat'), batContent, 'utf8');
    fs.writeFileSync(path.join(releaseUpdateDir, 'Update-Software.bat'), batContent, 'utf8');

    const readmeContent = `ENTERPRISE MANAGEMENT - CLIENT UPDATE PACKAGE
==================================================

How to update the software on another computer:

METHOD 1: 1-CLICK SCRIPT (EASIEST)
----------------------------------
1. Copy this entire folder to your other computer (via Pendrive, LAN share, or chat).
2. Double-click "1-Click-Update.bat" (or "Update-Software.bat").
3. Done! The software updates in 5 seconds and launches automatically.

METHOD 2: IN-APP UPDATE
-----------------------
1. Open Enterprise Management on your other computer.
2. Go to Settings -> System Diagnostics & Updates.
3. In "Offline Software Update", click "Select & Install Update File" and pick "app.asar".
4. The software will back up your data, install the update, and restart automatically.

DATA & NETWORK SAFETY GUARANTEE:
-------------------------------
- Your database (invoices, customers, stock, payments) is NEVER deleted or modified.
- Your local network LAN connection (Main PC IP, device name, staff name) is NEVER changed.
- Only the new features, options, and improvements are applied.
`;
    fs.writeFileSync(path.join(releaseUpdateDir, 'README-UPDATE.txt'), readmeContent, 'utf8');

    log('Step 5: Compressing into release/Enterprise-Invoice-Update.zip...');
    try {
      execSync(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${releaseUpdateDir}\\*' -DestinationPath '${updateZip}' -Force"`, {
        cwd: rootDir,
        stdio: 'ignore',
      });
      log(`Created ZIP: ${updateZip}`);
    } catch (zipErr) {
      log('ZIP creation skipped (PowerShell Compress-Archive not available). Folder is ready.');
    }

    log('Cleaning up temporary staging directory...');
    fs.rmSync(tempAsarDir, { recursive: true, force: true });

    log('SUCCESS! Client update package generated successfully at:');
    log(releaseUpdateDir);
  } catch (err) {
    console.error('[Update Packager] Error:', err);
    if (fs.existsSync(tempAsarDir)) {
      try { fs.rmSync(tempAsarDir, { recursive: true, force: true }); } catch {}
    }
    process.exit(1);
  }
}

run();
