// electron/main.ts - Secure Electron Desktop Application Lifecycle
import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, Tray, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  LanDesktopConfig,
  loadLanConfig,
  saveLanConfig,
  getLocalLanIps,
  testLanHostConnection,
} from './lanConfig';

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
let tray: Tray | null = null;
let isQuitting = false;
let hasShownTrayHint = false;
let activeLanConfig: LanDesktopConfig = {
  role: 'STANDALONE',
  hostIp: '',
  port: 4200,
  deviceId: '',
  deviceName: 'Office PC',
  minimizeToTray: true,
  autoStartOnBoot: false,
};
let activeAppOrigin = 'http://127.0.0.1:4200';
const launchedHidden = process.argv.includes('--hidden');

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

    // 2. Load Direct Desktop-to-Desktop LAN configuration
    activeLanConfig = loadLanConfig(resolvedDataDir);
    console.log('[Electron] Loaded LAN config:', activeLanConfig.role, activeLanConfig.hostIp || 'local', activeLanConfig.port);

    let connectToRemoteHost = false;
    if (activeLanConfig.role === 'LAN_CLIENT' && activeLanConfig.hostIp) {
      let resolvedRemote = false;
      while (!resolvedRemote) {
        const probe = await testLanHostConnection(activeLanConfig.hostIp, activeLanConfig.port, 3500);
        if (probe.success) {
          connectToRemoteHost = true;
          activeAppOrigin = `http://${activeLanConfig.hostIp}:${activeLanConfig.port}`;
          console.log(`[Electron] Connected to Main Office PC at ${activeAppOrigin}`);
          resolvedRemote = true;
        } else {
          const choice = await dialog.showMessageBox({
            type: 'warning',
            title: 'Main Office PC Unreachable',
            message: `Could not connect to Main Office PC at ${activeLanConfig.hostIp}:${activeLanConfig.port}.`,
            detail:
              'Make sure the Main Office PC is powered on, Enterprise Invoice Manager is open in "Main Office PC (Host)" mode, and both computers are on the same office network.',
            buttons: ['Retry Connection', 'Open Standalone Mode (Local PC)', 'Exit'],
            defaultId: 0,
            cancelId: 2,
          });
          if (choice.response === 0) {
            continue;
          } else if (choice.response === 1) {
            resolvedRemote = true;
            connectToRemoteHost = false;
            activeLanConfig.role = 'STANDALONE';
            try {
              saveLanConfig(resolvedDataDir, activeLanConfig);
              console.log('[Electron] Switched to STANDALONE mode and updated lan-config.json');
            } catch (saveErr) {
              console.warn('[Electron] Failed to update lan config to STANDALONE:', saveErr);
            }
          } else {
            app.quit();
            return;
          }
        }
      }
    }

    // 3. Start local embedded backend server (unless connected as a remote LAN Client)
    if (!connectToRemoteHost) {
      process.env.SERVER_HOST = activeLanConfig.role === 'LAN_HOST' ? '0.0.0.0' : '127.0.0.1';
      try {
        await startServer(activeLanConfig.port || 4200);
        const boundPort = process.env.ACTUAL_SERVER_PORT || String(activeLanConfig.port || 4200);
        activeAppOrigin = `http://127.0.0.1:${boundPort}`;
        console.log(`[Server] Backend successfully started on ${process.env.SERVER_HOST}:${boundPort}`);
      } catch (err: any) {
        console.warn('[Server] Server active or bound:', err.message);
        const boundPort = process.env.ACTUAL_SERVER_PORT || String(activeLanConfig.port || 4200);
        activeAppOrigin = `http://127.0.0.1:${boundPort}`;
      }
    }

    // 4. Create system tray for background Office Host mode & create main window
    if (activeLanConfig.role === 'LAN_HOST' && activeLanConfig.minimizeToTray) {
      ensureHostTray();
    }
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

function loadSavedSoftwareIcon() {
  try {
    const candidatePaths = [
      path.join(resolvedDataDir, 'icons', 'software_icon.png'),
      path.join(app.getPath('userData'), 'data', 'icons', 'software_icon.png'),
    ];
    for (const iconPath of candidatePaths) {
      if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          return img;
        }
      }
    }
  } catch (err) {
    console.warn('[Electron] Could not load saved software icon:', err);
  }
  return undefined;
}

function getTrayIconImage() {
  const saved = loadSavedSoftwareIcon();
  if (saved && !saved.isEmpty()) return saved.resize({ width: 16, height: 16 });
  // Built-in crisp 16x16 blue PNG fallback icon so Tray always renders cleanly on Windows
  const fallbackSvg =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2563eb"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="20" font-family="Arial" font-weight="bold">E</text></svg>'
    ).toString('base64');
  return nativeImage.createFromDataURL(fallbackSvg).resize({ width: 16, height: 16 });
}

