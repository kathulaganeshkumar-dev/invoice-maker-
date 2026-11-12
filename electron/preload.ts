// electron/preload.ts - Secure Preload Context Isolation Bridge
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  printDocument: () => ipcRenderer.invoke('app:print'),
  getPrinters: () => ipcRenderer.invoke('app:get-printers'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
});
