// electron/preload.ts - Secure Preload Context Isolation Bridge
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  printDocument: () => ipcRenderer.invoke('app:print'),
  getPrinters: () => ipcRenderer.invoke('app:get-printers'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  setSoftwareIcon: (dataUrl: string | null) => ipcRenderer.invoke('app:set-software-icon', dataUrl),
  getLanConfig: () => ipcRenderer.invoke('app:get-lan-config'),
  setLanConfig: (config: {
    role: 'STANDALONE' | 'LAN_HOST' | 'LAN_CLIENT';
    hostIp?: string;
    port?: number;
    deviceName?: string;
    staffName?: string;
    minimizeToTray?: boolean;
    autoStartOnBoot?: boolean;
  }) => ipcRenderer.invoke('app:set-lan-config', config),
  testLanHost: (hostIp: string, port?: number) => ipcRenderer.invoke('app:test-lan-host', hostIp, port),
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),
  getAppVersion: () => ipcRenderer.invoke('app:get-app-version'),
  installOfflineUpdate: (opts?: { filePath?: string }) => ipcRenderer.invoke('app:install-offline-update', opts),
  exportUpdatePackage: () => ipcRenderer.invoke('app:export-update-package'),
  updateFromLan: () => ipcRenderer.invoke('app:update-from-lan'),
});
