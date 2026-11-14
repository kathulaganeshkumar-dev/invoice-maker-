// electron/main.ts - Secure Electron Desktop Application Lifecycle
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

// Dynamically load the bundled standalone server or local development server
let startServer: (port?: number) => Promise<any>;
try {
  startServer = require('../dist-server/index').startServer;
} catch {
  try {
    startServer = require('../../dist-server/index').startServer;
  } catch {
    startServer = require('../src/server/index').startServer;
  }
}

let mainWindow: BrowserWindow | null = null;

function resolveWritableDir(preferredDir: string, fallbackDir: string): string {
  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    fs.accessSync(preferredDir, fs.constants.W_OK);
    return preferredDir;
  } catch (err) {
    console.warn('[Electron] Directory not writable, falling back:', preferredDir, err);
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch (innerErr) {
      console.error('[Electron] Error creating fallback directory:', innerErr);
    }
    return fallbackDir;
  }
}

// Isolate Chromium userData & single-instance lock per launch mode so dev / portable instances
// never hijack or block the installed desktop application's single-instance lock.
const defaultUserDataDir = app.getPath('userData');
let resolvedDataDir = '';

if (process.env.APP_DATA_DIR) {
  resolvedDataDir = resolveWritableDir(process.env.APP_DATA_DIR, path.join(defaultUserDataDir, 'data'));
} else if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const portableDataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
  resolvedDataDir = resolveWritableDir(portableDataDir, path.join(defaultUserDataDir, 'data'));
  if (resolvedDataDir === portableDataDir) {
    app.setPath('userData', path.join(portableDataDir, 'electron-profile'));
  }
} else if (!app.isPackaged) {
  const devUserDataDir = path.join(app.getPath('appData'), 'enterprise-invoice-manager-dev');
  app.setPath('userData', devUserDataDir);
  resolvedDataDir = resolveWritableDir(path.join(devUserDataDir, 'data'), path.join(defaultUserDataDir, 'data'));
} else {
  resolvedDataDir = resolveWritableDir(
    path.join(defaultUserDataDir, 'data'),
    path.join(app.getPath('temp'), 'enterprise-invoice-manager-data')
  );
}

process.env.APP_DATA_DIR = resolvedDataDir;

// Ensure single instance lock so multiple clicks do not collide or lock files
console.log('[Electron] Checking single instance lock...');
const gotSingleLock = app.requestSingleInstanceLock();
console.log('[Electron] Got single instance lock:', gotSingleLock);
if (!gotSingleLock) {
  console.warn('[Electron] Could not get single instance lock, quitting this instance');
  app.quit();
} else {
  app.on('second-instance', () => {
    console.log('[Electron] Second instance launched, restoring main window');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
    } else if (app.isReady()) {
      createMainWindow().catch((err) => console.error('[Electron] Failed to recreate window:', err));
    }
  });

  app.whenReady().then(async () => {
    console.log('[Electron] app.whenReady fired');
    // 1. Ensure persistent application data directory exists
    if (!fs.existsSync(resolvedDataDir)) {
      fs.mkdirSync(resolvedDataDir, { recursive: true });
    }
    process.env.APP_DATA_DIR = resolvedDataDir;

    // 2. Start backend server
    try {
      await startServer(4200);
      console.log(`[Server] Backend successfully started on port ${process.env.ACTUAL_SERVER_PORT || '4200'}`);
    } catch (err: any) {
      console.warn('[Server] Server active or bound on 4200:', err.message);
    }

    // 3. Create main window
    console.log('[Electron] Invoking createMainWindow()...');
    await createMainWindow();
    console.log('[Electron] Main window created successfully');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: 'Enterprise Invoice & Business Management System',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: false,
    show: true,
    backgroundColor: '#ffffff',
  });

  // Secure Window Open Handler: Deny in-app new windows and open external http/https links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url).catch((err) => console.error('[Electron] Failed to open external URL:', err));
    }
    return { action: 'deny' };
  });

  // Navigation Guard: Prevent top-level navigation away from the local application bundle
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (
      !url.startsWith('http://127.0.0.1:') &&
      !url.startsWith('http://localhost:') &&
      !url.startsWith('file://')
    ) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url).catch((err) => console.error('[Electron] Failed to open external URL:', err));
      }
    }
  });

  mainWindow.webContents.on('console-message', (details: any) => {
    const message = details?.message || '';
    if (message) {
      console.log(`[Renderer Console] ${message}`);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] WebContents did-finish-load');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Electron] WebContents did-fail-load: ${errorCode} - ${errorDescription}`);
  });

  mainWindow.focus();
  mainWindow.moveTop();

  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] ready-to-show event fired');
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
    }
  });

  const port = process.env.ACTUAL_SERVER_PORT || '4200';
  const appUrl = `http://127.0.0.1:${port}`;
  let loaded = false;

  console.log(`[Electron] Loading application URL: ${appUrl}`);
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      await mainWindow.loadURL(appUrl);
      loaded = true;
      console.log(`[Electron] Successfully loaded ${appUrl} on attempt ${attempt}`);
      break;
    } catch (e: any) {
      console.warn(`[Electron] Attempt ${attempt} failed: ${e.message}, retrying in 500ms...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!loaded) {
    // Fallback: try loading the static build file directly if local server port was delayed
    const candidatePaths = [
      path.resolve(__dirname, '../../../dist/index.html'),
      path.resolve(__dirname, '../../dist/index.html'),
      path.resolve(__dirname, '../dist/index.html'),
      path.join(process.cwd(), 'dist/index.html'),
    ];
    const foundPath = candidatePaths.find((p) => fs.existsSync(p));
    if (foundPath) {
      console.log(`[Electron] Loading fallback static file: ${foundPath}`);
      await mainWindow.loadFile(foundPath);
    } else {
      dialog.showErrorBox(
        'Server Launch Timeout',
        'Could not connect to the local management service. Please restart the application.'
      );
    }
  }

  // Ensure window is visible
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('app:print', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  return new Promise((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, (success) => {
      resolve(success);
    });
  });
});

ipcMain.handle('app:get-printers', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return [];
  return win.webContents.getPrintersAsync();
});

ipcMain.handle('app:open-external', async (_, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