function ensureHostTray() {
  if (tray) return;
  try {
    tray = new Tray(getTrayIconImage());
    const ips = getLocalLanIps();
    const port = process.env.ACTUAL_SERVER_PORT || String(activeLanConfig.port || 4200);
    const ipLabel = ips.length > 0 ? `${ips[0]}:${port}` : `Port ${port}`;
    tray.setToolTip(`Enterprise Invoice Manager — Office Host Active (${ipLabel})`);

    const menu = Menu.buildFromTemplate([
      {
        label: `Office Host Running (${ipLabel})`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Enterprise Invoice Manager',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow().catch(() => {});
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Office Host Server',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('[Electron] Could not initialize system tray:', err);
  }
}

async function createMainWindow() {
  const savedIcon = loadSavedSoftwareIcon();
  const startHiddenInTray = launchedHidden && activeLanConfig.role === 'LAN_HOST' && activeLanConfig.minimizeToTray;
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: 'Enterprise Invoice & Business Management System',
    ...(savedIcon ? { icon: savedIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: false,
    show: !startHiddenInTray,
    backgroundColor: '#ffffff',
  });

  // Secure Window Open Handler: Deny in-app new windows and open external http/https links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url).catch((err) => console.error('[Electron] Failed to open external URL:', err));
    }
    return { action: 'deny' };
  });

  // Navigation Guard: Prevent top-level navigation away from the active local or configured LAN office server
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const activePort = process.env.ACTUAL_SERVER_PORT || String(activeLanConfig.port || 4200);
    let isAllowed = false;
    try {
      const parsed = new URL(url);
      const targetOrigin = `${parsed.protocol}//${parsed.host}`;
      if (targetOrigin === activeAppOrigin) {
        isAllowed = true;
      } else if (
        parsed.protocol === 'http:' &&
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        parsed.port === activePort
      ) {
        isAllowed = true;
      } else if (parsed.protocol === 'file:' && parsed.pathname.endsWith('/dist/index.html')) {
        isAllowed = true;
      }
    } catch {
      isAllowed = false;
    }

    if (!isAllowed) {
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
    if (mainWindow && !startHiddenInTray) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
    }
  });

  const appUrl = activeAppOrigin || `http://127.0.0.1:${process.env.ACTUAL_SERVER_PORT || '4200'}`;
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

  // Ensure window is visible (unless auto-started silently in Host System Tray mode)
  if (mainWindow && !mainWindow.isVisible() && !startHiddenInTray) {
    mainWindow.show();
    mainWindow.focus();
  }

  // Minimize to System Tray on close when running as Office LAN Host so staff PCs stay connected
  mainWindow.on('close', (event) => {
    if (!isQuitting && activeLanConfig.role === 'LAN_HOST' && activeLanConfig.minimizeToTray) {
      event.preventDefault();
      ensureHostTray();
      mainWindow?.hide();
      if (tray && !hasShownTrayHint && process.platform === 'win32') {
        hasShownTrayHint = true;
        try {
          tray.displayBalloon({
            title: 'Enterprise Invoice Manager — Office Host Active',
            content:
              'Running quietly in the system tray so office staff PCs stay connected. Right-click this tray icon to quit completely.',
          });
        } catch {
          // ignore balloon errors
        }
      }
    }
  });

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

ipcMain.handle('app:set-software-icon', async (event, dataUrl: string | null) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win || win.isDestroyed()) return false;
    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      const img = nativeImage.createFromDataURL(dataUrl);
      if (!img.isEmpty()) {
        win.setIcon(img);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('[Electron] Failed to update live window icon:', err);
    return false;
  }
});

// Direct Desktop-to-Desktop LAN IPC Handlers (stored locally per PC)
ipcMain.handle('app:get-lan-config', async () => {
  const config = loadLanConfig(resolvedDataDir);
  return {
    config,
    localIps: getLocalLanIps(),
    connectedUrl: activeAppOrigin,
    isElectron: true,
  };
});

ipcMain.handle('app:set-lan-config', async (_event, nextConfig: Partial<LanDesktopConfig>) => {
  const saved = saveLanConfig(resolvedDataDir, nextConfig || {});
  activeLanConfig = saved;

  // Configure Windows auto-start in background tray when Host Mode + autoStartOnBoot is enabled
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      const enableAutoStart = Boolean(saved.role === 'LAN_HOST' && saved.autoStartOnBoot);
      app.setLoginItemSettings({
        openAtLogin: enableAutoStart,
        args: enableAutoStart ? ['--hidden'] : [],
      });
    }
  } catch (err) {
    console.warn('[Electron] Unable to update OS login auto-start setting:', err);
  }

  if (saved.role === 'LAN_HOST' && saved.minimizeToTray) {
    ensureHostTray();
  }

  return {
    success: true,
    config: saved,
    localIps: getLocalLanIps(),
  };
});

ipcMain.handle('app:test-lan-host', async (_event, hostIp: string, port?: number) => {
  return testLanHostConnection(hostIp, port || 4200);
});

ipcMain.handle('app:relaunch', async () => {
  isQuitting = true;
  app.relaunch();
  app.exit(0);
  return true;
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (activeLanConfig.role === 'LAN_HOST' && activeLanConfig.minimizeToTray && !isQuitting) {
    return; // Keep running silently in system tray for office staff PCs
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
